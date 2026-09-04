
import React from "react";

export default function Badge({ 
  text = "", 
  color= "",
  status=""
}) {
  return (
    <span 
    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 hover:bg-primary/80 mb-2 bg-${color}-500/20 text-${color}-400 border-${color}-500/20`}>{ text }</span>
  );
}


