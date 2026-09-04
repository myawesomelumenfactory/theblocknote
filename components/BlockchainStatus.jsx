import React from "react";
import { motion } from "framer-motion";
import { 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Bitcoin,
  Hash,
  Blocks
} from "lucide-react";

export default function BlockchainStatus({ 
  status, 
  transactionId, 
  blockHeight, 
  fee 
}) {
  const getStatusConfig = (status) => {
    switch (status) {
      case "confirmed":
        return {
          icon: CheckCircle,
          color: "text-green-400",
          bgColor: "bg-green-500/20",
          borderColor: "border-green-500/30",
          title: "Confirmed",
          description: "Successfully embedded in blockchain"
        };
      case "pending":
        return {
          icon: Clock,
          color: "text-orange-400",
          bgColor: "bg-orange-500/20",
          borderColor: "border-orange-500/30",
          title: "Pending",
          description: "Awaiting blockchain confirmation"
        };
      case "failed":
        return {
          icon: AlertCircle,
          color: "text-red-400",
          bgColor: "bg-red-500/20",
          borderColor: "border-red-500/30",
          title: "Failed",
          description: "Transaction failed to process"
        };
      default:
        return {
          icon: Clock,
          color: "text-gray-400",
          bgColor: "bg-gray-500/20",
          borderColor: "border-gray-500/30",
          title: "Unknown",
          description: "Status unknown"
        };
    }
  };

  const config = getStatusConfig(status);
  const StatusIcon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className={`
        backdrop-blur-xl bg-white/10 rounded-2xl border ${config.borderColor}
        p-6 shadow-2xl
      `}
    >
      <div className="flex items-start gap-4">
        <div className={`
          w-12 h-12 rounded-xl ${config.bgColor} border ${config.borderColor}
          flex items-center justify-center
        `}>
          <StatusIcon className={`w-6 h-6 ${config.color}`} />
        </div>
        
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold text-white">{config.title}</h3>
            {status === "pending" && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4"
              >
                <div className="w-full h-full border-2 border-orange-400 border-t-transparent rounded-full"></div>
              </motion.div>
            )}
          </div>
          <p className="text-white/70 text-sm mb-4">{config.description}</p>
          
          {/* Transaction details */}
          {transactionId && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-white/50" />
                <span className="text-xs text-white/50">Transaction ID</span>
              </div>
              <p className="text-sm text-white/80 font-mono bg-white/5 rounded-lg px-3 py-2 break-all">
                {transactionId}
              </p>
              
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="flex items-center gap-2">
                  <Blocks className="w-4 h-4 text-white/50" />
                  <div>
                    <p className="text-xs text-white/50">Block Height</p>
                    <p className="text-sm text-white/80 font-semibold">{blockHeight?.toLocaleString()}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Bitcoin className="w-4 h-4 text-orange-400" />
                  <div>
                    <p className="text-xs text-white/50">Fee</p>
                    <p className="text-sm text-white/80 font-semibold">{fee} sats</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}