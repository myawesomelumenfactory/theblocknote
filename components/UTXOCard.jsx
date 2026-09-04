import React from 'react';
import { motion } from 'framer-motion';
import { Check, Hash, Clock, Shield, Tag } from 'lucide-react';
import { SharedContext } from '../src/SharedContext';
import { useContext } from 'react';

export default function UTXOCard({ utxo, index }) {

  const {currentIndex, setCurrentIndex } = useContext(SharedContext);

  const formatSats = (sats) => {
    return new Intl.NumberFormat('en-US').format(sats);
  };

  const formatTxId = (txId) => {
    return `${txId.slice(0, 8)}...${txId.slice(-8)}`;
  };

  const formatAddress = (address) => {
    return `${address.slice(0, 12)}...${address.slice(-12)}`;
  };

  const getScriptTypeColor = (scriptType) => {
    const colors = {
      'P2PKH': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      'P2SH': 'bg-green-500/20 text-green-300 border-green-500/30', 
      'P2WPKH': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      'P2WSH': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
      'P2TR': 'bg-pink-500/20 text-pink-300 border-pink-500/30'
    };
    return colors[scriptType] || 'bg-gray-500/20 text-gray-300 border-gray-500/30';
  };

  const getConfirmationColor = (confirmations) => {
    if (confirmations >= 6) return 'text-green-350';
    if (confirmations >= 3) return 'text-yellow-400';
    return 'text-orange-400';
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`
      ${
        utxo.index == currentIndex
          ? 'glass-panel rounded-3xl p-6 cursor-pointer transition-all duration-300 bg-orange-100/5 border-white/30 border-2' 
          : 'glass-panel rounded-3xl p-6 cursor-pointer transition-all duration-300 bg-orange-100/5'
      }
      `}
    >

      {/* Amount */}
      <div className="mb-4">
        <div className="text-2xl font-bold text-white mb-1">
          {formatSats(utxo.value)} SATS
        </div>
        <div className="text-gray-400 text-sm">
          ≈ {(utxo.value / 100000000).toFixed(8)} BTC
        </div>
      </div>

      {/* Script Type & Output Index */}
      <div className="flex items-center gap-2 mb-4">
        <div className="text-gray-400 text-xs">
          Output #{index}
        </div>
      </div>

      {/* Address */}
      <div className="mb-4">
        <div className="text-gray-400 text-xs mb-1">Address</div>
        <div className="text-gray-300 text-sm font-mono">
          <a target="_blank" href={`https://bitaps.com/${utxo.public_key}`}>
            {formatAddress(utxo.public_key)}
          </a>
        </div>
      </div>

      {/* Confirmations */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <span className={`text-sm font-medium ${getConfirmationColor(utxo.value)}`}>
            {utxo.value} confirmations
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Shield className={`w-4 h-4 ${getConfirmationColor(utxo.value)}`} />
          <span className="text-xs text-gray-400">
            Block {utxo.value}
          </span>
        </div>
      </div>
     
    </motion.div>
  );
}