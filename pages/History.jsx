
import React, { useState, useEffect } from "react";
import { BlockNote } from "../entities/BlockNote";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { 
  FileText, 
  Search, 
  ExternalLink,
  Calendar,
  Filter
} from "lucide-react";

import GlassCard from "../components/GlassCard";
import BlockchainStatus from "../components/BlockchainStatus";

export default function HistoryPage() {
  const [notes, setNotes] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      const data = await BlockNote.list("-created_date");
      setNotes(data);
    } catch (error) {
      console.error("Error loading notes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredNotes = notes.filter(note => {
    const matchesSearch = note.text_content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || note.confirmation_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="grid gap-6">
          {Array(3).fill(0).map((_, i) => (
            <GlassCard key={i} className="p-6 animate-pulse">
              <div className="h-4 bg-white/20 rounded mb-3"></div>
              <div className="h-8 bg-white/10 rounded"></div>
            </GlassCard>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white">Block Note History</h1>
        </div>
        <p className="text-white/70">
          View all your messages embedded in the Bitcoin blockchain
        </p>
      </motion.div>

      {/* Search and Filter */}
      <GlassCard className="p-6 mb-8">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/50" />
            <input
              type="text"
              placeholder="Search your notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-orange-900/10 border border-orange-400/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:bg-orange-900/20 focus:border-orange-500/50"
            />
          </div>
          
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/50" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full appearance-none pl-10 pr-8 py-3 bg-orange-900/10 border border-orange-400/20 rounded-xl text-white focus:outline-none focus:bg-orange-900/20 focus:border-orange-500/50"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      </GlassCard>

      {/* Notes List */}
      <AnimatePresence>
        {filteredNotes.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <GlassCard className="p-12 text-center">
              <FileText className="w-16 h-16 text-white/30 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No Notes Found</h3>
              <p className="text-white/70">
                {searchTerm || statusFilter !== "all" 
                  ? "Try adjusting your search or filter criteria"
                  : "Start by creating your first blockchain note"
                }
              </p>
            </GlassCard>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {filteredNotes.map((note, index) => (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.1 }}
              >
                <GlassCard className="p-6 hover:bg-white/15">
                  <div className="flex flex-col lg:flex-row gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <Calendar className="w-4 h-4 text-white/50" />
                        <span className="text-sm text-white/70">
                          {format(new Date(note.created_date), "PPP 'at' p")}
                        </span>
                      </div>
                      
                      <div className="bg-white/5 rounded-xl p-4 mb-4">
                        <p className="text-white text-lg leading-relaxed">
                          "{note.text_content}"
                        </p>
                      </div>
                      
                      {note.transaction_id && (
                        <div className="flex items-center gap-2 text-sm text-white/70">
                          <ExternalLink className="w-4 h-4" />
                          <span className="font-mono">
                            {note.transaction_id.slice(0, 8)}...{note.transaction_id.slice(-8)}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="lg:w-80">
                      <BlockchainStatus
                        status={note.confirmation_status}
                        transactionId={note.transaction_id}
                        blockHeight={note.block_height}
                        fee={note.fee_amount}
                      />
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
