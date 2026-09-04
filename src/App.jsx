import React, { useEffect, useState } from 'react';
import './App.css'
import { Routes, Route } from "react-router-dom";
import PowerPage from '../pages/PowerPage';
import MainPage from '../pages/MainPage';
import ReadPage from '../pages/ReadPage';
import GeneratePage from '../pages/GeneratePage';
import { SharedContext } from '../src/SharedContext';

import { useContext } from 'react';

function App() {

  const [refs, setRefs] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(null);

  console.log("--- THE BLOCK NOTE ---");

  useEffect(() => {
    fetchAddresses();
  }, []); // Empty dependency array means it runs once when the component mounts

  const fetchAddresses = async () => {
    
    const keyPairs = JSON.parse(localStorage.getItem('keyPairs'));

    localStorage.setItem('keyPairs', JSON.stringify(keyPairs));

    var refsData = [];
    var totalBalance = 0;
    var refIndex = 0;

    const fetchAllTransactions = async () => {
        const keyPairs = JSON.parse(localStorage.getItem('keyPairs') || '{}');
      
        const fetchPromises = Object.entries(keyPairs).map(async ([publicKey, privateKey]) => {
        const response = await fetch(`https://api.blockchain.info/haskoin-store/btc/address/${publicKey}/transactions`);
        const data = await response.json();
        
        if (data.length >= 1) {
          data.forEach(async (tx) => {
            
            const detailRes = await fetch(`https://api.blockchain.info/haskoin-store/btc/transaction/${tx.txid}`);
            const detailData = await detailRes.json();

            detailData.outputs.forEach(async (output, index) => {

              if ( output.address === publicKey && output.spent == false) {
                
                const detailTransaction = await fetch(`https://blockstream.info/api/tx/${tx.txid}/hex`);
                const detailDataTransaction = await detailTransaction.text();

                refsData.push({
                  "index": refIndex,
                  "tx_hash": tx.txid,
                  "tx_raw_hex": detailDataTransaction,
                  'public_key': publicKey,
                  "private_key": privateKey,
                  "tx_output": index,
                  "value": output.value
                });

                refIndex++;

                totalBalance += output.value;
              }
            });

          });
        }
      });
    
      // Wait for all fetches to complete
      await Promise.all(fetchPromises);
    };

    fetchAllTransactions();
    setRefs(refsData);
    console.log('--- AVAILABLE KEYS ---');
    console.log(refsData);
  };


  return (
    <>
      <SharedContext.Provider value={{ refs, setRefs, currentIndex, setCurrentIndex }}>
        <div>
          <div className="h-screen bg-[radial-gradient(circle_at_center,_#3a5ca7_10%,_#1e2a4a_100%,_#0c0f1a_120%)] text-white relative overflow-x-hidden overflow-y-auto pb-50">
              <Routes>
                <Route path="/" element={<MainPage />} />
                <Route path="/power" element={<PowerPage />} />
                <Route path="/read" element={<ReadPage />} />
                <Route path="/generate" element={<GeneratePage />} />

              </Routes>
          </div>
        </div>
      </SharedContext.Provider>
    </>
  )
}

export default App
