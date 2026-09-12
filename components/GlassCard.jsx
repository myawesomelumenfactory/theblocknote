
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
      backdrop-blur-xl bg-[color:var(--theme-card-bg)] rounded-3xl border border-[color:var(--theme-card-border)]
      shadow-2xl hover:shadow-[0_10px_40px_rgba(0,0,0,0.3)] transition-all duration-300
        ${className}
      `}
    >
      {children}
    </div>
  );
}
