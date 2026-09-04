import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import ECPairFactory from 'ecpair';
import { Buffer } from 'buffer';

const ECPair = ECPairFactory(ecc);
const network = bitcoin.networks.bitcoin;

export function readStoredKeyPairs() {
  try {
    const parsed = JSON.parse(localStorage.getItem('keyPairs') || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore corrupt storage and start fresh.
  }
  return {};
}

export function writeStoredKeyPairs(keyPairs) {
  localStorage.setItem('keyPairs', JSON.stringify(keyPairs));
}

export function addressFromWif(wif) {
  const keyPair = ECPair.fromWIF(wif, network);
  const { address } = bitcoin.payments.p2pkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network,
  });
  return address;
}

export function createParticipationKey() {
  const keyPair = ECPair.makeRandom({ network });
  const address = bitcoin.payments.p2pkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network,
  }).address;
  return { address, privateKey: keyPair.toWIF() };
}

export function serializeParticipationKeys(keyPairs) {
  return JSON.stringify(
    {
      version: 1,
      keys: Object.entries(keyPairs).map(([address, privateKey]) => ({
        address,
        privateKey,
      })),
    },
    null,
    2
  );
}

export function parseParticipationKeys(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    throw new Error('Paste a participation key bundle first');
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('That text is not valid JSON');
  }

  const incoming = [];
  if (Array.isArray(data)) {
    incoming.push(...data);
  } else if (data && Array.isArray(data.keys)) {
    incoming.push(...data.keys);
  } else if (data && typeof data === 'object' && typeof data.privateKey === 'string') {
    incoming.push(data);
  } else if (data && typeof data === 'object') {
    for (const [address, privateKey] of Object.entries(data)) {
      if (address === 'version' || address === 'keys') continue;
      if (typeof privateKey === 'string') {
        incoming.push({ address, privateKey });
      }
    }
  }

  const keyPairs = {};
  for (const row of incoming) {
    const wif = row?.privateKey || row?.wif || row?.private_key;
    if (!wif || typeof wif !== 'string') continue;

    let derived;
    try {
      derived = addressFromWif(wif.trim());
    } catch {
      throw new Error('One of the private keys is not a valid Bitcoin WIF');
    }

    const provided = row.address || row.public_key;
    if (provided && provided !== derived) {
      throw new Error(`Address ${provided} does not match its private key`);
    }

    keyPairs[derived] = wif.trim();
  }

  if (Object.keys(keyPairs).length === 0) {
    throw new Error('No participation keys found in that text');
  }

  return keyPairs;
}
