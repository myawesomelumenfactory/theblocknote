
import React, { useEffect, useState } from 'react';
import { Bitcoin } from "lucide-react";
import Badge from '../components/Badge';

export default function Transactions() {
    const [transactions, setTransactions] = useState([]);

    useEffect(() => {
        const ws = new WebSocket('wss://ws.blockchain.info/inv');

        ws.onopen = () => {
            ws.send(JSON.stringify({ op: 'unconfirmed_sub' }));
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);

            const hash = message.x.hash;

            // Filter outputs that are OP_RETURN (script starts with '6a')
            const opReturnMessages = message.x.out.filter((output) =>
                output.script.startsWith('6a')
            );

            if (opReturnMessages.length > 0) {
                setTransactions((prev) => [
                { hash, messages: opReturnMessages, confirmed: message.x.tx_index },
                    ...prev.slice(0, 5),
                ]);
            }
        };

        return () => {
            ws.close();
        };
    }, []);

    
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

  return (
    <div>
        {transactions.slice(0, 5).map((tx, index) => (
            <div key={index} className="glass-card rounded-xl p-4 hover:bg-white/14 border border-white/10 bg-white/10 mt-5 transition-all duration-300 cursor-pointer">
                <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 flex items-center justify-center">
                            <Bitcoin className="w-5 h-5 text-white" />
                        </div>
                        <div>
                        <div className="font-mono text-sm text-white/70 mb-1">
                            <a target="_blank" href={`https://btc.bitaps.com/${tx.hash}`}>{tx.hash}</a>
                        </div>

                        <div className="text-white font-medium">
                            <ul>
                                {Array.isArray(tx.messages) && tx.messages.map((message, index) => (
                                    <li key={index}>
                                    {decodeOpReturn(message.script)}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <Badge
                        color={tx.confirmed === 0 ? 'red' : 'green'}
                        text={tx.confirmed === 0 ? 'Unconfirmed' : 'Confirmed'}
                    />
                    <div className="text-sm text-white/60">
                    Jul 18, 11:20
                    </div>
                    </div>
                </div>
        ))}
    </div>
  );
}
