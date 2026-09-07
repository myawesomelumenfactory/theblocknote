
import React from "react";
import { motion } from "framer-motion";
import GlassCard from "../components/GlassCard";
import Compose from '../components/Compose';
import Introduction from '../components/Introduction';
import LiveStatusSentence from '../components/LiveStatusSentence';
import { windowMotion } from '../services/introMotion';

const intro = {
  delay: 2,
  duration: 3.2,
  ease: [0.4, 0, 0.2, 1],
};

export default function Speak() {
  return (
    <div>

        <motion.div
              {...windowMotion(intro)}
              className="w-full"
          >
          {<GlassCard className="p-6 md:p-8 mb-6">
            <Introduction />
          </GlassCard> }
        </motion.div>

        <motion.div
            {...windowMotion(intro)}
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
