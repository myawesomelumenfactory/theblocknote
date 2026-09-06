
import React from "react";
import { motion } from "framer-motion";
import GlassCard from "../components/GlassCard";
import Compose from '../components/Compose';
import Introduction from '../components/Introduction';
import LiveStatusSentence from '../components/LiveStatusSentence';

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
              className="w-full"
          >
          {<GlassCard className="p-6 md:p-8 mb-6">
            <Introduction />
          </GlassCard> }
        </motion.div>

        <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ 
            delay: 2,
            duration: 3.2,
            ease: [0.4, 0, 0.2, 1]
            }}
            className="w-full"
        >
        {<GlassCard className="p-6 md:p-8">
            <Compose />
        </GlassCard> }
        <LiveStatusSentence className="text-white/80 text-lg md:text-xl font-medium text-center mt-4 leading-tight" />
      </motion.div>

    </div>
  );
}
