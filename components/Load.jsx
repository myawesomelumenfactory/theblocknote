
import { motion } from "framer-motion";
import GlassCard from "../components/GlassCard";
import { Activity } from "lucide-react";

import QRCode from "react-qr-code";
import React, { useEffect, useState } from 'react';

import * as bitcoin from "bitcoinjs-lib";
import * as ecc from 'tiny-secp256k1';
import ECPairFactory from 'ecpair';
import { Buffer } from 'buffer'; // Needed in React
import { SharedContext } from '../src/SharedContext';
import { useContext } from 'react';
import UTXOCard from "./UTXOCard";
import { AnimatePresence } from 'framer-motion';

export default function Load() {

    const [ keys, setKeys ] = useState(null);
    const { refs, setRefs } = useContext(SharedContext);
    const { currentIndex, setCurrentIndex } = useContext(SharedContext);

    const ECPair = ECPairFactory(ecc);
    const network = bitcoin.networks.bitcoin; // mainnet
    const keyPair = ECPair.makeRandom({network});
    const pubkey = Buffer.from(keyPair.publicKey);
    const privKey = keyPair.toWIF();
  
    const { address } = bitcoin.payments.p2pkh({
      pubkey,
      network: bitcoin.networks.bitcoin,
    });
  
    // Load localStorage or initialize
    let keyPairs = JSON.parse(localStorage.getItem('keyPairs'));
    if (!keyPairs) {
      keyPairs = {};
    }

    const handleToggleSelection =  (index) => {
        setCurrentIndex(index);
    };
    
    // Store new key pair
    keyPairs[address] = privKey;
  
    // Save updated object to localStorage
    localStorage.setItem('keyPairs', JSON.stringify(keyPairs));

    return (
        
        <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ 
            delay: 2,
            duration: 3.2,
            ease: [0.4, 0, 0.2, 1] // Custom cubic-bezier for smooth, natural motion
            }}
            className="glass-card rounded-2xl p-6"
        >
        {<GlassCard className="p-8 mb-8 max-w-5xl mx-auto">

        <div className="flex items-center gap-3 mb-6">
            <Activity className="w-6 h-6 text-orange-400" />
            <h2 className="text-2xl font-bold text-white">Load bitcoins (units) 
            <span className="text-sm"> (min 0.00001 BTC)</span>
            </h2>
            <br />
        </div>

        <br />
        <div className="flex items-center justify-center gap-3 mb-6">
            { <QRCode
                value={address}
                size='256'
                bgColor="rgba(255, 255, 0, 0)"  // Try transparent background
                fgColor="black"  // richer, deeper orange
                level="H" // High error correction for image overlay
                includeMargin={true}
                style={{
                height: "auto",
                maxWidth: "20%",
                width: "20%",
                borderRadius: "5px", // prettier edges
                boxShadow: "0 0px 0px rgba(0, 0, 0, 0.15)"
                }}
            />}
        </div>
   
        <div className="flex items-center gap-3 mb-6">
            <Activity className="w-6 h-6 text-blue-400" />
            <h2 className="text-2xl font-bold text-white">Participation Keys Available</h2>
            <br />
        </div>

        {refs !== null && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <AnimatePresence>
                {refs.map((utxo, index) => (
                    <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ 
                        delay: index * 0.05,
                        duration: 0.3,
                        ease: "easeOut"
                    }}
                    onClick={() => handleToggleSelection(index)}
                    >
                    <UTXOCard
                        utxo={utxo}
                        index={index}
                    />
                    </motion.div>
                ))}
                </AnimatePresence>
            </div>
        )}

        {refs === null && (
            <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
            >
            <div className="glass-panel rounded-3xl p-8 max-w-md mx-auto">
                <div className="text-black-400 text-lg mb-2">No Participation Keys Available</div>
                <div className="text-black-500 text-sm">
                Your Participation Keys will appear here once you enough bitcoins (units) has been sent.
                </div>
            </div>
            </motion.div>
        )}

        </GlassCard> }
        </motion.div>
    );
}
