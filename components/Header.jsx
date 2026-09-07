import React, { useState } from "react";
import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import ChainTip from "./ChainTip";
import BitcoinLogo from "./BitcoinLogo";
import LanguageSwitcher from "./LanguageSwitcher";
import { windowMotion } from "../services/introMotion";
import { useLanguage } from "../src/i18n/LanguageContext";

const navClass = ({ isActive }) =>
  `flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 border ${
    isActive
      ? 'bg-[#3a5ca7]/70 text-white border-[#8eb0e8]/50 shadow-[0_0_12px_rgba(58,92,167,0.45)]'
      : 'bg-white-400/20 text-white/70 border-white/10 hover:text-white hover:bg-white/10'
  }`;

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t } = useLanguage();

  return (
    <motion.div
      {...windowMotion({
        delay: 1,
        duration: 1.2,
        ease: [0.4, 0, 0.2, 1],
      })}
      className="w-full px-4 sm:px-6 lg:px-8 pt-4"
    >
      <nav className="relative z-10">
        <div className="w-full">
          <div className="backdrop-blur-xl bg-white-900/30 rounded-2xl border border-white/20 p-4 shadow-2xl">
            {/* Parent flex container, responsive */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Left: Logo + Tagline */}
              <div className="flex items-center gap-4">
                <BitcoinLogo className="w-10 h-10 drop-shadow-lg" />
                <div>
                  <h1 className="text-xl font-bold text-white">{t('app.tagline')}</h1>
                  <p className="text-sm text-white/50">{t('app.subtitle')}</p>
                </div>
              </div>

              {/* Mobile toggle */}
              <div className="md:hidden flex justify-end">
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="text-white"
                  aria-label={mobileMenuOpen ? t('nav.closeMenu') : t('nav.menu')}
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
                <NavLink
                  to="/"
                  end
                  onClick={() => setMobileMenuOpen(false)}
                  className={navClass}
                >
                  <span className="font-medium">{t('nav.declare')}</span>
                </NavLink>
                <NavLink
                  to="/power"
                  onClick={() => setMobileMenuOpen(false)}
                  className={navClass}
                >
                  <span className="font-medium">{t('nav.spark')}</span>
                </NavLink>
                <NavLink
                  to="/status"
                  onClick={() => setMobileMenuOpen(false)}
                  className={navClass}
                >
                  <span className="font-medium">{t('nav.status')}</span>
                </NavLink>
                <Link
                  to="https://bitcoin.org/bitcoin.pdf"
                  target="_blank"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 bg-white-400/20 text-white/70 border border-white/10 hover:text-white hover:bg-white/10"
                >
                  <span className="font-medium">{t('nav.about')}</span>
                </Link>
                <LanguageSwitcher onSelect={() => setMobileMenuOpen(false)} />
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
