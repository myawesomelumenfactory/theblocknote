import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import GlassCard from '../components/GlassCard'
import DirectInbox from '../components/DirectInbox'
import { windowMotion } from '../services/introMotion'

export default function MessagesPage() {
  const { address: rawAddress } = useParams()
  const address = useMemo(() => {
    try {
      return decodeURIComponent(String(rawAddress || '').trim())
    } catch {
      return String(rawAddress || '').trim()
    }
  }, [rawAddress])

  return (
    <motion.div
      {...windowMotion({
        delay: 0.2,
        duration: 0.8,
        ease: [0.4, 0, 0.2, 1],
      })}
      className="w-full px-4 sm:px-6 lg:px-8 pt-4 pb-16"
    >
      <div className="max-w-3xl mx-auto">
        <GlassCard className="p-6 md:p-8">
          <DirectInbox initialAddress={address} autoLoad />
        </GlassCard>
      </div>
    </motion.div>
  )
}
