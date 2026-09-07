import React, { useEffect, useMemo, useRef } from "react";
import QRCodeStyling from "qr-code-styling";

const SIZE = 640;
const QRCodeStylingCtor = QRCodeStyling.default || QRCodeStyling;

export default function BitcoinQr({ value }) {
  const hostRef = useRef(null);
  const payload = useMemo(() => {
    if (!value) return "";
    return value.startsWith("bitcoin:") ? value : `bitcoin:${value}`;
  }, [value]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !payload) return undefined;

    host.innerHTML = "";
    const qr = new QRCodeStylingCtor({
      width: SIZE,
      height: SIZE,
      type: "svg",
      data: payload,
      margin: 12,
      qrOptions: { errorCorrectionLevel: "H" },
      dotsOptions: {
        color: "#000000",
        type: "square",
        roundSize: false,
      },
      backgroundOptions: {
        color: "transparent",
      },
    });
    qr.append(host);

    return () => {
      host.innerHTML = "";
    };
  }, [payload]);

  if (!payload) return null;

  return (
    <div title={payload}>
      <div
        ref={hostRef}
        className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        aria-label="Bitcoin payment QR code"
      />
    </div>
  );
}
