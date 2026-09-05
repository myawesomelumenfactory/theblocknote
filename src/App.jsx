import React, { useCallback, useEffect, useRef, useState } from 'react';
import './App.css'
import { Routes, Route } from "react-router-dom";
import PowerPage from '../pages/PowerPage';
import MainPage from '../pages/MainPage';
import ReadPage from '../pages/ReadPage';
import GeneratePage from '../pages/GeneratePage';
import StatusPage from '../pages/StatusPage';
import LiveVisitBeacon from '../components/LiveVisitBeacon';
import { SharedContext } from '../src/SharedContext';
import { explorerJson, explorerText, explorerTipHeight } from '../services/BlockstreamExplorer';
import { getHighestFundedUnit } from '../services/BitcoinService';

const CONFIRMED_AFTER = 6;

function utxoConfirmations(utxo, tipHeight) {
  if (!utxo?.status?.confirmed) return 0;
  if (!tipHeight || !utxo.status.block_height) return 1;
  return Math.max(1, tipHeight - utxo.status.block_height + 1);
}

function App() {

  const [refs, setRefs] = useState([]);
  const [addressFunds, setAddressFunds] = useState({});
  const [fundsProgress, setFundsProgress] = useState({
    total: 0,
    checked: 0,
    funded: 0,
    phase: 'idle',
  });
  const [currentIndex, setCurrentIndex] = useState(null);
  const fetchInFlight = useRef(false);
  const addressFundsRef = useRef({});
  const refsRef = useRef([]);
  const keyPairsRef = useRef({});

  console.log("--- THE BLOCK NOTE ---");

  useEffect(() => {
    addressFundsRef.current = addressFunds;
  }, [addressFunds]);

  useEffect(() => {
    refsRef.current = refs;
  }, [refs]);

  const publishFunds = (keyPairs, fundsByAddress) => {
    setAddressFunds((prev) => {
      const merged = { ...prev, ...fundsByAddress };
      for (const address of Object.keys(merged)) {
        if (!keyPairs[address]) delete merged[address];
      }
      return merged;
    });
  };

  const publishRefs = (refsByAddress) => {
    const refsData = Object.values(refsByAddress).flat();
    setRefs(refsData.map((row, index) => ({ ...row, index })));
  };

  const fetchAddresses = useCallback(async (options = {}) => {
    if (fetchInFlight.current) return;
    fetchInFlight.current = true;
    const watch = Boolean(options.watch);
    try {
      const stored = localStorage.getItem('keyPairs');
      let parsed = {};
      try {
        parsed = stored ? JSON.parse(stored) : {};
      } catch {
        parsed = {};
      }
      const keyPairs = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      keyPairsRef.current = keyPairs;
      localStorage.setItem('keyPairs', JSON.stringify(keyPairs));

      let entries = Object.entries(keyPairs).reverse();
      if (watch) {
        const focusAddress = options.address;
        entries = entries.filter(([address]) => {
          if (focusAddress && address === focusAddress) return true;
          const funds = addressFundsRef.current[address];
          return !funds || (funds.received || 0) === 0 || funds.pending;
        });
      }

      const fundsByAddress = { ...addressFundsRef.current };
      const refsByAddress = {};
      for (const row of refsRef.current) {
        if (!refsByAddress[row.public_key]) refsByAddress[row.public_key] = [];
        refsByAddress[row.public_key].push(row);
      }

      if (!watch) {
        setFundsProgress({
          total: entries.length,
          checked: 0,
          funded: 0,
          phase: entries.length ? 'keys' : 'done',
        });
      }

      if (entries.length === 0) {
        if (!watch) {
          setAddressFunds({});
          setRefs([]);
          setFundsProgress({ total: 0, checked: 0, funded: 0, phase: 'done' });
        }
        return;
      }

      const tipHeight = await explorerTipHeight();
      let checked = 0;

      const summarizeFunds = (address, info, utxos = []) => {
        let received = 0;
        let available = 0;
        let unconfirmed = 0;
        if (info) {
          const confirmedReceived = info.chain_stats?.funded_txo_sum || 0;
          const mempoolReceived = info.mempool_stats?.funded_txo_sum || 0;
          const spent =
            (info.chain_stats?.spent_txo_sum || 0) +
            (info.mempool_stats?.spent_txo_sum || 0);
          received = confirmedReceived + mempoolReceived;
          unconfirmed = mempoolReceived;
          available = received - spent;
        }
        const utxoSum = utxos.reduce((sum, utxo) => sum + (utxo.value || 0), 0);
        if (utxoSum > received) received = utxoSum;
        if (utxoSum > available) available = utxoSum;
        const utxoUnconfirmed = utxos
          .filter((utxo) => !utxo.status?.confirmed)
          .reduce((sum, utxo) => sum + (utxo.value || 0), 0);
        if (utxoUnconfirmed > unconfirmed) unconfirmed = utxoUnconfirmed;
        const confirmationCounts = utxos.map((utxo) => utxoConfirmations(utxo, tipHeight));
        const confirmations = confirmationCounts.length ? Math.min(...confirmationCounts) : 0;
        return {
          received,
          available,
          unconfirmed,
          confirmations,
          pending: unconfirmed > 0 || (received > 0 && confirmations < CONFIRMED_AFTER),
        };
      };

      const runPool = async (items, limit, worker) => {
        let next = 0;
        await Promise.all(
          Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (next < items.length) {
              const current = next;
              next += 1;
              await worker(items[current]);
            }
          })
        );
      };

      const fundedCount = () =>
        Object.keys(keyPairs).filter((addr) => (fundsByAddress[addr]?.received || 0) > 0).length;

      await runPool(entries, 8, async ([address]) => {
        try {
          const info = await explorerJson(`/address/${address}`);
          fundsByAddress[address] = summarizeFunds(address, info);
        } catch (error) {
          console.warn('Failed to load address info for', address, error);
          fundsByAddress[address] = fundsByAddress[address] || summarizeFunds(address, null);
        }
        checked += 1;
        publishFunds(keyPairs, fundsByAddress);
        if (!watch) {
          setFundsProgress({
            total: entries.length,
            checked,
            funded: fundedCount(),
            phase: 'keys',
          });
        }
      });

      const fundedEntries = entries.filter(([address]) => (fundsByAddress[address]?.received || 0) > 0);
      if (!watch) {
        setFundsProgress({
          total: fundedEntries.length || entries.length,
          checked: fundedEntries.length ? 0 : entries.length,
          funded: fundedCount(),
          phase: fundedEntries.length ? 'units' : 'done',
        });
      }

      if (fundedEntries.length > 0) {
        let unitsLoaded = 0;
        await runPool(fundedEntries, 4, async ([address, privateKey]) => {
          try {
            const utxos = (await explorerJson(`/address/${address}/utxo`)) || [];
            if (!Array.isArray(utxos)) return;
            const previous = fundsByAddress[address] || {};
            const fromUtxos = summarizeFunds(address, null, utxos);
            fundsByAddress[address] = {
              received: Math.max(previous.received || 0, fromUtxos.received),
              available: Math.max(previous.available || 0, fromUtxos.available),
              unconfirmed: Math.max(previous.unconfirmed || 0, fromUtxos.unconfirmed),
              confirmations: utxos.length ? fromUtxos.confirmations : (previous.confirmations || 0),
              pending: fromUtxos.pending || previous.pending,
            };
            const existingHex = new Map(
              (refsByAddress[address] || [])
                .filter((row) => row.tx_raw_hex)
                .map((row) => [`${row.tx_hash}:${row.tx_output}`, row.tx_raw_hex])
            );
            refsByAddress[address] = utxos.map((utxo) => ({
              tx_hash: utxo.txid,
              tx_raw_hex: existingHex.get(`${utxo.txid}:${utxo.vout}`) || '',
              public_key: address,
              private_key: privateKey,
              tx_output: utxo.vout,
              value: utxo.value,
              confirmed: Boolean(utxo.status?.confirmed),
              confirmations: utxoConfirmations(utxo, tipHeight),
              blockHeight: utxo.status?.block_height || null,
            }));
            publishFunds(keyPairs, fundsByAddress);
            publishRefs(refsByAddress);
          } catch (error) {
            console.warn('Failed to load UTXOs for', address, error);
          }
          unitsLoaded += 1;
          if (!watch) {
            setFundsProgress({
              total: fundedEntries.length,
              checked: unitsLoaded,
              funded: fundedCount(),
              phase: 'units',
            });
          }
        });
      }

      if (!watch) {
        setFundsProgress((prev) => ({ ...prev, phase: 'done' }));
      }

      const missingHex = Object.values(refsByAddress)
        .flat()
        .filter((row) => row.tx_hash && !row.tx_raw_hex);
      if (missingHex.length > 0) {
        void runPool(missingHex, 3, async (row) => {
          const hex = await explorerText(`/tx/${row.tx_hash}/hex`);
          if (!hex) return;
          row.tx_raw_hex = hex;
          publishRefs(refsByAddress);
        }).catch((error) => {
          console.warn('Failed to preload transaction hex', error);
        });
      }

      console.log('--- AVAILABLE KEYS ---');
      console.log(Object.values(refsByAddress).flat());
    } finally {
      fetchInFlight.current = false;
    }
  }, []);

  const ensureUtxoHex = useCallback(async (index) => {
    const current = refsRef.current[index];
    if (!current) return null;
    if (current.tx_raw_hex) return current;
    const hex = await explorerText(`/tx/${current.tx_hash}/hex`);
    if (!hex) return current;
    const updated = { ...current, tx_raw_hex: hex };
    setRefs((prev) => prev.map((row, rowIndex) => (rowIndex === index ? updated : row)));
    return updated;
  }, []);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  useEffect(() => {
    const highest = getHighestFundedUnit(refs, 450);
    setCurrentIndex(highest ? highest.index : null);
  }, [refs]);


  const publishLiveCount = useCallback((count) => {
    window.dispatchEvent(new CustomEvent('theblocknote:live-visits', { detail: count }))
  }, [])

  return (
    <>
      <SharedContext.Provider value={{ refs, setRefs, addressFunds, fundsProgress, currentIndex, setCurrentIndex, refreshRefs: fetchAddresses, ensureUtxoHex }}>
        <LiveVisitBeacon onCount={publishLiveCount} />
        <div>
          <div className="h-screen bg-[radial-gradient(circle_at_center,_#3a5ca7_10%,_#1e2a4a_100%,_#0c0f1a_120%)] text-white relative overflow-x-hidden overflow-y-auto pb-50">
              <Routes>
                <Route path="/" element={<MainPage />} />
                <Route path="/power" element={<PowerPage />} />
                <Route path="/read" element={<ReadPage />} />
                <Route path="/generate" element={<GeneratePage />} />
                <Route path="/status" element={<StatusPage />} />

              </Routes>
          </div>
        </div>
      </SharedContext.Provider>
    </>
  )
}

export default App
