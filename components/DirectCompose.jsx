import React, { useState, useContext } from 'react';
import { Mail } from 'lucide-react';
import TextInput from './TextInput';
import EmbedButton from './EmbedButton';
import { SharedContext } from '../src/SharedContext';
import {
  getHighestFundedUnit,
  sendDirectMessageTransaction,
  validateUTXO,
} from '../services/BitcoinService';
import { isValidAddress } from '../services/BitcoinUtils';
import { useLanguage } from '../src/i18n/LanguageContext';

const FEE = 450;
const RECIPIENT_AMOUNT = 546;

export default function DirectCompose() {
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const { refs, setCurrentIndex, ensureUtxoHex } = useContext(SharedContext);
  const { t } = useLanguage();

  const [isLoading, setIsLoading] = useState(false);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [transactionID, setTransactionID] = useState(false);
  const [error, setError] = useState(null);

  const totalAmount = FEE + RECIPIENT_AMOUNT;
  const fundedUnit = getHighestFundedUnit(refs, totalAmount);
  const hasFundedUnit = Boolean(fundedUnit);
  const trimmedRecipient = recipient.trim();
  const addressLooksValid = trimmedRecipient.length > 0 && isValidAddress(trimmedRecipient);
  const canSend = hasFundedUnit && addressLooksValid && Boolean(message.trim());

  const handleSubmit = async () => {
    if (!trimmedRecipient) {
      setError(t('direct.enterAddress'));
      return;
    }
    if (!isValidAddress(trimmedRecipient)) {
      setError(t('direct.invalidAddress'));
      return;
    }
    if (!message.trim()) {
      setError(t('compose.enterMessage'));
      return;
    }

    const selectedUnit = getHighestFundedUnit(refs, totalAmount);
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
        throw new Error('Invalid UTXO data');
      }

      const result = await sendDirectMessageTransaction(
        currentUTXO,
        message,
        trimmedRecipient,
        FEE,
        RECIPIENT_AMOUNT
      );

      if (result.success) {
        setIsEmbedded(true);
        setMessage('');
        setTransactionID(result.transactionId);
      } else {
        setError(result.error);
        if (result.rawTxHex) {
          console.log('Raw transaction hex:', result.rawTxHex);
        }
      }
    } catch (err) {
      console.error('Direct message error:', err);
      setError(err.message || t('compose.unexpected'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Mail className="w-6 h-6 text-[color:var(--theme-accent)]" />
        <h2 className="text-2xl font-bold text-white">{t('direct.title')}</h2>
      </div>

      <p className="text-white/60 text-sm mb-6 leading-relaxed">{t('direct.lead')}</p>

      <label className="block mb-6">
        <span className="block text-sm text-white/50 mb-2">{t('direct.recipientLabel')}</span>
        <input
          type="text"
          value={recipient}
          onChange={(e) => {
            setRecipient(e.target.value);
            setIsEmbedded(false);
          }}
          placeholder={t('direct.recipientPlaceholder')}
          spellCheck={false}
          autoComplete="off"
          className="theme-glass w-full px-4 py-3 rounded-2xl border border-[color:var(--theme-inset-border)] bg-[color:var(--theme-inset-bg)] text-white text-base font-mono focus:outline-none focus:bg-[color:var(--theme-chip-bg)] focus:border-[color:var(--theme-card-border)] focus:shadow-[0_0_0_3px_rgba(247,147,26,0.12)] transition-all duration-300"
        />
      </label>

      <div className="gap-3 mb-6">
        <TextInput
          value={message}
          onChange={setMessage}
          maxLength={80}
          fee={FEE}
          placeholderOptions={t('direct.placeholders')}
        />
      </div>

      <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3 mb-4 text-sm">
        <div className="flex items-baseline justify-between gap-3 text-white/50">
          <span>{t('direct.recipientAmount')}</span>
          <span className="tabular-nums text-white/80">{t('direct.sats', { amount: RECIPIENT_AMOUNT })}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-white/50 mt-1">
          <span>{t('direct.networkFee')}</span>
          <span className="tabular-nums text-white/80">{t('direct.sats', { amount: FEE })}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 mt-2 pt-2 border-t border-white/10 text-white">
          <span className="font-medium">{t('direct.total')}</span>
          <span className="tabular-nums font-semibold">{t('direct.sats', { amount: totalAmount })}</span>
        </div>
      </div>

      {error && (
        <div className="p-4 mb-4 text-md text-red-800 rounded-lg bg-red-50 dark:bg-red-900/20 dark:text-red-300" role="alert">
          <span className="font-bold">{t('compose.error')}</span> {error}
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <EmbedButton
          onClick={handleSubmit}
          disabled={!canSend}
          isLoading={isLoading}
          text={t('direct.send')}
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
                href={`https://mempool.space/tx/${transactionID}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white-600 hover:text-white-800/20"
              >
                {t('direct.success').split('\n').map((line, index) => (
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
