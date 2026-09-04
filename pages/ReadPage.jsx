import Header from '../components/Header';
import React, { useState } from 'react';
import Text from '../components/Text';
import { motion } from "framer-motion";
import GlassCard from "../components/GlassCard";

const ReadPage = () => {
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
      <Header/>
      <div className='max-w-5xl mx-auto'>
        <Text 
          value={address}
          onChange={onAddressChange}
          maxLength={80}
        />
      </div>
      <div>
        {opReturnData.length === 0 && 
          <div className="p-8 mb-8 max-w-5xl mx-auto">
          </div>
        }
        {opReturnData.map(({ txid, op_return_hex, op_return_text }) => (
          <div key={txid}>
            <motion.div 
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ 
                  delay: 0.2,
                  duration: 3.2,
                  ease: [0.4, 0, 0.2, 1] // Custom cubic-bezier for smooth, natural motion
                  }}
                  className="glass-card rounded-2xl p-6"
              >
              {<GlassCard className="p-8 mb-8 max-w-5xl mx-auto">
                {op_return_text}
              </GlassCard> }
            </motion.div>
          </div>
        ))}
      </div>
    </>
  );
};

export default ReadPage;
