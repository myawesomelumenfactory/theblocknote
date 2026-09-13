import React from "react";
import { motion } from "framer-motion";
import { Send, Loader2 } from "lucide-react";
import { useLanguage } from "../src/i18n/LanguageContext";

export default function EmbedButton({ 
  onClick, 
  disabled = false, 
  isLoading = false,
  text,
}) {
  const { t } = useLanguage();
  const label = text || t('compose.send');

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled || isLoading}
      whileHover={!disabled ? { scale: 1.01 } : {}}
      whileTap={!disabled ? { scale: 1.02 } : {}}
      className={`
        compose-send-btn relative w-full h-14 rounded-2xl font-semibold text-lg text-center
        transition-all duration-300 overflow-hidden border
        ${disabled || isLoading 
          ? 'bg-black text-white border-black cursor-not-allowed' 
          : 'bg-black text-white border-black hover:bg-black shadow-none cursor-pointer'
        }
      `}
    >
      <div className="relative flex items-center justify-center gap-3">
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{t('compose.embedding')}</span>
          </>
        ) : (
          <>
            <Send className="w-5 h-5" />
            <span>{label}</span>
          </>
        )}
      </div>
    </motion.button>
  );
}
