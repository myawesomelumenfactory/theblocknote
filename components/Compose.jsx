// Compose.jsx
import React, { useState, useContext } from 'react';
import { Activity } from "lucide-react";
import TextInput from '../components/TextInput';
import EmbedButton from '../components/EmbedButton';
import { SharedContext } from '../src/SharedContext';
import { getHighestFundedUnit, sendBitcoinTransaction, validateUTXO } from '../services/BitcoinService';
import { useLanguage } from '../src/i18n/LanguageContext';

export default function Compose() {
  const [message, setMessage] = useState("");
  const fee = 450;
  const { refs, setCurrentIndex, ensureUtxoHex } = useContext(SharedContext);
  const { t } = useLanguage();

  const [isLoading, setIsLoading] = useState(false);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [transactionID, setTransactionID] = useState(false);
  const [error, setError] = useState(null);

  const fundedUnit = getHighestFundedUnit(refs, fee);
  const hasFundedUnit = Boolean(fundedUnit);

  const handleSubmit = async () => {
    if (!message.trim()) {
      setError(t('compose.enterMessage'));
      return;
    }

    const selectedUnit = getHighestFundedUnit(refs, fee);
    if (!selectedUnit) {
      setError(t('compose.noFundedUnit'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (setCurrentIndex) setCurrentIndex(selectedUnit.index);
      const currentUTXO = ensureUtxoHex
        ? await ensureUtxoHex(selectedUnit.index)
        : selectedUnit;

      if (!validateUTXO(currentUTXO)) {
        throw new Error("Invalid UTXO data");
      }

      // Send the transaction
      const result = await sendBitcoinTransaction(currentUTXO, message, fee);

      if (result.success) {
        setIsEmbedded(true);
        setMessage("");
        setTransactionID(result.transactionId);
        console.log(`Transaction successful! View at: ${result.explorerUrl}`);
      } else {
        setError(result.error);
        if (result.rawTxHex) {
          console.log('You can manually broadcast this transaction:');
          console.log('Raw transaction hex:', result.rawTxHex);
          console.log('Manual broadcast links:');
          console.log('- https://mempool.space/tx/push');
          console.log('- https://blockstream.info/tx/push');
        }
      }
    } catch (err) {
      console.error('Transaction error:', err);
      setError(err.message || t('compose.unexpected'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Activity className="w-6 h-6 text-blue-400" />
        <h2 className="text-2xl font-bold text-white">{t('compose.title')}</h2>
      </div>

      <div className="gap-3 mb-6">
        <TextInput 
          value={message}
          onChange={setMessage}
          maxLength={80}
          fee={fee}
        />
      </div>

      {error && (
        <div className="p-4 mb-4 text-md text-red-800 rounded-lg bg-red-50 dark:bg-red-900/20 dark:text-red-300" role="alert">
          <span className="font-bold">{t('compose.error')}</span> {error}
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <EmbedButton
          onClick={handleSubmit}
          disabled={!hasFundedUnit || !message.trim()}
          isLoading={isLoading}
          text={t('compose.send')}
        />
      </div>
      {!hasFundedUnit && (
        <p className="text-white/50 text-sm mb-6">
          {t('compose.noUnit')}
        </p>
      )}

      {isEmbedded && (
        <div className="p-4 mb-4 text-md text-white-800 rounded-lg bg-green-80 dark:bg-gray-100/5 dark:text-white-300/80" role="alert">
          <span className="text-md font-bold text-white">
            <center>
              <a
                href={`https://bitaps.com/${transactionID}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white-600 hover:text-white-800/20"
              >
                {t('compose.success').split('\n').map((line, index) => (
                  <span key={line}>
                    {index > 0 ? <br /> : null}
                    {line}
                  </span>
                ))}
              </a>
            </center>
          </span>
        </div>
      )}
    </div>
  );
}