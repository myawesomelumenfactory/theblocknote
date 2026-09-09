import React from "react";
import bitcoinLogo from "../src/assets/bitcoin.svg";

const STROKE = 3
const VIEW = 106
const CENTER = VIEW / 2
const RING_R = 50
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
    <span className={`relative inline-flex shrink-0 overflow-visible ${className}`}>
      <img
        src={bitcoinLogo}
        alt={alt}
        title={title}
        className="relative z-0 block h-full w-full select-none"
        draggable="false"
      />
      {progress != null ? (
        <svg
          className="pointer-events-none absolute -inset-[3px] z-10 h-[calc(100%+6px)] w-[calc(100%+6px)]"
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          aria-hidden="true"
        >
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RING_R}
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={STROKE}
            vectorEffect="nonScalingStroke"
          />
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RING_R}
            fill="none"
            stroke="#ffffff"
            strokeWidth={STROKE}
            strokeLinecap="butt"
            strokeDasharray={progress >= 100 ? undefined : `${dash} ${RING_C}`}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
            vectorEffect="nonScalingStroke"
          />
        </svg>
      ) : null}
    </span>
  );
}
