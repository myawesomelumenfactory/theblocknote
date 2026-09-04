import React from "react";
import { QRCode } from "qrcode.react";

const QRCodeWithLogo = () => {
  const bitcoinAddress = "bitcoin:1BoatSLRHtKNngkdXEeobR76b53LETtpyT";

  return (
    <div style={{ position: "relative", width: 256, height: 256 }}>
      <QRCode
        value={bitcoinAddress}
        size={256}
        bgColor="#ffffff"
        fgColor="#000000"
        level="H" // High error correction level to allow for embedded image
        includeMargin={true}
      />
      <img
        src="/bitcoin-logo.png"
        alt="Bitcoin Logo"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 64,
          height: 64,
          transform: "translate(-50%, -50%)",
          borderRadius: "120%",
          backgroundColor: "white", // Optional: improves readability
          padding: 4
        }}
      />
    </div>
  );
};

export default QRCodeWithLogo;
