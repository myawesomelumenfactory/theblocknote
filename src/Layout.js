
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Bitcoin, FileText, History } from "lucide-react";

export default function Layout({ children, currentPageName }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-orange-900/50 to-black relative overflow-hidden">
      {/* Ambient background effects */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(247,147,26,0.15),transparent_50%)]"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(247,147,26,0.1),transparent_50%)]"></div>
      
      {/* Floating orbs */}
      <div className="absolute top-20 left-20 w-48 h-48 bg-orange-500/20 rounded-full blur-2xl animate-pulse"></div>
      <div className="absolute bottom-20 right-20 w-32 h-32 bg-orange-400/10 rounded-full blur-xl animate-pulse delay-1000"></div>
      
      {/* Glass navigation */}
      <nav className="relative z-10 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="backdrop-blur-xl bg-orange-900/10 rounded-2xl border border-orange-400/20 p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
                    <Bitcoin className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-white">BitcoinNote</h1>
                    <p className="text-sm text-white/70">Blockchain Text Embedding</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Link 
                  to={createPageUrl("Main")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 ${
                    location.pathname === createPageUrl("Main") 
                      ? 'bg-orange-400/20 text-white border border-orange-400/30' 
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span className="font-medium">Compose</span>
                </Link>
                <Link 
                  to={createPageUrl("History")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 ${
                    location.pathname === createPageUrl("History") 
                      ? 'bg-orange-400/20 text-white border border-orange-400/30' 
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span className="font-medium">History</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="relative z-10 px-6 pb-12">
        {children}
      </main>
      
      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        
        .glass-card {
          backdrop-filter: blur(20px);
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }
        
        .glass-input {
          backdrop-filter: blur(20px);
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.2);
          transition: all 0.3s ease;
        }
        
        .glass-input:focus {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 165, 0, 0.5);
          box-shadow: 0 0 0 3px rgba(255, 165, 0, 0.1);
        }
        
        .bitcoin-gradient {
          background: linear-gradient(135deg, #f7931a 0%, #ff8c00 100%);
        }
        
        .pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite alternate;
        }
        
        @keyframes pulse-glow {
          from {
            box-shadow: 0 0 20px rgba(255, 165, 0, 0.3);
          }
          to {
            box-shadow: 0 0 30px rgba(255, 165, 0, 0.6);
          }
        }
      `}</style>
    </div>
  );
}
