import React from "react";
import bitcoinLogo from "../src/assets/bitcoin.svg";

const RING_R = 31
const RING_C = 2 * Math.PI * RING_R

function ringProgress(percent) {
  if (!Number.isFinite(percent)) return null;
  return Math.min(100, Math.max(0, percent));
}

export default function BitcoinLogo({
  className = "w-10 h-10",
  alt = "Bitcoin",
  percent = null,
  title,
}) {
  const progress = ringProgress(percent);
  const dash = progress == null ? 0 : (RING_C * progress) / 100;

  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <img
        src={bitcoinLogo}
        alt={alt}
        title={title}
        className="h-full w-full select-none rounded-full"
        draggable="false"
      />
      {progress != null ? (
        <svg
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          viewBox="0 0 64 64"
          aria-hidden="true"
        >
          <circle
            cx="32"
            cy="32"
            r={RING_R}
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="3"
            vectorEffect="nonScalingStroke"
          />
          <circle
            cx="32"
            cy="32"
            r={RING_R}
            fill="none"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinecap="butt"
            strokeDasharray={`${dash} ${RING_C}`}
            transform="rotate(-90 32 32)"
            vectorEffect="nonScalingStroke"
          />
        </svg>
      ) : null}
    </span>
  );
}
