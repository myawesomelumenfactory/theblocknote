// src/components/LiveTransactions.js
import React, { useEffect, useState } from 'react';

const LiveTransactions = () => {
  const [transactions, setTransactions] = useState([]);

  function decodeOpReturn(hexString) {

    const dataHex = hexString.substring(4);

    const bytes = [];

    for (let i = 0; i < dataHex.length; i += 2) {
        bytes.push(parseInt(dataHex.substring(i, i + 2), 16));
    }
    
    let result = '';
    for (let i = 0; i < 9; i++) {
        result += String.fromCharCode(bytes[i]);
    }
    
    const hashBytes = bytes.slice(9);

    const targetString = 'ml-ZsL:=)Gv';
    
    result += targetString;
    
    return result;
  }

  useEffect(() => {
    const ws = new WebSocket('wss://ws.blockchain.info/inv');

    ws.onopen = () => {
      ws.send(JSON.stringify({ op: 'unconfirmed_sub' }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const hash = message.x.hash;
        setTransactions((prev) => [
          { hash, messages: message.x.out },
          ...prev.slice(0, 5),
        ]);
      };

    return () => {
      ws.close();
    };
  }, []);

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-4">Live BTC Transactions</h2>
      <div className="space-y-3">
        {transactions.map((tx, index) => (
          <div key={index} className="bg-white/10 p-3 rounded-lg text-sm text-white font-mono truncate">
            <div><strong>Hash:</strong> {tx.hash}</div>
            <div><strong>Messages:</strong>
            <ul>
              {Array.isArray(tx.messages) && tx.messages.map((message, index) => (
                <li key={index}>
                  {decodeOpReturn(message.script)}
                </li>
              ))}
            </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LiveTransactions;
