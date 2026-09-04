
import React from "react";
import { motion } from "framer-motion";
import GlassCard from "../components/GlassCard";
import { Activity } from "lucide-react";
import { Bitcoin } from "lucide-react";
import Badge from '../components/Badge';
import transactions from '../src/data/transactions-examples.json'

export default function Transactions() {

    function genesis(hex) {
        let result = '';
        for (let i = 0; i < hex.length; i += 2) {
          const byte = parseInt(hex.substr(i, 2), 16);
          // Only include printable ASCII characters
          if (byte >= 32 && byte <= 126) {
            result += String.fromCharCode(byte);
          } else {
            result += '.'; // replace non-printables with a dot or skip
          }
        }
        return result;
      }
    
      function hexToText(hex) {
        if (!hex) return '';
      
        // Remove possible "6a" OP_RETURN prefix or any non-hex prefix if you want:
        if (hex.startsWith('6a')) {
          hex = hex.slice(2);
        }
    
        hex = hex.slice(2);
    
        let str = '';
        for (let i = 0; i < hex.length; i += 2) {
          const code = parseInt(hex.substr(i, 2), 16);
          if (code) str += String.fromCharCode(code);
        }
        return str;
      }

  return (
    <GlassCard className="p-8 mb-8 max-w-5xl mx-auto" delay={0.2}>
        <div className="flex items-center gap-3 mb-6">
            <Activity className="w-6 h-6 text-blue-400" />
            <h2 className="text-2xl font-bold text-white">Recent Transactions</h2>
        </div>

        {transactions.slice(0, 5).map((tx, index) => (
            <motion.div
                key={tx.txid}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="glass-card rounded-xl p-4 hover:bg-white/20 transition-all duration-300 cursor-pointer"
            >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 flex items-center justify-center">
                        <Bitcoin className="w-5 h-5 text-white" />
                        </div>
                        <div>
                        <div className="font-mono text-sm text-white/70 mb-1">
                            {tx.txid}
                        </div>

                        <div className="text-white font-medium">
                            {tx.vin
                            .map((output, index) => (
                                <p key={index} className="text-sm text-white-400 break-words">
                                "{ genesis(output.scriptsig) }"
                                </p>
                            ))}

                            {tx.vout
                            .filter((output) => output.scriptpubkey_type === "op_return")
                            .map((output, index) => (
                                <p key={index} className="text-sm text-white-400 break-words">
                                "{ hexToText(output.scriptpubkey) }"
                                </p>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <Badge color={tx.status ? 'green' : 'yellow'} text={tx.status ? 'Confirmed' : 'Pending'} ></Badge>
                    <div className="text-sm text-white/60">
                    Jul 18, 11:20
                    </div>
                    </div>
                </div>
            </motion.div>
        ))}
    </GlassCard>
  );
}
