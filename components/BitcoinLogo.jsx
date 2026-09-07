import React from "react";
import bitcoinLogo from "../src/assets/bitcoin.svg";

export default function BitcoinLogo({ className = "w-10 h-10", alt = "Bitcoin" }) {
  return (
    <img
      src={bitcoinLogo}
      alt={alt}
      className={className}
      draggable="false"
    />
  );
}
