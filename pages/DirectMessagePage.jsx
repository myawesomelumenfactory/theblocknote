import { motion } from 'framer-motion';
import GlassCard from '../components/GlassCard';
import DirectCompose from '../components/DirectCompose';
import DirectInbox from '../components/DirectInbox';
import { windowMotion } from '../services/introMotion';

export default function DirectMessagePage() {
  return (
    <motion.div
      {...windowMotion({
        delay: 0.2,
        duration: 0.8,
        ease: [0.4, 0, 0.2, 1],
      })}
      className="w-full px-4 sm:px-6 lg:px-8 pt-4 pb-16"
    >
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <GlassCard className="p-6 md:p-8">
          <DirectInbox />
        </GlassCard>
        <GlassCard className="p-6 md:p-8">
          <DirectCompose />
        </GlassCard>
      </div>
    </motion.div>
  );
}
