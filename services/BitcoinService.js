// bitcoinService.js
import * as ecc from 'tiny-secp256k1';
import ECPairFactory from 'ecpair';
import * as bitcoin from 'bitcoinjs-lib';
import { encodeComment, cleanCommentText, COMMENT_TEXT_MAX, encodeMessage } from './immutableProtocol.js';
import { estimateConsolidationFee, isValidAddress } from './BitcoinUtils';
import { explorerJson } from './BlockstreamExplorer.js';

const ECPair = ECPairFactory(ecc);
const P2PKH_DUST = 546;

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
 * Create and sign a Bitcoin transaction with OP_RETURN data.
 * Optional recipientAddress adds a payment output so the tx goes to that address.
 * @param {Object} utxo - UTXO information
 * @param {string} message - Message to embed
 * @param {number} fee - Transaction fee in satoshis
 * @param {{ recipientAddress?: string, amount?: number }} [options]
 * @returns {Promise<string>} Raw transaction hex
 */
export async function createTransaction(utxo, message, fee, options = {}) {
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

  const recipientAddress = options.recipientAddress || null;
  let recipientValue = 0;

  if (recipientAddress) {
    if (!isValidAddress(recipientAddress, network)) {
      throw new Error('Invalid recipient address');
    }
    recipientValue = Number(options.amount);
    if (!Number.isFinite(recipientValue) || recipientValue <= 0) {
      recipientValue = P2PKH_DUST;
    }
    if (recipientValue < P2PKH_DUST) {
      throw new Error(`Recipient amount must be at least ${P2PKH_DUST} sats`);
    }
  }

  // Calculate change (omit change output when exactly zero)
  const change = utxoData.value - fee - recipientValue;
  
  if (change < 0) {
    throw new Error('Insufficient funds for transaction');
  }
  if (change > 0 && change < P2PKH_DUST) {
    throw new Error('Insufficient funds: change would be below dust limit');
  }
  
  // Create OP_RETURN output
  console.log('Creating OP_RETURN data...');
  const data = Buffer.from(encoded, 'utf8');
  const embed = bitcoin.payments.embed({ data: [data] });
  
  try {
    return await createTransactionWithPSBT(
      utxoData, utxo, embed, change, keyPair, network, recipientAddress, recipientValue
    );
  } catch (psbtError) {
    console.warn('PSBT method failed, trying manual transaction creation:', psbtError.message);
    return await createTransactionManually(
      utxoData, utxo, embed, change, keyPair, network, recipientAddress, recipientValue
    );
  }
}

/**
 * Create transaction using PSBT (Partially Signed Bitcoin Transaction)
 */
async function createTransactionWithPSBT(
  utxoData, utxo, embed, change, keyPair, network, recipientAddress = null, recipientValue = 0
) {
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

  if (recipientAddress && recipientValue > 0) {
    psbt.addOutput({
      address: recipientAddress,
      value: recipientValue,
    });
  }

  if (change > 0) {
    psbt.addOutput({
      address: utxo.public_key,
      value: change,
    });
  }
  
  // Create proper signing keypair
  const signingKeyPair = createSigningKeyPair(keyPair);
  
  psbt.signInput(0, signingKeyPair);
  psbt.finalizeAllInputs();
  
  return psbt.extractTransaction().toHex();
}

/**
 * Create transaction manually (fallback method)
 */
