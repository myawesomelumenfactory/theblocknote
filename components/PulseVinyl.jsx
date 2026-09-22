import { motion } from 'framer-motion'

/**
 * Miniature vinyl: spins while playing, cover sits on the label.
 */
export default function PulseVinyl({ coverUrl, title, playing = false }) {
  return (
    <div className="relative mx-auto w-[min(100%,18rem)] aspect-square">
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={playing ? { rotate: 360 } : { rotate: 0 }}
        transition={
          playing
            ? { repeat: Infinity, duration: 4.5, ease: 'linear' }
            : { duration: 0.6, ease: [0.4, 0, 0.2, 1] }
        }
        style={{
          background:
            'radial-gradient(circle at 50% 50%, #1a1a1a 0%, #1a1a1a 28%, #0d0d0d 29%, #111 42%, #0a0a0a 43%, #151515 58%, #0c0c0c 59%, #181818 78%, #050505 79%, #222 100%)',
          boxShadow:
            'inset 0 0 0 1px rgba(255,255,255,0.06), 0 18px 40px rgba(0,0,0,0.45)',
        }}
        aria-hidden
      >
        {/* groove rings */}
        <div
          className="absolute inset-[8%] rounded-full opacity-40"
          style={{
            background:
              'repeating-radial-gradient(circle at center, transparent 0 2px, rgba(255,255,255,0.04) 2px 3px)',
          }}
        />
        {/* center label / cover */}
        <div className="absolute inset-[31%] rounded-full overflow-hidden border border-white/15 bg-[#2a1810] shadow-inner">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-3 text-center text-[10px] uppercase tracking-[0.18em] text-amber-100/70">
              {title ? title.slice(0, 28) : 'The Pulse'}
            </div>
          )}
          <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-black/40" />
          <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/80 ring-1 ring-white/20" />
        </div>
      </motion.div>

      {/* tonearm hint */}
      <div
        className={`pointer-events-none absolute -right-1 top-[18%] h-[42%] w-1 origin-top rounded-full bg-gradient-to-b from-white/50 to-white/10 transition-transform duration-500 ${
          playing ? 'rotate-[18deg]' : 'rotate-[4deg]'
        }`}
      />
    </div>
  )
}
