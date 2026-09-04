// bitcoinUtils.js
import * as bitcoin from 'bitcoinjs-lib';

/**
 * Calculate the recommended fee based on current network conditions
 * @param {number} [fallbackFee=450] - Fallback fee in satoshis
 * @returns {Promise<number>} Recommended fee in satoshis
 */
export async function getRecommendedFee(fallbackFee = 450) {
  try {
    const response = await fetch('https://mempool.space/api/v1/fees/recommended');
    const fees = await response.json();
    
    // Use "fastest" fee rate and multiply by approximate transaction size (250 bytes)
    const feeRate = fees.fastestFee || 10; // satoshis per vByte
    const estimatedSize = 250; // bytes for a typical transaction with OP_RETURN
    
    return Math.max(feeRate * estimatedSize, fallbackFee);
  } catch (error) {
    console.warn('Could not fetch recommended fee, using fallback:', fallbackFee);
    return fallbackFee;
  }
}

/**
 * Estimate transaction size in bytes
 * @param {number} inputCount - Number of inputs
 * @param {number} outputCount - Number of outputs
 * @param {number} [opReturnSize=80] - Size of OP_RETURN data in bytes
 * @returns {number} Estimated transaction size in bytes
 */
export function estimateTransactionSize(inputCount, outputCount, opReturnSize = 80) {
  // Base transaction overhead
  const baseSize = 10;
  
  // Input size: 148 bytes per input (typical P2PKH)
  const inputSize = inputCount * 148;
  
  // Output size: 34 bytes per regular output, OP_RETURN is variable
  const regularOutputSize = (outputCount - 1) * 34; // Subtract 1 for OP_RETURN
  const opReturnOutputSize = 8 + 1 + opReturnSize; // 8 bytes value + 1 byte script length + data
  
  return baseSize + inputSize + regularOutputSize + opReturnOutputSize;
}

/**
 * Convert satoshis to BTC
 * @param {number} satoshis 
 * @returns {number} BTC amount
 */
export function satoshisToBTC(satoshis) {
  return satoshis / 100000000;
}

/**
 * Convert BTC to satoshis
 * @param {number} btc 
 * @returns {number} Satoshi amount
 */
export function btcToSatoshis(btc) {
  return Math.round(btc * 100000000);
}

/**
 * Validate Bitcoin address
 * @param {string} address - Bitcoin address to validate
 * @param {Object} [network=bitcoin.networks.bitcoin] - Bitcoin network
 * @returns {boolean} True if valid address
 */
export function isValidAddress(address, network = bitcoin.networks.bitcoin) {
  try {
    bitcoin.address.toOutputScript(address, network);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Format transaction ID for display
 * @param {string} txid - Transaction ID
 * @returns {string} Formatted transaction ID
 */
export function formatTransactionId(txid) {
  return txid.replace(/[^a-f0-9]/gi, '');
}

/**
 * Get explorer URLs for a transaction
 * @param {string} txid - Transaction ID
 * @returns {Object} Object with different explorer URLs
 */
export function getExplorerUrls(txid) {
  const cleanTxid = formatTransactionId(txid);
  
  return {
    mempool: `https://mempool.space/tx/${cleanTxid}`,
    blockstream: `https://blockstream.info/tx/${cleanTxid}`,
    blockchain: `https://www.blockchain.com/btc/tx/${cleanTxid}`,
    bitaps: `https://bitaps.com/${cleanTxid}`
  };
}

/**
 * Check if transaction is confirmed
 * @param {string} txid - Transaction ID
 * @returns {Promise<Object>} Transaction status information
 */
export async function getTransactionStatus(txid) {
  try {
    const cleanTxid = formatTransactionId(txid);
    const response = await fetch(`https://mempool.space/api/tx/${cleanTxid}`);
    
    if (!response.ok) {
      throw new Error('Transaction not found');
    }
    
    const txData = await response.json();
    
    return {
      confirmed: txData.status.confirmed,
      blockHeight: txData.status.block_height,
      blockTime: txData.status.block_time,
      fee: txData.fee,
      size: txData.size
    };
  } catch (error) {
    console.error('Error fetching transaction status:', error);
    return {
      confirmed: false,
      error: error.message
    };
  }
}