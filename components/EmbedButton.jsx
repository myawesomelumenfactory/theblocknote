import React from "react";
import { motion } from "framer-motion";
import { Send, Loader2 } from "lucide-react";

export default function EmbedButton({ 
  onClick, 
  disabled = false, 
  isLoading = false,
  text = "Send"
}) {

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled || isLoading}
      whileHover={!disabled ? { scale: 1.01 } : {}}
      whileTap={!disabled ? { scale: 1.02 } : {}}
      className={`
        text-white cursor-not-allowed font-medium rounded-lg text-sm px-5 py-2.5 text-center
        relative w-full h-14 rounded-2xl font-semibold text-lg
        transition-all duration-300 overflow-hidden
        ${disabled || isLoading 
          ? 'bg-gray-200/12 text-gray-200 cursor-not-allowed hover:shadow-xs' 
          : 'bg-white/10 text-white hover:bg-white/12 shadow-md cursor-pointer'
        }
      `}
    
    >
      {/* Background glow effect */}
      {!disabled && !isLoading && (
        <div className="absolute inset-0 bg-gradient-to-r from-white-500 to-white-600 hover:opacity-20 transition-opacity duration-300 blur-xl"></div>
      )}

      
      {/* Button content */}
      <div className="relative flex items-center justify-center gap-3">
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Embedding your ideas...</span>
          </>
        ) : (
          <>
            <Send className="w-5 h-5" />
            <span>{text}</span>
          </>
        )}
      </div>
      
      {/* Shimmer effect */}
      {!disabled && !isLoading && (
        <div className="absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-1000"></div>
      )}
    </motion.button>
  );
}