import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bitcoin, Menu, X } from "lucide-react";
import { Link } from "react-router-dom";
import ChainTip from "./ChainTip";

export default function Header() {
  const [shouldAnimate, setShouldAnimate] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const animate = localStorage.getItem("animate");
    setShouldAnimate(animate);
    localStorage.setItem("animate", false);
  }, []);

  return (
    <motion.div
      initial={shouldAnimate ? { opacity: 0, y: 20, scale: 0.95 } : false}
      animate={shouldAnimate ? { opacity: 1, y: 0, scale: 1 } : false}
      transition={{
        delay: 1,
        duration: 1.2,
        ease: [0.4, 0, 0.2, 1],
      }}
      className="w-full px-4 sm:px-6 lg:px-8 pt-4"
    >
      <nav className="relative z-10">
        <div className="w-full">
          <div className="backdrop-blur-xl bg-white-900/30 rounded-2xl border border-white/20 p-4 shadow-2xl">
            {/* Parent flex container, responsive */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Left: Logo + Tagline */}
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 flex items-center justify-center">
                  <Bitcoin className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">The Block Note</h1>
                  <p className="text-sm text-white/50">Make Your Voice Heard. Forever.</p>
                </div>
              </div>

              {/* Mobile toggle */}
              <div className="md:hidden flex justify-end">
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="text-white"
                >
                  {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
              </div>

              {/* Navigation Links (desktop & mobile) */}
              <div
                className={`${
                  mobileMenuOpen ? "flex" : "hidden"
                } flex-col md:flex md:flex-row items-start md:items-center gap-2 md:gap-3`}
              >
                <Link
                  to="/"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 bg-white-400/20 text-white border border-white/10"
                >
                  <span className="font-medium">Declare</span>
                </Link>
                <Link
                  to="/power"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 bg-white-400/20 text-white border border-white/10"
                >
                  <span className="font-medium">Spark</span>
                </Link>
                <Link
                  to="/status"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 bg-white-400/20 text-white border border-white/10"
                >
                  <span className="font-medium">Status</span>
                </Link>
                <Link
                  to="https://bitcoin.org/bitcoin.pdf"
                  target="_blank"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 bg-white-400/20 text-white border border-white/10"
                >
                  <span className="font-medium">About</span>
                </Link>
                <div className="px-3 py-1 md:py-0">
                  <ChainTip />
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </motion.div>
  );
}
