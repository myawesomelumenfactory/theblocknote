// bitcoinService.js
import * as ecc from 'tiny-secp256k1';
import ECPairFactory from 'ecpair';
import * as bitcoin from 'bitcoinjs-lib';
import { encode } from '../services/TheBlockNote';

const ECPair = ECPairFactory(ecc);

/**
 * Broadcast a raw transaction to the Bitcoin network
 * @param {string} rawTxHex - The raw transaction hex string
 * @returns {Promise<string>} Transaction ID if successful
 */
export async function broadcastTransaction(rawTxHex) {
  console.log('Broadcasting transaction to Bitcoin network...');
  
  const endpoints = [
    {
      name: 'BlockCypher',
      url: 'https://api.blockcypher.com/v1/btc/main/txs/push',
      method: 'POST',
      body: JSON.stringify({ tx: rawTxHex }),
      headers: { 'Content-Type': 'application/json' }
    },
    {
      name: 'Blockstream',
      url: 'https://blockstream.info/api/tx',
      method: 'POST',
      body: rawTxHex,
      headers: { 'Content-Type': 'text/plain' }
    },
    {
      name: 'Mempool.space',
      url: 'https://mempool.space/api/tx',
      method: 'POST',
      body: rawTxHex,
      headers: { 'Content-Type': 'text/plain' }
    }
  ];
  
  for (const endpoint of endpoints) {
    try {
      console.log(`Trying ${endpoint.name}...`);
      
      const response = await fetch(endpoint.url, {
        method: endpoint.method,
        headers: endpoint.headers,
        body: endpoint.body
      });
      
      if (response.ok) {
        const result = await response.text();
        console.log(`Transaction broadcast successful via ${endpoint.name}!`);
        console.log('Transaction ID:', result);
        console.log(`View on explorer: https://mempool.space/tx/${result.replace(/[^a-f0-9]/gi, '')}`);
        
        // Try to parse JSON response for BlockCypher
        if (endpoint.name === 'BlockCypher') {
          try {
            const data = JSON.parse(result);
            return data.tx?.hash || result;
          } catch (e) {
            return result;
          }
        }
        
        return result;
      } else {
        const errorText = await response.text();
        console.warn(`❌ ${endpoint.name} failed:`, response.status, errorText);
      }
    } catch (error) {
      console.warn(`❌ ${endpoint.name} error:`, error.message);
    }
  }
  
  const error = new Error('All broadcast attempts failed. Transaction not sent.');
  error.rawTxHex = rawTxHex;
  throw error;
}

/**
 * Create and sign a Bitcoin transaction with OP_RETURN data
 * @param {Object} utxo - UTXO information
 * @param {string} message - Message to embed
 * @param {number} fee - Transaction fee in satoshis
 * @returns {Promise<string>} Raw transaction hex
 */
export async function createTransaction(utxo, message, fee) {
  const network = bitcoin.networks.bitcoin; // mainnet
  const keyPair = ECPair.fromWIF(utxo.private_key, network);
  
  // Encode message using The Block Note Protocol
  const encoded = message;

  // UTXO Info
  const utxoData = {
    txid: utxo.tx_hash,
    vout: utxo.tx_output,
    value: utxo.value,
  };

  console.log('--- Current UTXO ---');
  console.log(utxoData);

  // Calculate change
  const change = utxoData.value - fee;
  
  if (change < 0) {
    throw new Error('Insufficient funds for transaction');
  }
  
  // Create OP_RETURN output
  console.log('Creating OP_RETURN data...');
  const data = Buffer.from(encoded, 'utf8');
  const embed = bitcoin.payments.embed({ data: [data] });
  
  try {
    return await createTransactionWithPSBT(utxoData, utxo, embed, change, keyPair, network);
  } catch (psbtError) {
    console.warn('PSBT method failed, trying manual transaction creation:', psbtError.message);
    return await createTransactionManually(utxoData, utxo, embed, change, keyPair, network);
  }
}

/**
 * Create transaction using PSBT (Partially Signed Bitcoin Transaction)
 */
async function createTransactionWithPSBT(utxoData, utxo, embed, change, keyPair, network) {
  console.log('Creating PSBT...');
  const psbt = new bitcoin.Psbt({ network });
  
  psbt.addInput({
    hash: utxoData.txid,
    index: utxoData.vout,
    nonWitnessUtxo: Buffer.from(utxo.tx_raw_hex, 'hex'),
  });
  
  psbt.addOutput({
    script: embed.output,
    value: 0,
  });
  
  psbt.addOutput({
    address: utxo.public_key,
    value: change,
  });
  
  // Create proper signing keypair
  const signingKeyPair = createSigningKeyPair(keyPair);
  
  psbt.signInput(0, signingKeyPair);
  psbt.finalizeAllInputs();
  
  return psbt.extractTransaction().toHex();
}

/**
 * Create transaction manually (fallback method)
 */
async function createTransactionManually(utxoData, utxo, embed, change, keyPair, network) {
  console.log('Creating transaction manually...');
  
  const tx = new bitcoin.Transaction();
  
  // Add input
  tx.addInput(Buffer.from(utxoData.txid, 'hex').reverse(), utxoData.vout);
  
  // Add OP_RETURN output
  tx.addOutput(embed.output, 0);
  
  // Add change output
  const changeScript = bitcoin.address.toOutputScript(utxo.public_key, network);
  tx.addOutput(changeScript, change);
  
  // Create and apply signature
  const hashType = bitcoin.Transaction.SIGHASH_ALL;
  const prevOutScript = bitcoin.address.toOutputScript(utxo.public_key, network);
  const signatureHash = tx.hashForSignature(0, prevOutScript, hashType);
  
  const signature = keyPair.sign(signatureHash);
  const signatureBuffer = signature instanceof Uint8Array ? Buffer.from(signature) : signature;
  
  const pubkeyBuffer = keyPair.publicKey instanceof Uint8Array 
    ? Buffer.from(keyPair.publicKey) 
    : keyPair.publicKey;
  
  const scriptSig = bitcoin.script.compile([
    Buffer.concat([signatureBuffer, Buffer.from([hashType])]),
    pubkeyBuffer
  ]);
  
  tx.setInputScript(0, scriptSig);
  
  return tx.toHex();
}

