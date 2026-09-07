import React, { useState } from 'react';
import Text from '../components/Text';
import { motion } from "framer-motion";
import GlassCard from "../components/GlassCard";

const DiscoverPage = () => {
  const [address, setAddress] = useState('');
  const [opReturnData, setOpReturnData] = useState([]);
 
  function decodeOpReturn(scriptHex) {
    if (!scriptHex || !scriptHex.startsWith("6a")) return null;
  
    try {
      let dataHex = scriptHex.slice(2); // remove '6a'
  
      // If next byte is a valid length prefix (and optional), remove it
      const possibleLengthByte = parseInt(dataHex.slice(0, 2), 16);
      if (dataHex.length >= 2 + possibleLengthByte * 2) {
        dataHex = dataHex.slice(2); // remove length byte
      }
  
      let decoded = '';
      for (let i = 0; i < dataHex.length; i += 2) {
        const hexByte = dataHex.substr(i, 2);
        const charCode = parseInt(hexByte, 16);
        // Printable ASCII range: 32-126
        if (charCode >= 32 && charCode <= 126) {
          decoded += String.fromCharCode(charCode);
        } else {
          decoded += '.'; // show dots for non-printable characters
        }
      }
      return decoded;
    } catch (err) {
      console.error("Error decoding OP_RETURN:", err);
      return null;
    }
  }
  
  const onAddressChange = async (newValue) => {
    setAddress(newValue);
    console.log("New Address:", newValue);
    
    if (!newValue) {
      setOpReturnData([]);
      return;
    }

    try {
      const response = await fetch(
        `https://blockstream.info/api/address/${newValue}/txs`
      );
      if (!response.ok) throw new Error("Network response was not ok");
      const txs = await response.json();

      console.log("Fetched transactions:", txs);

      const opReturnTexts = [];

      txs.forEach((tx) => {
        tx.vout.forEach((output) => {
          if (output.scriptpubkey_type === "op_return") {
            console.log('--- OUTPUT ---');
            opReturnTexts.push({
              op_return_text: decodeOpReturn(output.scriptpubkey),
            });
          }
        });
      });

      console.log("OP_RETURN extracted:", opReturnTexts);

      setOpReturnData(opReturnTexts);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      setOpReturnData([]);
    }
  };

  return (
    <>
    </>
  );
};

export default DiscoverPage;
