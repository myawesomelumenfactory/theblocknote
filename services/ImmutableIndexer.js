import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { decodeOpReturn } from './TheBlockNote.js';

const PROTOCOL_RE = /^t\s+-?\d+\s+-?\d+/;
const TOKEN_URL = 'https://login.blockstream.com/realms/blockstream-public/protocol/openid-connect/token';
const ENTERPRISE_API = 'https://enterprise.blockstream.info/api';

const PUBLIC_EXPLORERS = [
  {
    name: 'blockchain.info',
    kind: 'rawblock',
    blockHeight: (height) =>
      `https://blockchain.info/block-height/${height}?format=json`,
    tip: 'https://blockchain.info/q/getblockcount',
  },
  {
    name: 'mempool.space',
    kind: 'esplora',
    base: 'https://mempool.space/api',
  },
  {
    name: 'blockstream',
    kind: 'esplora',
    base: 'https://blockstream.info/api',
  },
];

let cachedToken = null;
let tokenExpiresAt = 0;
let tokenInFlight = null;

function loadDotEnv() {
  const envPath = path.resolve('.env');
  if (!fsSync.existsSync(envPath)) return;
  for (const line of fsSync.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

function getExplorers() {
  const explorers = [];
  if (process.env.BLOCKSTREAM_CLIENT_ID && process.env.BLOCKSTREAM_CLIENT_SECRET) {
    explorers.push({
      name: 'blockstream-enterprise',
      kind: 'esplora',
      base: ENTERPRISE_API,
    });
  }
  explorers.push(...PUBLIC_EXPLORERS);
  return explorers;
}

async function getEnterpriseToken() {
  const clientId = process.env.BLOCKSTREAM_CLIENT_ID;
  const clientSecret = process.env.BLOCKSTREAM_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;
  if (tokenInFlight) return tokenInFlight;

  tokenInFlight = (async () => {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
        scope: 'openid',
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) {
      throw new Error(data.error_description || data.error || `Token request failed (${response.status})`);
    }
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + (Number(data.expires_in) || 300) * 1000;
    return cachedToken;
  })();

  try {
    return await tokenInFlight;
  } finally {
    tokenInFlight = null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProtocolMessage(text) {
  return typeof text === 'string' && PROTOCOL_RE.test(text.trim());
}

async function fetchText(url, { retries = 6 } = {}) {
  let lastError;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const headers = {
        Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
        'User-Agent': 'TheBlockNote/1.0 (immutables indexer)',
      };
      if (url.startsWith(ENTERPRISE_API)) {
        const token = await getEnterpriseToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(url, { headers });

      if (response.status === 429 || response.status >= 500) {
        const wait = Math.min(30_000, 750 * 2 ** attempt);
        console.warn(`  ${response.status} from ${url} — retry in ${wait}ms`);
        await sleep(wait);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
      const wait = Math.min(30_000, 750 * 2 ** attempt);
      console.warn(`  ${error.message} — retry in ${wait}ms`);
      await sleep(wait);
    }
  }

  throw lastError || new Error(`Failed to fetch ${url}`);
}

async function fetchJson(url) {
  const text = await fetchText(url);
  return JSON.parse(text);
}

function extractFromBlockchainInfoBlock(block, { protocolOnly }) {
  const records = [];
  const time = block.time;
  const txs = block.tx || [];

  for (const tx of txs) {
    const txid = tx.hash;
    const outs = tx.out || [];

    outs.forEach((out, index) => {
      const script = out.script;
      if (!script || !String(script).startsWith('6a')) return;

      const value = decodeOpReturn(script);
      if (!value) return;
      if (protocolOnly && !isProtocolMessage(value)) return;

      records.push({
        index: `${txid}_${out.n ?? index}`,
        time,
        value,
      });
    });
  }

  return records;
}

function extractFromEsploraTxs(txs, blockTime, { protocolOnly }) {
  const records = [];

  for (const tx of txs) {
    const txid = tx.txid;
    const time = tx.status?.block_time || blockTime;
    const vouts = tx.vout || [];

    vouts.forEach((out, index) => {
      const script = out.scriptpubkey;
      if (out.scriptpubkey_type !== 'op_return' && !String(script || '').startsWith('6a')) {
        return;
      }

      const value = decodeOpReturn(script);
      if (!value) return;
      if (protocolOnly && !isProtocolMessage(value)) return;

      records.push({
        index: `${txid}_${index}`,
        time,
        value,
      });
    });
  }

  return records;
}

async function fetchBlockViaRaw(explorer, height, options) {
  const payload = await fetchJson(explorer.blockHeight(height));
  const block = Array.isArray(payload.blocks) ? payload.blocks[0] : payload;
  if (!block) {
    throw new Error(`No block payload at height ${height}`);
  }
  return extractFromBlockchainInfoBlock(block, options);
}

async function fetchBlockViaEsplora(explorer, height, options) {
  const hash = (await fetchText(`${explorer.base}/block-height/${height}`)).trim();
  const header = await fetchJson(`${explorer.base}/block/${hash}`);
  const blockTime = header.timestamp;
  const txCount = header.tx_count || 0;
  const pageSize = 25;
  let records = [];

  for (let start = 0; start < txCount; start += pageSize) {
    const pathSuffix = start === 0 ? '' : `/${start}`;
    const txs = await fetchJson(`${explorer.base}/block/${hash}/txs${pathSuffix}`);
    records = records.concat(extractFromEsploraTxs(txs, blockTime, options));
    if (start + pageSize < txCount) {
      await sleep(options.delay);
    }
  }

  return records;
}

async function fetchBlock(height, options) {
  let lastError;

  for (const explorer of getExplorers()) {
    try {
      if (explorer.kind === 'rawblock') {
        return await fetchBlockViaRaw(explorer, height, options);
      }
      return await fetchBlockViaEsplora(explorer, height, options);
    } catch (error) {
      lastError = error;
      console.warn(`  ${explorer.name} failed at ${height}: ${error.message}`);
    }
  }

  throw lastError;
}

async function fetchTipHeight() {
  for (const explorer of getExplorers()) {
    try {
      if (explorer.kind === 'rawblock') {
        return Number.parseInt(await fetchText(explorer.tip), 10);
      }
      return Number.parseInt(await fetchText(`${explorer.base}/blocks/tip/height`), 10);
    } catch (error) {
      console.warn(`  tip via ${explorer.name} failed: ${error.message}`);
    }
  }
  throw new Error('Could not read chain tip height');
}

async function readJsonIfExists(filePath, fallback) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    from: 906867,
    to: null,
    delay: 150,
    concurrency: 6,
    protocolOnly: true,
    resume: true,
    out: path.resolve('data/immutables.json'),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--from') {
      options.from = Number.parseInt(next, 10);
      i++;
    } else if (arg === '--to') {
      options.to = Number.parseInt(next, 10);
      i++;
    } else if (arg === '--delay') {
      options.delay = Number.parseInt(next, 10);
      i++;
    } else if (arg === '--concurrency') {
      options.concurrency = Math.max(1, Number.parseInt(next, 10));
      i++;
    } else if (arg === '--out') {
      options.out = path.resolve(next);
      i++;
    } else if (arg === '--all-op-return') {
      options.protocolOnly = false;
    } else if (arg === '--no-resume') {
      options.resume = false;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

export function helpText() {
  return `Fetch Bitcoin OP_RETURN messages into immutables.json

Usage:
  npm run index:immutables -- [options]

Options:
  --from <height>     Start block (default: 906867, when The Block Note began)
  --to <height>       End block inclusive (default: current chain tip)
  --delay <ms>        Pause between blocks in a batch (default: 150)
  --concurrency <n>   Blocks to fetch in parallel (default: 6)
  --out <path>        Output file (default: data/immutables.json)
  --all-op-return     Keep every OP_RETURN, not only protocol "t ..." lines
  --no-resume         Ignore checkpoint and rewrite the output file

Examples:
  npm run index:immutables
  npm run index:immutables -- --from 906867 --to 910933
  npm run index:immutables -- --from 906867 --all-op-return
`;
}

export async function runIndexer(options) {
  loadDotEnv();
  const canonicalOut = path.resolve('data/immutables.json');
  const statePath = path.join(path.dirname(options.out), '.immutables-state.json');
  const publicCopy =
    path.resolve(options.out) === canonicalOut
      ? path.resolve('public/data/immutables.json')
      : null;

  let from = options.from;
  let records = [];

  if (options.resume) {
    const state = await readJsonIfExists(statePath, null);
    const existing = await readJsonIfExists(options.out, []);
    if (state?.lastHeight != null && Array.isArray(existing) && existing.length) {
      records = existing;
      from = Math.max(from, state.lastHeight + 1);
      console.log(`Resuming after block ${state.lastHeight} (${records.length} messages)`);
    }
  }

  const to = options.to ?? (await fetchTipHeight());
  if (Number.isNaN(from) || Number.isNaN(to)) {
    throw new Error('Invalid --from / --to height');
  }
  if (from > to) {
    console.log(`Already up to date (from ${from} > to ${to}).`);
    return { from, to, count: records.length, out: options.out };
  }

  console.log(
    `Indexing blocks ${from} → ${to} (${options.protocolOnly ? 'protocol t … only' : 'all OP_RETURN'}, concurrency ${options.concurrency})`
  );

  let shouldStop = false;
  const onSignal = () => {
    shouldStop = true;
    console.log('\nStopping after the current block…');
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const seen = new Set(records.map((row) => `${row.index}:${row.value}`));
  const concurrency = options.concurrency || 1;

  try {
    for (let height = from; height <= to; height += concurrency) {
      if (shouldStop) break;

      const batchEnd = Math.min(height + concurrency - 1, to);
      const batch = [];
      for (let h = height; h <= batchEnd; h++) {
        batch.push(h);
      }

      const results = await Promise.all(
        batch.map(async (h, i) => {
          if (i > 0 && options.delay) {
            await sleep(options.delay * i);
          }
          const found = await fetchBlock(h, options);
          return { height: h, found };
        })
      );

      results.sort((a, b) => a.height - b.height);

      let added = 0;
      for (const { found } of results) {
        for (const row of found) {
          const key = `${row.index}:${row.value}`;
          if (seen.has(key)) continue;
          seen.add(key);
          records.push(row);
          added++;
        }
      }

      console.log(
        `Blocks ${height}–${batchEnd}/${to} — +${added} message(s), ${records.length} total`
      );

      await writeJson(options.out, records);
      if (publicCopy) {
        await writeJson(publicCopy, records);
      }
      await writeJson(statePath, {
        lastHeight: batchEnd,
        from: options.from,
        to,
        count: records.length,
        updatedAt: new Date().toISOString(),
      });
    }
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }

  console.log(`Wrote ${records.length} messages to ${options.out}`);
  return { from, to, count: records.length, out: options.out };
}
