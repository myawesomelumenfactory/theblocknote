
import React from "react";
import { motion } from "framer-motion";
import GlassCard from "../components/GlassCard";
import Transactions from '../components/Transactions'
import { Activity } from "lucide-react";

export default function LatestMessages() {
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
            <Activity className="w-6 h-6 text-blue-400" />
            <h2 className="text-2xl font-bold text-white">Latest Messages</h2>
        </div>

        <Transactions />
    </GlassCard> }
    </motion.div>
  );
}
