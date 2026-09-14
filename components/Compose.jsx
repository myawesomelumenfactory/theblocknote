// Compose.jsx
import React, { useState, useContext, useEffect } from 'react';
import { Activity } from "lucide-react";
import TextInput from '../components/TextInput';
import EmbedButton from '../components/EmbedButton';
import { SharedContext } from '../src/SharedContext';
import { getHighestFundedUnit, sendBitcoinTransaction, validateUTXO } from '../services/BitcoinService';
import { appendImmutable } from '../services/ImmutablesStore';
import { encode } from '../services/TheBlockNote';
import { getRecommendedFeeTiers } from '../services/BitcoinUtils';
import { useLanguage } from '../src/i18n/LanguageContext';

const FEE_TIER_ORDER = ['default', 'economy', 'standard', 'fast'];
const DEFAULT_FEE = 450;
const DEFAULT_TIER = {
  id: 'default',
  fee: DEFAULT_FEE,
  rate: Math.round(DEFAULT_FEE / 281),
};
const FALLBACK_TIERS = {
  default: DEFAULT_TIER,
  economy: { id: 'economy', fee: 250, rate: 1 },
  standard: { id: 'standard', fee: 450, rate: 2 },
  fast: { id: 'fast', fee: 900, rate: 4 },
};

export default function Compose() {
  const [message, setMessage] = useState("");
  const [feeTier, setFeeTier] = useState('default');
  const [tiers, setTiers] = useState(FALLBACK_TIERS);
  const [feesLoading, setFeesLoading] = useState(true);
  const { refs, setCurrentIndex, ensureUtxoHex, refreshRefs } = useContext(SharedContext);
  const { t } = useLanguage();

  const [isLoading, setIsLoading] = useState(false);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [transactionID, setTransactionID] = useState(false);
  const [error, setError] = useState(null);

  const fee = tiers[feeTier]?.fee ?? DEFAULT_FEE;
  const fundedUnit = getHighestFundedUnit(refs, fee);
  const hasFundedUnit = Boolean(fundedUnit);

  useEffect(() => {
    let cancelled = false;

    const loadFees = async () => {
      setFeesLoading(true);
      try {
        const next = await getRecommendedFeeTiers();
        if (!cancelled) {
          setTiers({
            default: DEFAULT_TIER,
            ...next,
          });
        }
      } catch {
        if (!cancelled) setTiers(FALLBACK_TIERS);
      } finally {
        if (!cancelled) setFeesLoading(false);
      }
    };

    loadFees();
    const poll = window.setInterval(loadFees, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, []);

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

      const outgoingMessage = message.trim();
      const result = await sendBitcoinTransaction(currentUTXO, outgoingMessage, fee);

      if (result.success) {
        await appendImmutable({
          index: `${result.transactionId}_0`,
          time: Math.floor(Date.now() / 1000),
          value: encode('t', 0, 0, outgoingMessage),
          unconfirmed: true,
        });

        setIsEmbedded(true);
        setMessage("");
        setTransactionID(result.transactionId);
        console.log(`Transaction successful! View at: ${result.explorerUrl}`);

        if (refreshRefs) {
          await refreshRefs({ watch: true, address: selectedUnit.public_key });
        }
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
        <Activity className="w-6 h-6 text-[color:var(--theme-accent)]" />
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

      <div className="mb-6">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <span className="text-sm text-white/50">{t('compose.feeLabel')}</span>
          <span className="text-xs text-white/40 tabular-nums">
            {feesLoading
              ? t('compose.feeLoading')
              : t('compose.feeSelected', {
                  fee,
                  rate: tiers[feeTier]?.rate ?? '—',
                })}
          </span>
        </div>
        <div
          role="group"
          aria-label={t('compose.feeLabel')}
          className="flex w-full items-stretch rounded-2xl border border-[color:var(--theme-inset-border)] bg-[color:var(--theme-inset-bg)] p-1 gap-1"
        >
          {FEE_TIER_ORDER.map((id) => {
            const tier = tiers[id];
            const active = feeTier === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                title={t(`compose.fee${id[0].toUpperCase()}${id.slice(1)}Hint`)}
                onClick={() => setFeeTier(id)}
                className={`compose-fee-btn flex-1 min-w-0 rounded-xl px-2 py-2.5 text-center transition-colors ${
                  active
                    ? 'bg-[color:var(--theme-accent-strong)] text-white shadow-[var(--theme-nav-active-shadow)]'
                    : 'text-white/55 hover:text-white/80'
                }`}
              >
                <span className="block text-sm font-semibold leading-tight">
                  {t(`compose.fee${id[0].toUpperCase()}${id.slice(1)}`)}
                </span>
                <span className="block text-[11px] tabular-nums mt-0.5 opacity-80">
                  {t('compose.feeTierMeta', { fee: tier.fee, rate: tier.rate })}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-white/40 text-xs mt-2 leading-relaxed">
          {t('compose.feeMaxHint')}
        </p>
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
