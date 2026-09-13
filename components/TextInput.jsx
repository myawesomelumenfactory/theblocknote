
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Type, AlertCircle } from "lucide-react";
import { useLanguage } from "../src/i18n/LanguageContext";

export default function TextInput({ 
  value, 
  onChange, 
  maxLength = 80,
  fee = 0,
  placeholderOptions,
  className = ""
}) {
  const { t, lang } = useLanguage();
  const placeholders = placeholderOptions || t('compose.placeholders') || [];
  const [isFocused, setIsFocused] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const remainingChars = maxLength - value.length;
  const placeholder = placeholders[placeholderIndex % Math.max(placeholders.length, 1)] || "";
  const showPlaceholder = !value;

  useEffect(() => {
    setPlaceholderIndex(0);
  }, [lang]);

  useEffect(() => {
    if (value || isFocused) return undefined;
    const tick = window.setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % Math.max(placeholders.length, 1));
    }, 4500);
    return () => window.clearInterval(tick);
  }, [value, isFocused, placeholders.length]);

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <div className="absolute left-4 top-4 z-10">
          <Type className="w-5 h-5 text-white/50" />
        </div>
        
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          maxLength={maxLength}
          aria-label={placeholder || t('compose.writeMessage')}
          className={`
            theme-glass w-full h-32 pl-12 pr-4 py-4 
            rounded-2xl border border-[color:var(--theme-inset-border)]
            bg-[color:var(--theme-inset-bg)]
            text-base text-white resize-none
            focus:outline-none focus:bg-[color:var(--theme-chip-bg)] focus:border-[color:var(--theme-card-border)]
            focus:shadow-[0_0_0_3px_rgba(247,147,26,0.12)]
            transition-all duration-300 font-medium
            ${isFocused ? 'shadow-[var(--theme-panel-shadow)]' : ''}
          `}
          style={{
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          }}
        />

        <div className="pointer-events-none absolute left-12 right-4 top-4 h-16 overflow-hidden">
          <AnimatePresence mode="wait">
            {showPlaceholder && (
              <motion.span
                key={placeholder}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                aria-hidden="true"
                className="absolute inset-x-0 top-0 text-2xl leading-snug text-white/55 font-medium"
                style={{
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                }}
              >
                {placeholder}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        
        {/* Character counter */}
          <motion.div 
            className="absolute bottom-3 right-3 flex items-center gap-2"
            animate={{
              color: remainingChars < 10 ? "#ef4444" : "#ffffff80"
            }}
          >
          {remainingChars < 10 && (
            <AlertCircle className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">
            {t('compose.fee', { remaining: remainingChars, fee })}
          </span>
        </motion.div>
      </div>
      
      {/* Focus indicator */}
      {isFocused && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="absolute -inset-1 bg-gradient-to-r from-white-500/20 to-white-600/20 rounded-3xl blur-xl -z-10"
        />
      )}
    </div>
  );
}
