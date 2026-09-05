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
import { fetchBalances, fetchTipHeight, fetchTxHex, fetchUnspents } from '../services/HaskoinStore';
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

      const tipHeight = await fetchTipHeight();
      let checked = 0;

      const summarizeUtxos = (previous = {}, utxos = []) => {
        const utxoSum = utxos.reduce((sum, utxo) => sum + (utxo.value || 0), 0);
        const utxoUnconfirmed = utxos
          .filter((utxo) => !utxo.status?.confirmed)
          .reduce((sum, utxo) => sum + (utxo.value || 0), 0);
        const confirmationCounts = utxos.map((utxo) => utxoConfirmations(utxo, tipHeight));
        const confirmations = confirmationCounts.length ? Math.min(...confirmationCounts) : (previous.confirmations || 0);
        const received = Math.max(previous.received || 0, utxoSum);
        const available = Math.max(previous.available || 0, utxoSum);
        const unconfirmed = Math.max(previous.unconfirmed || 0, utxoUnconfirmed);
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

      const KEY_BATCH = 40;
      for (let i = 0; i < entries.length; i += KEY_BATCH) {
        const batch = entries.slice(i, i + KEY_BATCH);
        try {
          const balances = await fetchBalances(batch.map(([address]) => address));
          for (const [address] of batch) {
            fundsByAddress[address] = balances[address] || fundsByAddress[address] || summarizeUtxos();
            checked += 1;
            if (!watch) {
              setFundsProgress({
                total: entries.length,
                checked,
                funded: fundedCount(),
                phase: 'keys',
              });
            }
          }
          publishFunds(keyPairs, fundsByAddress);
        } catch (error) {
          console.warn('Failed to load address balances', error);
          for (const [address] of batch) {
            fundsByAddress[address] = fundsByAddress[address] || summarizeUtxos();
            checked += 1;
          }
          if (!watch) {
            setFundsProgress({
              total: entries.length,
              checked,
              funded: fundedCount(),
              phase: 'keys',
            });
          }
        }
      }

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
        const UNIT_BATCH = 20;
        for (let i = 0; i < fundedEntries.length; i += UNIT_BATCH) {
          const batch = fundedEntries.slice(i, i + UNIT_BATCH);
          try {
            const utxosByAddress = await fetchUnspents(batch.map(([address]) => address), tipHeight);
            for (const [address, privateKey] of batch) {
              const utxos = utxosByAddress[address] || [];
              fundsByAddress[address] = summarizeUtxos(fundsByAddress[address], utxos);
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
              unitsLoaded += 1;
              if (!watch) {
                setFundsProgress({
                  total: fundedEntries.length,
                  checked: unitsLoaded,
                  funded: fundedCount(),
                  phase: 'units',
                });
              }
            }
            publishFunds(keyPairs, fundsByAddress);
            publishRefs(refsByAddress);
          } catch (error) {
            console.warn('Failed to load funded units', error);
            unitsLoaded += batch.length;
            if (!watch) {
              setFundsProgress({
                total: fundedEntries.length,
                checked: Math.min(unitsLoaded, fundedEntries.length),
                funded: fundedCount(),
                phase: 'units',
              });
            }
          }
        }
      }

      if (!watch) {
        setFundsProgress((prev) => ({ ...prev, phase: 'done' }));
      }

      const missingHex = Object.values(refsByAddress)
        .flat()
        .filter((row) => row.tx_hash && !row.tx_raw_hex);
      if (missingHex.length > 0) {
        void runPool(missingHex, 3, async (row) => {
          const hex = await fetchTxHex(row.tx_hash);
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
    const hex = await fetchTxHex(current.tx_hash);
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
