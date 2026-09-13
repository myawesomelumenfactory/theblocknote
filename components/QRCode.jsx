import React, { useEffect, useMemo, useRef } from "react";
import QRCodeStyling from "qr-code-styling";
import { useLanguage } from "../src/i18n/LanguageContext";

const SIZE = 640;
const QRCodeStylingCtor = QRCodeStyling.default || QRCodeStyling;

export default function BitcoinQr({ value }) {
  const { t } = useLanguage();
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
      margin: 0,
      qrOptions: { errorCorrectionLevel: "H" },
      dotsOptions: {
        color: "#000000",
        type: "square",
        roundSize: false,
      },
      backgroundOptions: {
        color: "transparent",
      },
      cornersSquareOptions: {
        color: "#000000",
        type: "square",
      },
      cornersDotOptions: {
        color: "#000000",
        type: "square",
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
        className="border-0 outline-none [&>svg]:block [&>svg]:h-auto [&>svg]:w-full [&>svg]:border-0 [&>svg]:outline-none"
        aria-label={t('spark.qrLabel')}
      />
    </div>
  );
}
