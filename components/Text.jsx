
import React, { useState } from "react";
import { motion } from "framer-motion";
import { Type, AlertCircle } from "lucide-react";
import { useEffect } from 'react';

export default function Text({ 
  value, 
  onChange,
  maxLength = 80,
  className = ""
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [placeholder, setPlaceholder] = useState("");
  
  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          maxLength={maxLength}
          placeholder="Enter any address"
          className={`
            w-full h-32 pl-12 pr-4 py-4 
            backdrop-blur-xl bg-white-900/10 rounded-2xl border border-white/20
            text-white placeholder-white/50 resize-none
            focus:outline-none focus:bg-white-900/20 focus:border-white-500/50
            focus:shadow-[0_0_0_3px_rgba(255,165,0,0.1)]
            transition-all duration-300 font-medium
            ${isFocused ? 'shadow-2xl' : ''}
          `}
          style={{
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: '48px',
            lineHeight: '1'
          }}
        />
        
        {/* Character counter */}
          <motion.div 
            className="absolute bottom-3 right-3 flex items-center gap-2"
          >
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