async function createTransactionManually(
  utxoData, utxo, embed, change, keyPair, network, recipientAddress = null, recipientValue = 0
) {
  console.log('Creating transaction manually...');
  
  const tx = new bitcoin.Transaction();
  
  // Add input
  tx.addInput(Buffer.from(utxoData.txid, 'hex').reverse(), utxoData.vout);
  
  // Add OP_RETURN output
  tx.addOutput(embed.output, 0);

  if (recipientAddress && recipientValue > 0) {
    tx.addOutput(bitcoin.address.toOutputScript(recipientAddress, network), recipientValue);
  }

  if (change > 0) {
    const changeScript = bitcoin.address.toOutputScript(utxo.public_key, network);
    tx.addOutput(changeScript, change);
  }
  
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

export function getFundedUnits(units) {
  if (!Array.isArray(units)) return [];

  const seen = new Set();
  const funded = [];
  for (const unit of units) {
    const value = Number(unit?.value) || 0;
    if (value <= 0 || !unit?.tx_hash || unit.tx_output == null) continue;
    const id = `${unit.tx_hash}:${unit.tx_output}`;
    if (seen.has(id)) continue;
    seen.add(id);
    funded.push(unit);
  }
  return funded;
}

function createConsolidationWithPSBT(units, destinationAddress, outputValue, network) {
  const psbt = new bitcoin.Psbt({ network });

  for (const unit of units) {
    psbt.addInput({
      hash: unit.tx_hash,
      index: unit.tx_output,
      nonWitnessUtxo: Buffer.from(unit.tx_raw_hex, 'hex'),
    });
  }

  psbt.addOutput({
    address: destinationAddress,
    value: outputValue,
  });

  units.forEach((unit, index) => {
    const keyPair = ECPair.fromWIF(unit.private_key, network);
    psbt.signInput(index, createSigningKeyPair(keyPair));
  });

  psbt.finalizeAllInputs();
  return psbt.extractTransaction().toHex();
}

function createConsolidationManually(units, destinationAddress, outputValue, network) {
  const tx = new bitcoin.Transaction();
  const hashType = bitcoin.Transaction.SIGHASH_ALL;

  for (const unit of units) {
    tx.addInput(Buffer.from(unit.tx_hash, 'hex').reverse(), unit.tx_output);
  }

  tx.addOutput(bitcoin.address.toOutputScript(destinationAddress, network), outputValue);

  units.forEach((unit, index) => {
    const keyPair = ECPair.fromWIF(unit.private_key, network);
    const prevOutScript = bitcoin.address.toOutputScript(unit.public_key, network);
    const signatureHash = tx.hashForSignature(index, prevOutScript, hashType);
    const signature = keyPair.sign(signatureHash);
    const signatureBuffer = signature instanceof Uint8Array ? Buffer.from(signature) : signature;
    const pubkeyBuffer = keyPair.publicKey instanceof Uint8Array
      ? Buffer.from(keyPair.publicKey)
      : keyPair.publicKey;

    tx.setInputScript(index, bitcoin.script.compile([
      Buffer.concat([signatureBuffer, Buffer.from([hashType])]),
      pubkeyBuffer,
    ]));
  });

  return tx.toHex();
}

export async function createConsolidationTransaction(units, destinationAddress, fee) {
  const network = bitcoin.networks.bitcoin;
  const funded = getFundedUnits(units);

  if (funded.length < 1) {
    throw new Error('Need at least one funded unit');
  }

  if (!destinationAddress || !isValidAddress(destinationAddress, network)) {
    throw new Error('Invalid destination address');
  }

  for (const unit of funded) {
    if (!validateUTXO(unit)) {
      throw new Error('A funded unit is missing the data needed to sign');
    }
  }

  const total = funded.reduce((sum, unit) => sum + (Number(unit.value) || 0), 0);
  const outputValue = total - fee;

  if (outputValue < P2PKH_DUST) {
    throw new Error('Insufficient funds for consolidation fee');
  }

  try {
    return createConsolidationWithPSBT(funded, destinationAddress, outputValue, network);
  } catch (psbtError) {
    console.warn('PSBT consolidation failed, trying manual transaction creation:', psbtError.message);
    return createConsolidationManually(funded, destinationAddress, outputValue, network);
  }
}

/**
 * Spend funded unit(s) into a single output (1+ inputs).
 */
export async function sendUnitsToAddress(units, destinationAddress, fee) {
  try {
    const funded = getFundedUnits(units);
    if (funded.length < 1) {
      throw new Error('Need at least one funded unit');
    }
    const resolvedFee = fee == null
      ? await estimateConsolidationFee(funded.length)
      : fee;
    const outputValue = funded.reduce((sum, unit) => sum + (Number(unit.value) || 0), 0) - resolvedFee;
    const rawTxHex = await createConsolidationTransaction(funded, destinationAddress, resolvedFee);
    const transactionId = await broadcastTransaction(rawTxHex);
    const cleanId = transactionId.replace(/[^a-f0-9]/gi, '');

    return {
      success: true,
      transactionId: cleanId,
      rawTxHex,
      explorerUrl: `https://mempool.space/tx/${cleanId}`,
      fee: resolvedFee,
      outputValue,
      inputCount: funded.length,
      destinationAddress,
    };
  } catch (error) {
    console.error('Send units failed:', error.message);
    return {
      success: false,
      error: error.message,
      rawTxHex: error.rawTxHex || null,
      destinationAddress,
    };
  }
}

/**
 * Spend every funded unit into a single P2PKH output
 * @param {Array} units
 * @param {string} destinationAddress
 * @param {number} [fee]
 * @returns {Promise<Object>}
 */
export async function consolidateFundedUnits(units, destinationAddress, fee) {
  const funded = getFundedUnits(units);
  if (funded.length < 2) {
    return {
      success: false,
      error: 'Need at least two funded units to consolidate',
      rawTxHex: null,
    };
  }
  return sendUnitsToAddress(funded, destinationAddress, fee);
}

/**
 * Find the external address that funded a unit (largest non-self input on the creating tx).
 */
export async function resolveFundingOriginAddress(unit) {
  const txid = String(unit?.tx_hash || '').replace(/[^a-f0-9]/gi, '')
  if (!txid) throw new Error('Unit is missing its funding transaction id')

  const tx = await explorerJson(`/tx/${txid}`)
  if (!tx?.vin?.length) {
    throw new Error(`Could not load funding transaction ${txid}`)
  }

  const self = unit.public_key
  const totals = new Map()

  for (const vin of tx.vin) {
    if (vin.is_coinbase) continue
    const addr = vin.prevout?.scriptpubkey_address
    const value = Number(vin.prevout?.value) || 0
    if (!addr || !isValidAddress(addr)) continue
    if (self && addr === self) continue
    totals.set(addr, (totals.get(addr) || 0) + value)
  }

  let best = null
  let bestValue = -1
  for (const [addr, value] of totals) {
    if (value > bestValue) {
      best = addr
      bestValue = value
    }
  }

  if (best) return best

  // Fallback: first input address (may be self after consolidation).
  for (const vin of tx.vin) {
    const addr = vin.prevout?.scriptpubkey_address
    if (addr && isValidAddress(addr)) return addr
  }

  throw new Error(`No origin address found for unit ${txid}`)
}

/**
 * Refund every funded unit to the address that originally paid it.
 * Units that share an origin are batched into one transaction.
 */
export async function refundFundedUnits(units) {
  try {
    const funded = getFundedUnits(units)
    if (funded.length < 1) {
      throw new Error('Need at least one funded unit to refund')
    }

    for (const unit of funded) {
      if (!validateUTXO(unit)) {
        throw new Error('A funded unit is missing the data needed to sign')
      }
    }

    const groups = new Map()
    for (const unit of funded) {
      const origin = await resolveFundingOriginAddress(unit)
      if (!groups.has(origin)) groups.set(origin, [])
      groups.get(origin).push(unit)
    }

    const results = []
    for (const [origin, group] of groups) {
      const fee = await estimateConsolidationFee(group.length)
      const result = await sendUnitsToAddress(group, origin, fee)
      results.push({
        origin,
        unitCount: group.length,
        ...result,
      })
      if (!result.success) {
        return {
          success: false,
          error: result.error || `Refund to ${origin} failed`,
          results,
        }
      }
    }

    return {
      success: true,
      results,
      transactionIds: results.map((row) => row.transactionId).filter(Boolean),
      originCount: groups.size,
      inputCount: funded.length,
    }
  } catch (error) {
    console.error('Refund failed:', error.message)
    return {
      success: false,
      error: error.message,
      results: [],
    }
  }
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

    // Encode message using The Block Note Protocol (≤75-byte simple OP_RETURN push)
    const encoded = encodeMessage(message);

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
 * Direct message: OP_RETURN text plus a payment output to recipientAddress.
 * @param {Object} utxo
 * @param {string} message
 * @param {string} recipientAddress
 * @param {number} [fee=450]
 * @param {number} [amount=546] - sats paid to recipient (dust minimum)
 */
export async function sendDirectMessageTransaction(
  utxo,
  message,
  recipientAddress,
  fee = 450,
  amount = P2PKH_DUST
) {
  try {
    if (!recipientAddress || !isValidAddress(recipientAddress)) {
      throw new Error('Invalid recipient address');
    }

    const encoded = encodeMessage(message);
    const rawTxHex = await createTransaction(utxo, encoded, fee, {
      recipientAddress,
      amount,
    });

    const transactionId = await broadcastTransaction(rawTxHex);

    return {
      success: true,
      transactionId: transactionId.replace(/[^a-f0-9]/gi, ''),
      rawTxHex,
      amount,
      recipientAddress,
      explorerUrl: `https://mempool.space/tx/${transactionId.replace(/[^a-f0-9]/gi, '')}`,
    };
  } catch (error) {
    console.error('Direct message failed:', error.message);
    return {
      success: false,
      error: error.message,
      rawTxHex: error.rawTxHex || null,
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
 * Comment on a message (topic reply).
 * Protocol: t 0 2 <txid12> <vout> "<text≤50>"
 */
export async function applyComment(utxo, hash, index, text, fee = 450) {
  try {
    const cleaned = cleanCommentText(text);
    if (!cleaned) {
      throw new Error('Comment is empty');
    }
    if (cleaned.length > COMMENT_TEXT_MAX) {
      throw new Error(`Comment must be ${COMMENT_TEXT_MAX} characters or fewer`);
    }

    const encoded = encodeComment(hash, index, cleaned);
    const rawTxHex = await createTransaction(utxo, encoded, fee);
    const transactionId = await broadcastTransaction(rawTxHex);

    return {
      success: true,
      transactionId: transactionId.replace(/[^a-f0-9]/gi, ''),
      rawTxHex,
      encoded,
      text: cleaned,
      explorerUrl: `https://mempool.space/tx/${transactionId.replace(/[^a-f0-9]/gi, '')}`,
    };
  } catch (error) {
    console.error('Comment failed:', error.message);
    return {
      success: false,
      error: error.message,
      rawTxHex: error.rawTxHex || null,
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