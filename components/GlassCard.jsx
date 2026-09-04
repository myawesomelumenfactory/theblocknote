
import React from "react";
import { motion } from "framer-motion";

export default function GlassCard({ 
  children, 
  className = "", 
  delay = 0,
  hover = true 
}) {
  return (
    <div
      className={`
      backdrop-blur-xl bg-white/5 rounded-3xl border border-white/20
      shadow-2xl hover:shadow-[0_10px_40px_rgba(0,0,0,0.3)] transition-all duration-300
        ${className}
      `}
    >
      {children}
    </div>
  );
}
