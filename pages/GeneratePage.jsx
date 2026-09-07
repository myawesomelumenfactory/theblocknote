// pages/HomePage.js
import React, { useEffect, useState } from 'react';
import { motion } from "framer-motion";
import GlassCard from "../components/GlassCard";
import { decodeOpReturn } from '../services/TheBlockNote';
import { windowMotion } from '../services/introMotion';


const GeneratePage = () => {

  const fetchTxids = async(from, to) => {

    var immutables = [];

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for(var currentBlockHeight = from ; currentBlockHeight <= to ; currentBlockHeight++) {
      console.log('--- FETCH BLOCK ' + currentBlockHeight + ' ---');

      fetch(`https://blockstream.info/api/block-height/${currentBlockHeight}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error: ${res.status}`);
        }
        return res.text();
      })
      .then((currentBlockHexNumber) => {
  
        console.log('--- FETCHING ' + currentBlockHexNumber + ' TRANSACTIONS ---');
        console.log(currentBlockHexNumber);
      
        fetch(`https://blockstream.info/api/block/${currentBlockHexNumber}/txids`)
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP error: ${res.status}`);
          }
          return res.json();
        })
        .then((transactions) => {
          // save all transactions
          console.log('--- TRANSACTIONS ---');

          transactions.forEach(tx => {
            immutables.push(tx);
          })
        })
        .catch((error) => {
          const fileName = "immutables.json";
          const json = JSON.stringify(immutables, null, 2); // Pretty-print JSON
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
      
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          a.click();
      
          URL.revokeObjectURL(url); // Clean up
        })
      })

      var delay = 250;
      console.log(`Waiting for ${delay} ms before fetching next block...`);
      await sleep(delay);  // Introduces the delay
    }

    const fileName = "immutables.json";
    const json = JSON.stringify(immutables, null, 2); // Pretty-print JSON
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();

    URL.revokeObjectURL(url); // Clean up
  }

  const fetchTheBlockNote = async() => {

    var immutables = [];
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      const res = await fetch(`${import.meta.env.BASE_URL}data/scripts.json`);
      if (!res.ok) throw new Error('Failed to load input file');
      const data = await res.json();
  
      // Process each TX sequentially with delay
      for (let i = 0; i < data.length ; i++) {
        const tx = data[i];
        console.log(`-- PARSING TX for THE BLOCK NOTE ${tx} (${i + 1}/${data.length}) ---`);
  
        const delay = 250;
        console.log(`Waiting for ${delay} ms...`);
        await sleep(delay);

        tx.out.forEach((out, index) => {
          immutables.push({
            "index": tx.hash + "_" + index,
            "time": tx.time,
            "value": decodeOpReturn(out.script),
          });
        });
       
      }
  
      // After all TXs are fetched, save to file
      console.log('Saving to txs.json...');
      const fileName = "immutables.json";
      const json = JSON.stringify(immutables, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
  
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url); // Clean up
  
      console.log('Download triggered.');
  
    } catch (err) {
      console.error('Error during fetchOpReturns:', err);
    }
  }

  const fetchOpReturns = async () => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    let txs = [];
  
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}data/txids.json`);
      if (!res.ok) throw new Error('Failed to load input file');
      const data = await res.json();
  
      // Process each TX sequentially with delay
      for (let i = 0; i < data.length ; i++) {
        const tx = data[i];
        console.log(`-- PARSING TX ${tx} (${i + 1}/${data.length}) ---`);
  
        const delay = 250;
        console.log(`Waiting for ${delay} ms...`);
        await sleep(delay);
  
        const url = `https://blockchain.info/rawtx/${tx}`;
        try {
          const txRes = await fetch(url);
          if (!txRes.ok) {
            console.warn(`Failed to fetch TX ${tx}: ${txRes.status}`);
            continue;
          }
  
          const txData = await txRes.json();
          txs.push(txData);
          console.log(txData);
        } catch (err) {
          console.error(`Error fetching TX ${tx}:`, err);
        }
      }
  
      // After all TXs are fetched, save to file
      console.log('Saving to txs.json...');
      const fileName = "txs.json";
      const json = JSON.stringify(txs, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
  
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url); // Clean up
  
      console.log('Download triggered.');
  
    } catch (err) {
      console.error('Error during fetchOpReturns:', err);
    }
  };
  

  const onGenerate = async () => {
    console.log('--- GENERATE ---');

    var from = 909895; // starting block number
    var latest = 909896;
    var currentBlockHeight = from;
    var currentBlockHexNumber = 0;
    var txids = [];
    var immutables = [];

    fetchTheBlockNote();

    //fetchOpReturns();

    //fetchTxids(from, latest);

    /*
    fetch(`https://blockstream.info/api/block-height/${currentBlockHeight}`)
    .then((res) => {
      if (!res.ok) {
        throw new Error(`HTTP error: ${res.status}`);
      }
      return res.text();
    })
    .then((data) => {

      console.log('--- FETCHING ' + currentBlockHeight + ' TRANSACTIONS ---');
      console.log(data);

      // save the current block hex number
      currentBlockHexNumber = data;

      fetch(`https://blockstream.info/api/block/${currentBlockHexNumber}/txids`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error: ${res.status}`);
        }
        return res.json();
      })
      .then((transactions) => {
        // save all transactions

        console.log('--- TRANSACTIONS ---');
        
        txids = transactions;
        immutables = transactions;

        console.log('--- SAVING TO IMMUTABLES');
        console.log(immutables);

        const fileName = "immutables.json";
        const json = JSON.stringify(immutables, null, 2); // Pretty-print JSON
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
    
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
    
        URL.revokeObjectURL(url); // Clean up

      })
    })
    */
    // fetch the block height hex: https://blockstream.info/api/block-height/906867
    // and save it to currentBlockHexNumber
    // after that fetch all txids from the currentBlockHexNumber using this API: https://blockstream.info/api/block/00000000000000000000a13243670d19497009806bc05a05737d2cc54a8e52f1/txids
    // save it to txids;
    // repeat this code to retrieve all the txids from the block number 906867 to the latest block number (910639)
    // approximatively 3772 blocks to fetch.

    // make a function to save txids to a file (to be downloaded?)
    // once all txids has been fetched it will be time to fetch individual tx content with the API: https://blockchain.info/rawtx/${txid}
    // by fetching this transaction data you will need to save all the out scripts content and save under the following structure:
    /*
{
  time: timestamp,
  value: OP_RETURN script
},
{
  time: timestamp,
  value: OP_RETURN script
},
    */
   // from theses values generate the immutables.json file that contains all the OP_RETURNs fields from each transactions.
   // in this file then filter only the Block Note protocol messages that contains the following start: t 0 0 "My message"

  };

  return (
    <>
        <motion.div 
            {...windowMotion({
            delay: 2,
            duration: 3.2,
            ease: [0.4, 0, 0.2, 1]
            })}
            className="glass-card rounded-2xl p-6"
        >
          <GlassCard className="p-8 mb-8 max-w-5xl mx-auto">
          <button
            className="bg-white/20 hover:bg-blue-100 text-black-600 font-semibold py-2 px-4 rounded border-white/50 transition duration-200"
            onClick={onGenerate}
          >
            Generate
          </button>

          </GlassCard>
     
      </motion.div>
    </>
  )
};

export default GeneratePage;