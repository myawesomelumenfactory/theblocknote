
import React, { useState } from "react";
import { motion } from "framer-motion";
import { Type, AlertCircle } from "lucide-react";
import { useEffect } from 'react';

const DEFAULT_PLACEHOLDERS = [
  "Your ideas matter, write them. Forever.",
  "Freedom of Speech. For all.",
  "Raise your voice without interruption",
  "Your opinions has always been valuable",
];

export default function TextInput({ 
  value, 
  onChange, 
  maxLength = 80,
  fee = 0,
  placeholderOptions = DEFAULT_PLACEHOLDERS,
  className = ""
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const remainingChars = maxLength - value.length;
  const placeholder = placeholderOptions[placeholderIndex % placeholderOptions.length] || "";

  useEffect(() => {
    if (value || isFocused) return undefined;
    const tick = window.setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % placeholderOptions.length);
    }, 4500);
    return () => window.clearInterval(tick);
  }, [value, isFocused, placeholderOptions.length]);

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
          placeholder={placeholder}
          className={`
            w-full h-32 pl-12 pr-4 py-4 
            backdrop-blur-xl bg-white-900/10 rounded-2xl border border-white/20
            text-base text-white placeholder:text-2xl placeholder:text-white/55 placeholder:leading-snug resize-none
            focus:outline-none focus:bg-white-900/20 focus:border-white-500/50
            focus:shadow-[0_0_0_3px_rgba(255,165,0,0.1)]
            transition-all duration-300 font-medium
            ${isFocused ? 'shadow-2xl' : ''}
          `}
          style={{
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          }}
        />
        
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
            {remainingChars} / {fee} sats as fee
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