/**
 * Create a proper signing keypair for PSBT
 */
function createSigningKeyPair(keyPair) {
  const pubkeyBuffer = keyPair.publicKey instanceof Uint8Array 
    ? Buffer.from(keyPair.publicKey) 
    : keyPair.publicKey;
  
  return {
    publicKey: pubkeyBuffer,
    privateKey: keyPair.privateKey instanceof Uint8Array 
      ? Buffer.from(keyPair.privateKey) 
      : keyPair.privateKey,
    sign: (hash) => {
      const signature = keyPair.sign(hash);
      return signature instanceof Uint8Array ? Buffer.from(signature) : signature;
    },
    network: keyPair.network
  };
}

export function getHighestFundedUnit(units, fee = 450) {
  if (!Array.isArray(units) || units.length === 0) return null;

  let best = null;
  for (const unit of units) {
    const value = Number(unit?.value) || 0;
    if (value <= fee) continue;
    if (!best || value > (Number(best.value) || 0)) {
      best = unit;
    }
  }
  return best;
}

/**
 * Main function to create and broadcast a Bitcoin transaction
 * @param {Object} utxo - UTXO information
 * @param {string} message - Message to embed
 * @param {number} fee - Transaction fee in satoshis
 * @returns {Promise<Object>} Result object with transaction ID and raw hex
 */
export async function sendBitcoinTransaction(utxo, message, fee = 450) {
  try {
    console.log('Creating transaction...');

    // Encode message using The Block Note Protocol
    const encoded = encode("t", 0, 0, message);

    const rawTxHex = await createTransaction(utxo, encoded, fee);
    
    console.log('Broadcasting transaction...');
    const transactionId = await broadcastTransaction(rawTxHex);
    
    return {
      success: true,
      transactionId: transactionId.replace(/[^a-f0-9]/gi, ''),
      rawTxHex,
      explorerUrl: `https://mempool.space/tx/${transactionId.replace(/[^a-f0-9]/gi, '')}`
    };
  } catch (error) {
    console.error('Transaction failed:', error.message);
    return {
      success: false,
      error: error.message,
      rawTxHex: error.rawTxHex || null
    };
  }
}

/**
 * Main function to vote UP for a specific content
 * @param {Object} utxo - UTXO information
 * @param {string} hash - Hash of the transaction
 * @param {string} index - Index of the vout script
 * @param {number} fee - Transaction fee in satoshis
 * @returns {Promise<Object>} Result object with transaction ID and raw hex
 */
 export async function applyVoteUp(utxo, hash, index, fee = 450) {
  try {

    const encoded = "t 0 1 " + hash + " " + index;
    console.log('Encoding');
    console.log(encoded);

    console.log('Creating transaction...');
    const rawTxHex = await createTransaction(utxo, encoded, fee);
    
    console.log('Broadcasting transaction...');
    const transactionId = await broadcastTransaction(rawTxHex);
    
    return {
      success: true,
      transactionId: transactionId.replace(/[^a-f0-9]/gi, ''),
      rawTxHex,
      explorerUrl: `https://mempool.space/tx/${transactionId.replace(/[^a-f0-9]/gi, '')}`
    };
  } catch (error) {
    console.error('Transaction failed:', error.message);
    return {
      success: false,
      error: error.message,
      rawTxHex: error.rawTxHex || null
    };
  }
}

/**
 * Main function to vote DOWN for a specific content
 * @param {Object} utxo - UTXO information
 * @param {string} hash - Hash of the transaction
 * @param {string} index - Index of the vout script
 * @param {number} fee - Transaction fee in satoshis
 * @returns {Promise<Object>} Result object with transaction ID and raw hex
 */
 export async function applyVoteDown(utxo, hash, index, fee = 450) {
  try {

    const encoded = "t 0 -1 " + hash + " " + index;
    console.log('Encoding');
    console.log(encoded);

    console.log('Creating transaction...');
    const rawTxHex = await createTransaction(utxo, encoded, fee);
    
    console.log('Broadcasting transaction...');
    const transactionId = await broadcastTransaction(rawTxHex);
    
    return {
      success: true,
      transactionId: transactionId.replace(/[^a-f0-9]/gi, ''),
      rawTxHex,
      explorerUrl: `https://mempool.space/tx/${transactionId.replace(/[^a-f0-9]/gi, '')}`
    };
  } catch (error) {
    console.error('Transaction failed:', error.message);
    return {
      success: false,
      error: error.message,
      rawTxHex: error.rawTxHex || null
    };
  }
}

/**
 * Validate UTXO object structure
 * @param {Object} utxo - UTXO to validate
 * @returns {boolean} True if valid
 */
export function validateUTXO(utxo) {
  const requiredFields = ['tx_hash', 'tx_output', 'value', 'private_key', 'public_key', 'tx_raw_hex'];
  
  for (const field of requiredFields) {
    if (!utxo[field] && utxo[field] !== 0) {
      console.error(`Missing required UTXO field: ${field}`);
      return false;
    }
  }
  
  if (typeof utxo.value !== 'number' || utxo.value <= 0) {
    console.error('Invalid UTXO value');
    return false;
  }
  
  return true;
}