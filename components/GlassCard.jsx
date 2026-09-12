
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
      bg-[color:var(--theme-card-bg)] rounded-3xl border border-[color:var(--theme-card-border)]
      shadow-[var(--theme-panel-shadow)] hover:shadow-[var(--theme-panel-shadow)] transition-all duration-300
        ${className}
      `}
      style={{ backdropFilter: 'blur(var(--theme-card-blur))', WebkitBackdropFilter: 'blur(var(--theme-card-blur))' }}
    >
      {children}
    </div>
  );
}
