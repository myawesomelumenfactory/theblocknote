import { Link } from 'react-router-dom'
import { BookOpen, Landmark, MessageSquare, Zap } from 'lucide-react'
import { motion } from 'framer-motion'
import GlassCard from '../components/GlassCard'
import { windowMotion } from '../services/introMotion'
import { useLanguage } from '../src/i18n/LanguageContext'

const STEPS = [
  { key: 'spark', icon: Zap, to: '/power' },
  { key: 'declare', icon: MessageSquare, to: '/' },
  { key: 'permanent', icon: Landmark, to: null },
]

export default function HowItWorksPage() {
  const { t } = useLanguage()

  return (
    <motion.div
      {...windowMotion({
        delay: 0.2,
        duration: 0.8,
        ease: [0.4, 0, 0.2, 1],
      })}
      className="w-full px-4 sm:px-6 lg:px-8 pt-4 pb-16"
    >
      <GlassCard className="max-w-3xl mx-auto p-6 md:p-8">
        <div className="flex items-start gap-3 mb-6">
          <BookOpen className="w-6 h-6 text-orange-400 shrink-0 mt-1" />
          <div>
            <h2 className="text-2xl font-bold text-white">{t('howItWorks.title')}</h2>
            <p className="text-white/70 mt-3 leading-relaxed">{t('howItWorks.lead')}</p>
          </div>
        </div>

        <ol className="space-y-4 mb-8">
          {STEPS.map((step, index) => {
            const Icon = step.icon
            return (
              <li
                key={step.key}
                className="rounded-2xl bg-white/5 border border-white/10 p-5"
              >
                <div className="flex items-start gap-3 mb-2">
                  <span className="shrink-0 w-8 h-8 rounded-full bg-white/10 text-white font-semibold text-sm flex items-center justify-center">
                    {index + 1}
                  </span>
                  <div className="flex items-center gap-2 min-w-0 pt-1">
                    <Icon className="w-4 h-4 text-orange-300 shrink-0" />
                    <h3 className="text-lg font-semibold text-white">{t(`howItWorks.${step.key}Title`)}</h3>
                  </div>
                </div>
                <p className="text-white/70 leading-relaxed pl-11">{t(`howItWorks.${step.key}Body`)}</p>
                {step.to ? (
                  <Link
                    to={step.to}
                    className="inline-block mt-3 ml-11 text-sm font-medium text-orange-300"
                  >
                    {t(`howItWorks.${step.key}Link`)}
                  </Link>
                ) : null}
              </li>
            )
          })}
        </ol>

        <p className="text-white/80 leading-relaxed">{t('howItWorks.close')}</p>
      </GlassCard>
    </motion.div>
  )
}
