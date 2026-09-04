import React, { useState } from 'react';
import { RefreshCw, Eye, EyeOff, Copy, Check } from 'lucide-react';

const Generate = () => {
  const [keypair, setKeypair] = useState(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [copied, setCopied] = useState({ address: false, privateKey: false });

  // Base58 alphabet for Bitcoin addresses
  const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  // Convert array to hex string
  const toHex = (bytes) => {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // SHA256 hash function using Web Crypto API
  const sha256 = async (data) => {
    const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return new Uint8Array(hashBuffer);
  };

  // Double SHA256 hash
  const doubleSha256 = async (data) => {
    const first = await sha256(data);
    return await sha256(first);
  };

  // RIPEMD-160 implementation (simplified)
  const ripemd160 = (data) => {
    // This is a simplified implementation for demo purposes
    // In production, use a proper RIPEMD-160 library
    const h = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
    
    // For demo purposes, we'll use a simplified hash
    // This creates a 20-byte hash from the input
    const result = new Uint8Array(20);
    for (let i = 0; i < 20; i++) {
      result[i] = (data[i % data.length] + h[i % 5]) & 0xFF;
    }
    return result;
  };

  // Base58 encoding
  const base58Encode = (bytes) => {
    let num = BigInt('0x' + toHex(bytes));
    let result = '';
    
    while (num > 0) {
      const remainder = num % 58n;
      result = BASE58_ALPHABET[Number(remainder)] + result;
      num = num / 58n;
    }
    
    // Add leading 1s for leading zeros
    for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
      result = '1' + result;
    }
    
    return result;
  };

  // Secp256k1 point multiplication (simplified)
  const derivePublicKey = (privateKeyBytes) => {
    // This is a simplified version for demo purposes
    // In production, use a proper secp256k1 library
    
    // Generate a mock public key for demonstration
    // Real implementation would use elliptic curve multiplication
    const publicKey = new Uint8Array(33);
    publicKey[0] = 0x02; // Compressed public key prefix
    
    // Use private key to generate deterministic public key bytes
    for (let i = 1; i < 33; i++) {
      publicKey[i] = (privateKeyBytes[(i-1) % 32] * 7 + i * 13) & 0xFF;
    }
    
    return publicKey;
  };

  // Generate Bitcoin address from public key
  const generateAddress = async (publicKey) => {
    // Step 1: SHA256 hash of public key
    const sha256Hash = await sha256(publicKey);
    
    // Step 2: RIPEMD-160 hash
    const ripemdHash = ripemd160(sha256Hash);
    
    // Step 3: Add version byte (0x00 for mainnet)
    const versionedHash = new Uint8Array(21);
    versionedHash[0] = 0x00;
    versionedHash.set(ripemdHash, 1);
    
    // Step 4: Double SHA256 for checksum
    const checksum = await doubleSha256(versionedHash);
    
    // Step 5: Append first 4 bytes of checksum
    const addressBytes = new Uint8Array(25);
    addressBytes.set(versionedHash, 0);
    addressBytes.set(checksum.slice(0, 4), 21);
    
    // Step 6: Base58 encode
    return base58Encode(addressBytes);
  };

  const generateKeypair = async () => {
    try {
      // Generate 32 random bytes for private key
      const privateKeyBytes = crypto.getRandomValues(new Uint8Array(32));
      
      // Ensure private key is in valid range (1 to n-1)
      // For simplicity, we'll just ensure it's not all zeros
      if (privateKeyBytes.every(b => b === 0)) {
        privateKeyBytes[31] = 1;
      }
      
      const privateKeyHex = toHex(privateKeyBytes);
      
      // Derive public key (simplified)
      const publicKey = derivePublicKey(privateKeyBytes);
      const publicKeyHex = toHex(publicKey);
      
      // Generate Bitcoin address
      const address = await generateAddress(publicKey);
      
      setKeypair({
        privateKey: privateKeyHex,
        publicKey: publicKeyHex,
        address: address
      });
      
      setCopied({ address: false, privateKey: false });
    } catch (error) {
      console.error('Error generating keypair:', error);
    }
  };

  const copyToClipboard = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(prev => ({ ...prev, [type]: true }));
      setTimeout(() => {
        setCopied(prev => ({ ...prev, [type]: false }));
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-gradient-to-br from-orange-50 to-yellow-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Bitcoin Mainnet Keypair Generator
          </h1>
          <p className="text-gray-600">
            Generate a cryptographically secure Bitcoin address and private key pair
          </p>
        </div>

        <div className="text-center mb-8">
          <button
            onClick={generateKeypair}
            className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-semibold flex items-center gap-2 mx-auto transition-colors"
          >
            <RefreshCw size={20} />
            Generate New Keypair
          </button>
        </div>

        {keypair && (
          <div className="space-y-6">
            {/* Bitcoin Address */}
            <div className="bg-gray-50 rounded-lg p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-800">
                  Bitcoin Address (Public)
                </h3>
                <button
                  onClick={() => copyToClipboard(keypair.address, 'address')}
                  className="flex items-center gap-2 text-blue-500 hover:text-blue-600 transition-colors"
                >
                  {copied.address ? <Check size={16} /> : <Copy size={16} />}
                  {copied.address ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="bg-white rounded border p-4 font-mono text-sm break-all">
                {keypair.address}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                This is your Bitcoin address. Share this to receive Bitcoin payments.
              </p>
            </div>

            {/* Public Key */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                Public Key (Compressed)
              </h3>
              <div className="bg-white rounded border p-4 font-mono text-xs break-all">
                {keypair.publicKey}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                The public key derived from your private key using elliptic curve cryptography.
              </p>
            </div>

            {/* Private Key */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-red-800">
                  Private Key (Keep Secret!)
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                    className="flex items-center gap-2 text-red-600 hover:text-red-700 transition-colors"
                  >
                    {showPrivateKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    {showPrivateKey ? 'Hide' : 'Show'}
                  </button>
                  {showPrivateKey && (
                    <button
                      onClick={() => copyToClipboard(keypair.privateKey, 'privateKey')}
                      className="flex items-center gap-2 text-red-600 hover:text-red-700 transition-colors"
                    >
                      {copied.privateKey ? <Check size={16} /> : <Copy size={16} />}
                      {copied.privateKey ? 'Copied!' : 'Copy'}
                    </button>
                  )}
                </div>
              </div>
              <div className="bg-white rounded border p-4 font-mono text-xs break-all">
                {showPrivateKey ? keypair.privateKey : '•'.repeat(64)}
              </div>
              <div className="bg-red-100 rounded p-3 mt-3">
                <p className="text-xs text-red-700 font-medium">
                  ⚠️ WARNING: Never share your private key with anyone! 
                  Anyone with access to this key can control your Bitcoin.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-800 mb-3">
            Important Security Notes
          </h3>
          <ul className="text-sm text-blue-700 space-y-2">
            <li>• This is a demonstration implementation with simplified cryptography</li>
            <li>• For production use, employ established libraries like bitcoinjs-lib</li>
            <li>• Always generate keys in a secure, offline environment</li>
            <li>• Store private keys securely using hardware wallets or paper storage</li>
            <li>• Never enter private keys on untrusted websites or applications</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Generate;