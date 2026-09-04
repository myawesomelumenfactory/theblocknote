
import React from "react";
import { motion } from "framer-motion";
import GlassCard from "../components/GlassCard";
import Compose from '../components/Compose';
import Introduction from '../components/Introduction';

export default function Speak() {
  return (
    <div>

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
            <Introduction />
          </GlassCard> }
        </motion.div>

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
            <Compose />
        </GlassCard> }
      </motion.div>

    </div>
  );
}
