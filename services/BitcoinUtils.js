// bitcoinUtils.js
import * as bitcoin from 'bitcoinjs-lib';

/**
 * Calculate the recommended fee based on current network conditions
 * @param {number} [fallbackFee=450] - Fallback fee in satoshis
 * @returns {Promise<number>} Recommended fee in satoshis
 */
export async function getRecommendedFee(fallbackFee = 450) {
  try {
    const tiers = await getRecommendedFeeTiers();
    return Math.max(tiers.fast.fee, fallbackFee);
  } catch (error) {
    console.warn('Could not fetch recommended fee, using fallback:', fallbackFee);
    return fallbackFee;
  }
}

/** Typical Speak / vote / comment size: 1 P2PKH in, OP_RETURN + change (~281 vB). */
export const SPEAK_TX_VBYTES = 281;

/**
 * Live fee tiers from mempool.space for a Speak-sized transaction.
 * Fast uses mempool's next-block target (`fastestFee`) — there is no protocol max fee,
 * only what your funded unit can afford while leaving change above dust.
 * @param {{ fallbackRate?: number, vbytes?: number, minFee?: number }} [options]
 */
export async function getRecommendedFeeTiers({
  fallbackRate = 10,
  vbytes = SPEAK_TX_VBYTES,
  minFee = 100,
} = {}) {
  const toTier = (id, rate) => {
    const safeRate = Math.max(Number(rate) || fallbackRate, 1);
    return {
      id,
      rate: safeRate,
      fee: Math.max(Math.ceil(safeRate * vbytes), minFee),
    };
  };

  try {
    const response = await fetch('https://mempool.space/api/v1/fees/recommended');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const fees = await response.json();

    return {
      economy: toTier('economy', fees.hourFee ?? fees.economyFee ?? fallbackRate),
      standard: toTier('standard', fees.halfHourFee ?? fallbackRate),
      fast: toTier('fast', fees.fastestFee ?? fallbackRate),
    };
  } catch (error) {
    console.warn('Could not fetch fee tiers, using fallbacks:', error.message);
    return {
      economy: toTier('economy', Math.max(1, Math.floor(fallbackRate / 2))),
      standard: toTier('standard', fallbackRate),
      fast: toTier('fast', fallbackRate * 2),
    };
  }
}

/**
 * Recommended fee rate in satoshis per vByte
 * @param {number} [fallbackRate=10]
 * @returns {Promise<number>}
 */
export async function getRecommendedFeeRate(fallbackRate = 10) {
  try {
    const response = await fetch('https://mempool.space/api/v1/fees/recommended');
    const fees = await response.json();
    return Math.max(Number(fees.fastestFee) || fallbackRate, 1);
  } catch (error) {
    console.warn('Could not fetch recommended fee rate, using fallback:', fallbackRate);
    return fallbackRate;
  }
}

/**
 * Estimate a P2PKH transaction with no OP_RETURN (used for consolidation)
 * @param {number} inputCount
 * @param {number} [outputCount=1]
 * @returns {number} Estimated size in bytes
 */
export function estimateP2pkhTransactionSize(inputCount, outputCount = 1) {
  const baseSize = 10;
  const inputSize = inputCount * 148;
  const outputSize = outputCount * 34;
  return baseSize + inputSize + outputSize;
}

/**
 * Absolute fee for consolidating P2PKH units into one output
 * @param {number} inputCount
 * @param {number} [fallbackFee=450]
 * @returns {Promise<number>} Fee in satoshis
 */
export async function estimateConsolidationFee(inputCount, fallbackFee = 450) {
  const feeRate = await getRecommendedFeeRate();
  const size = estimateP2pkhTransactionSize(inputCount, 1);
  return Math.max(feeRate * size, fallbackFee);
}

/**
 * Estimate transaction size in bytes
 * @param {number} inputCount - Number of inputs
 * @param {number} outputCount - Number of outputs
 * @param {number} [opReturnSize=80] - Size of OP_RETURN data in bytes
 * @returns {number} Estimated transaction size in bytes
 */
export function estimateTransactionSize(inputCount, outputCount, opReturnSize = 75) {
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