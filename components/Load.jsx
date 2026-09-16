
import { motion } from "framer-motion";
import GlassCard from "../components/GlassCard";
import {
    Zap,
    KeyRound,
    Coins,
    Download,
    Copy,
    Check,
    Eye,
    EyeOff,
    ChevronLeft,
    ChevronRight,
    Trash2,
    Combine,
    Undo2,
    Loader2,
    Plus,
} from "lucide-react";

import React, { useEffect, useState, useContext } from 'react';
import BitcoinQr from "./QRCode";
import { SharedContext } from '../src/SharedContext';
import UTXOCard from "./UTXOCard";
import { AnimatePresence } from 'framer-motion';
import {
    createParticipationKey,
    parseParticipationKeys,
    readStoredKeyPairs,
    serializeParticipationKeys,
    writeStoredKeyPairs,
    clearStoredKeyPairs,
} from '../services/ParticipationKeys';
import { consolidateFundedUnits, getFundedUnits, refundFundedUnits, resolveFundingOriginAddress } from '../services/BitcoinService';
import { estimateConsolidationFee } from '../services/BitcoinUtils';
import { windowMotion } from '../services/introMotion';
import { useLanguage } from '../src/i18n/LanguageContext';

async function copyText(value) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }
    const field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.position = 'absolute';
    field.style.left = '-9999px';
    document.body.appendChild(field);
    field.select();
    document.execCommand('copy');
    document.body.removeChild(field);
}

const PAGE_SIZE = 3;

function formatSats(sats, locale = 'en-US') {
    return new Intl.NumberFormat(locale).format(sats || 0);
}

function formatBtc(sats) {
    return ((sats || 0) / 100000000).toFixed(8);
}

export default function Load() {

    const [address, setAddress] = useState('');
    const [savedKeys, setSavedKeys] = useState({});
    const [importText, setImportText] = useState('');
    const [copied, setCopied] = useState('');
    const [revealed, setRevealed] = useState({});
    const [importError, setImportError] = useState(null);
    const [page, setPage] = useState(0);
    const [confirmingClear, setConfirmingClear] = useState(false);
    const [confirmingConsolidate, setConfirmingConsolidate] = useState(false);
    const [consolidating, setConsolidating] = useState(false);
    const [consolidateFee, setConsolidateFee] = useState(null);
    const [consolidateError, setConsolidateError] = useState(null);
    const [consolidateTxId, setConsolidateTxId] = useState('');
    const [confirmingRefund, setConfirmingRefund] = useState(false);
    const [refunding, setRefunding] = useState(false);
    const [refundPlan, setRefundPlan] = useState([]);
    const [refundError, setRefundError] = useState(null);
    const [refundTxIds, setRefundTxIds] = useState([]);
    const { refs, setCurrentIndex, addressFunds, fundsProgress, refreshRefs, ensureUtxoHex } = useContext(SharedContext);
    const { t, locale } = useLanguage();

    const applyKeys = (keyPairs, preferredAddress) => {
        writeStoredKeyPairs(keyPairs);
        setSavedKeys(keyPairs);
        const addresses = Object.keys(keyPairs);
        setAddress(preferredAddress && keyPairs[preferredAddress] ? preferredAddress : addresses[addresses.length - 1] || '');
    };

    useEffect(() => {
        const existing = readStoredKeyPairs();
        const addresses = Object.keys(existing);
        if (addresses.length === 0) {
            const created = createParticipationKey();
            applyKeys({ [created.address]: created.privateKey }, created.address);
            return;
        }
        applyKeys(existing, addresses[addresses.length - 1]);
    }, []);

    useEffect(() => {
        const units = Array.isArray(refs) ? refs : [];
        const fundedCount = Object.keys(savedKeys).filter((addr) => {
            const funds = addressFunds?.[addr];
            if (funds && ((funds.received || 0) > 0 || (funds.available || 0) > 0)) return true;
            return units.some((unit) => unit.public_key === addr && (unit.value || 0) > 0);
        }).length;
        const lastPage = Math.max(0, Math.ceil(fundedCount / PAGE_SIZE) - 1);
        setPage((current) => Math.min(current, lastPage));
    }, [savedKeys, addressFunds, refs]);

    useEffect(() => {
        if (!refreshRefs) return undefined;
        refreshRefs();
        const poll = window.setInterval(() => {
            refreshRefs({ watch: true, address });
        }, 15000);
        return () => window.clearInterval(poll);
    }, [refreshRefs, address]);

    useEffect(() => {
        if (!address || !refreshRefs) return undefined;

        let stopped = false;
        let socket;
        let retry;

        const connect = () => {
            socket = new WebSocket('wss://mempool.space/api/v1/ws');
            socket.onopen = () => {
                socket.send(JSON.stringify({ 'track-address': address }));
            };
            socket.onmessage = (event) => {
                if (!event.data || event.data === 'pong') return;
                try {
                    const data = JSON.parse(event.data);
                    const hasIncoming =
                        data['address-transactions'] ||
                        data['multi-address-transactions'] ||
                        (data.txid && (data.vin || data.vout));
                    if (hasIncoming) {
                        refreshRefs({ watch: true, address });
                    }
                } catch {
                    // Ignore non-JSON keepalive frames.
                }
            };
            socket.onclose = () => {
                if (!stopped) {
                    retry = window.setTimeout(connect, 5000);
                }
            };
        };

        connect();
        return () => {
            stopped = true;
            window.clearTimeout(retry);
            if (socket && socket.readyState < 2) {
                socket.close();
            }
        };
    }, [address, refreshRefs]);

    const handleToggleSelection = (index) => {
        setCurrentIndex(index);
        if (ensureUtxoHex) ensureUtxoHex(index);
    };

    const markCopied = (id) => {
        setCopied(id);
        window.setTimeout(() => {
            setCopied((current) => (current === id ? '' : current));
        }, 2000);
    };

    const handleCopyKeys = async (keyPairs, id) => {
        await copyText(serializeParticipationKeys(keyPairs));
        markCopied(id);
    };

    const handleCopyAddress = async () => {
        if (!address) return;
        await copyText(address);
        markCopied('address');
    };

    const handleGenerateAddress = () => {
        const created = createParticipationKey();
        applyKeys(
            { ...savedKeys, [created.address]: created.privateKey },
            created.address
        );
        setRevealed((current) => ({ ...current, [created.address]: false }));
        if (refreshRefs) refreshRefs({ watch: true, address: created.address });
    };

    const handleClearAllKeys = () => {
        clearStoredKeyPairs();
        window.location.reload();
    };

    const shortAddress = (value) => {
        if (!value) return '';
        if (value.length <= 16) return value;
        return `${value.slice(0, 6)}…${value.slice(-6)}`;
    };

    const handleStartConsolidate = async () => {
        setConsolidateError(null);
        setConsolidateTxId('');
        const units = getFundedUnits(participationUnits);
        if (!address) {
            setConsolidateError(t('spark.consolidateNoAddress'));
            return;
        }
        if (units.length < 2) {
            setConsolidateError(t('spark.consolidateNeedMore'));
            return;
        }
        try {
            const fee = await estimateConsolidationFee(units.length);
            setConsolidateFee(fee);
            setConfirmingConsolidate(true);
        } catch (error) {
            setConsolidateError(error.message || t('compose.unexpected'));
        }
    };

    const handleConsolidate = async () => {
        const units = getFundedUnits(participationUnits);
        if (!address) {
            setConsolidateError(t('spark.consolidateNoAddress'));
            return;
        }
        if (units.length < 2) {
            setConsolidateError(t('spark.consolidateNeedMore'));
            setConfirmingConsolidate(false);
            return;
        }

        setConsolidating(true);
        setConsolidateError(null);

        try {
            const prepared = [];
            for (const unit of units) {
                const full = unit.index != null && ensureUtxoHex
                    ? await ensureUtxoHex(unit.index)
                    : unit;
                prepared.push(full || unit);
            }

            const fee = consolidateFee == null
                ? await estimateConsolidationFee(prepared.length)
                : consolidateFee;
            const result = await consolidateFundedUnits(prepared, address, fee);

            if (result.success) {
                setConsolidateTxId(result.transactionId);
                setConfirmingConsolidate(false);
                if (refreshRefs) await refreshRefs();
            } else {
                setConsolidateError(result.error || t('compose.unexpected'));
            }
        } catch (error) {
            setConsolidateError(error.message || t('compose.unexpected'));
        } finally {
            setConsolidating(false);
        }
    };

    const handleStartRefund = async () => {
        setRefundError(null);
        setRefundTxIds([]);
        setConfirmingConsolidate(false);
        const units = getFundedUnits(participationUnits);
        if (units.length < 1) {
            setRefundError(t('spark.refundNeedUnits'));
            return;
        }
        try {
            const prepared = [];
            for (const unit of units) {
                const full = unit.index != null && ensureUtxoHex
                    ? await ensureUtxoHex(unit.index)
                    : unit;
                prepared.push(full || unit);
            }

            const groups = new Map();
            for (const unit of prepared) {
                const origin = await resolveFundingOriginAddress(unit);
                if (!groups.has(origin)) {
                    groups.set(origin, { origin, units: [], value: 0 });
                }
                const row = groups.get(origin);
                row.units.push(unit);
                row.value += Number(unit.value) || 0;
            }

            const plan = [];
            for (const row of groups.values()) {
                const fee = await estimateConsolidationFee(row.units.length);
                plan.push({
                    origin: row.origin,
                    unitCount: row.units.length,
                    value: row.value,
                    fee,
                });
            }
            setRefundPlan(plan);
            setConfirmingRefund(true);
        } catch (error) {
            setRefundError(error.message || t('compose.unexpected'));
        }
    };

    const handleRefund = async () => {
        const units = getFundedUnits(participationUnits);
        if (units.length < 1) {
            setRefundError(t('spark.refundNeedUnits'));
            setConfirmingRefund(false);
            return;
        }

        setRefunding(true);
        setRefundError(null);

        try {
            const prepared = [];
            for (const unit of units) {
                const full = unit.index != null && ensureUtxoHex
                    ? await ensureUtxoHex(unit.index)
                    : unit;
                prepared.push(full || unit);
            }

            const result = await refundFundedUnits(prepared);
            if (result.success) {
                setRefundTxIds(result.transactionIds || []);
                setConfirmingRefund(false);
                setRefundPlan([]);
                if (refreshRefs) await refreshRefs();
            } else {
                setRefundError(result.error || t('compose.unexpected'));
                if (result.results?.length) {
                    setRefundTxIds(
                        result.results.map((row) => row.transactionId).filter(Boolean)
                    );
                }
            }
        } catch (error) {
            setRefundError(error.message || t('compose.unexpected'));
        } finally {
            setRefunding(false);
        }
    };

    const handleImport = async () => {
        setImportError(null);
        try {
            const incoming = parseParticipationKeys(importText);
            const merged = { ...readStoredKeyPairs(), ...incoming };
            const importedAddress = Object.keys(incoming)[0];
            applyKeys(merged, importedAddress);
            window.location.reload();
        } catch (error) {
            setImportError(error.message || t('spark.importFailed'));
        }
    };

    const participationUnits = Array.isArray(refs) ? refs : [];
    const savedAddresses = Object.keys(savedKeys);
    const isFunded = (addr) => {
        const funds = addressFunds?.[addr];
        if (funds && ((funds.received || 0) > 0 || (funds.available || 0) > 0 || (funds.unconfirmed || 0) > 0 || funds.pending)) {
            return true;
        }
        return participationUnits.some((unit) => unit.public_key === addr && (unit.value || 0) > 0);
    };
    const fundedAddresses = savedAddresses.filter(isFunded);
    const isLoadingFunds = fundsProgress?.phase === 'keys' || fundsProgress?.phase === 'units';
    const stillChecking = isLoadingFunds || savedAddresses.some(
        (addr) => !(addressFunds && Object.prototype.hasOwnProperty.call(addressFunds, addr))
    );
    const progressPercent = fundsProgress?.total
        ? Math.min(100, Math.round((fundsProgress.checked / Math.max(fundsProgress.total, 1)) * 100))
        : 0;
    const progressLabel = fundsProgress?.phase === 'keys'
        ? t('spark.checkingKeys', { checked: fundsProgress.checked, total: fundsProgress.total })
        : fundsProgress?.phase === 'units'
        ? t('spark.loadingUnits', { checked: fundsProgress.checked, total: fundsProgress.total })
        : '';
    const fundedKeyPairs = Object.fromEntries(
        fundedAddresses.map((addr) => [addr, savedKeys[addr]])
    );
    const totalPages = Math.max(1, Math.ceil(fundedAddresses.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages - 1);
    const pagedAddresses = fundedAddresses.slice(
        currentPage * PAGE_SIZE,
        currentPage * PAGE_SIZE + PAGE_SIZE
    );
    const fundedUnits = getFundedUnits(participationUnits);
    const canConsolidate = Boolean(address) && fundedUnits.length >= 2 && !consolidating && !refunding;
    const canRefund = fundedUnits.length >= 1 && !refunding && !consolidating;

    return (
        
        <motion.div 
            {...windowMotion({
            delay: 0.2,
            duration: 0.8,
            ease: [0.4, 0, 0.2, 1]
            })}
            className="w-full px-4 sm:px-6 lg:px-8 pt-4 pb-16"
        >
        <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
                <Zap className="w-6 h-6 text-[color:var(--theme-accent)] shrink-0" />
                <h1 className="text-2xl font-bold text-white">{t('spark.loadTitle')}</h1>
            </div>
            <p className="text-white/60 text-sm">
                {t('spark.minAmount')} · {t('spark.fundLead')}
            </p>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            <div className="w-full lg:w-[40%] lg:sticky lg:top-4 lg:self-start lg:z-[5]">
                <GlassCard className="p-5 md:p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <Zap className="w-5 h-5 text-[color:var(--theme-accent)] shrink-0" />
                        <h2 className="text-xl font-bold text-white">{t('spark.fundTitle')}</h2>
                    </div>

                    {address && (
                        <div className="mx-auto mb-5 w-full max-w-[220px] sm:max-w-[260px]">
                            <BitcoinQr value={address} />
                        </div>
                    )}

                    {address && (
                        <div className="space-y-3">
                            <div>
                                <div className="text-white/45 text-xs mb-1">{t('spark.address')}</div>
                                <p className="text-white text-sm font-mono break-all leading-relaxed">{address}</p>
                            </div>
                            <button
                                type="button"
                                onClick={handleCopyAddress}
                                className="flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white border border-white/10 hover:bg-white/20 transition-all duration-300"
                            >
                                {copied === 'address' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                <span className="text-sm font-medium">
                                    {copied === 'address' ? t('spark.addressCopied') : t('spark.copyAddress')}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={handleGenerateAddress}
                                className="flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white border border-white/10 hover:bg-white/20 transition-all duration-300"
                            >
                                <Plus className="w-4 h-4" />
                                <span className="text-sm font-medium">{t('spark.newAddress')}</span>
                            </button>
                            <p className="text-center text-white/50 text-sm leading-snug">
                                {t('spark.watching')}
                            </p>
                        </div>
                    )}
                </GlassCard>
            </div>

            <div className="w-full lg:w-[60%] min-w-0 space-y-6">
                <GlassCard className="p-5 md:p-6">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <KeyRound className="w-5 h-5 text-[color:var(--theme-accent)] shrink-0" />
                            <h2 className="text-xl font-bold text-white">{t('spark.keysTitle')}</h2>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            {fundedAddresses.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => handleCopyKeys(fundedKeyPairs, 'all')}
                                    className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/10 text-white border border-white/10 hover:bg-white/20 transition-all duration-300"
                                >
                                    {copied === 'all' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    <span className="text-sm font-medium">
                                        {copied === 'all' ? t('spark.copiedAll') : t('spark.copyAll')}
                                    </span>
                                </button>
                            )}
                            {savedAddresses.length > 0 && !confirmingClear && (
                                <button
                                    type="button"
                                    onClick={() => setConfirmingClear(true)}
                                    className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-red-500/15 text-red-200 border border-red-400/30 hover:bg-red-500/25 transition-all duration-300"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    <span className="text-sm font-medium">{t('spark.clearAll')}</span>
                                </button>
                            )}
                            {confirmingClear && (
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                    <span className="text-sm text-orange-200">
                                        {t('spark.clearConfirm')}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setConfirmingClear(false)}
                                            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/10 text-white border border-white/10 hover:bg-white/20 transition-all duration-300"
                                        >
                                            <span className="text-sm font-medium">{t('spark.cancel')}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleClearAllKeys}
                                            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-red-500/80 text-white border border-red-300/40 hover:bg-red-500 transition-all duration-300"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            <span className="text-sm font-medium">{t('spark.clearKeys')}</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <p className="text-white/60 text-sm mb-5">
                        {t('spark.copyHint')}
                    </p>

                    {isLoadingFunds && fundsProgress.total > 0 && (
                        <div className="mb-5">
                            <div className="flex justify-between gap-3 text-sm text-white/70 mb-2">
                                <span>{progressLabel}</span>
                                <span>{t('spark.fundedCount', { count: fundsProgress.funded })}</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                                <div
                                    className="h-full bg-[color:var(--theme-accent-strong)]/80 transition-all duration-300"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {fundedAddresses.length > 0 && (
                        <div>
                            <div className="grid grid-cols-1 gap-4">
                                {pagedAddresses.map((savedAddress) => {
                                    const utxoSum = participationUnits
                                        .filter((unit) => unit.public_key === savedAddress)
                                        .reduce((sum, unit) => sum + (unit.value || 0), 0);
                                    const funds = addressFunds?.[savedAddress] || { received: utxoSum, available: utxoSum };
                                    return (
                                    <div key={savedAddress} className="rounded-2xl p-4 border border-[color:var(--theme-inset-border)] bg-[color:var(--theme-inset-bg)]">
                                        <div className="flex items-start justify-between gap-3 mb-3">
                                            <div className="min-w-0">
                                                <div className="text-white/45 text-xs mb-1">{t('spark.address')}</div>
                                                <div className="text-white text-sm font-mono break-all">{savedAddress}</div>
                                            </div>
                                            {funds.pending && (
                                                <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold bg-[color:var(--theme-accent)]/15 text-[color:var(--theme-accent)] border border-[color:var(--theme-accent)]/30">
                                                    {t('spark.unconfirmed')}
                                                </span>
                                            )}
                                        </div>
                                        <div className="mb-3">
                                            <div className="text-white/45 text-xs mb-1">{t('spark.amountSent')}</div>
                                            <div className="text-2xl font-bold text-white">
                                                {formatSats(funds.received, locale)} SATS
                                            </div>
                                            <div className="text-white/50 text-sm">
                                                ≈ {formatBtc(funds.received)} BTC
                                                {funds.unconfirmed > 0 ? ` · ${t('spark.satsUnconfirmed', { amount: formatSats(funds.unconfirmed, locale) })}` : ''}
                                                {funds.available !== funds.received ? ` · ${t('spark.satsAvailable', { amount: formatSats(funds.available, locale) })}` : ''}
                                            </div>
                                        </div>
                                        <div className="text-white/45 text-xs mb-1">{t('spark.privateKey')}</div>
                                        <div className="text-white/80 text-sm font-mono break-all mb-3">
                                            {revealed[savedAddress] ? savedKeys[savedAddress] : '••••••••••••••••••••••••••••••••'}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setRevealed((current) => ({ ...current, [savedAddress]: !current[savedAddress] }))}
                                                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 text-white border border-white/10 hover:bg-white/20 transition-all duration-300"
                                            >
                                                {revealed[savedAddress] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                <span className="text-sm">{revealed[savedAddress] ? t('spark.hide') : t('spark.show')}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleCopyKeys({ [savedAddress]: savedKeys[savedAddress] }, savedAddress)}
                                                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 text-white border border-white/10 hover:bg-white/20 transition-all duration-300"
                                            >
                                                {copied === savedAddress ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                <span className="text-sm">{copied === savedAddress ? t('spark.copied') : t('spark.copyThisKey')}</span>
                                            </button>
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                            {fundedAddresses.length > PAGE_SIZE && (
                                <div className="flex items-center justify-center gap-4 mt-5">
                                    <button
                                        type="button"
                                        onClick={() => setPage(Math.max(0, currentPage - 1))}
                                        disabled={currentPage === 0}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-300 ${
                                            currentPage === 0
                                                ? 'bg-gray-200/12 text-gray-400 border-white/10 cursor-not-allowed'
                                                : 'bg-white/10 text-white border-white/10 hover:bg-white/20 cursor-pointer'
                                        }`}
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                        <span className="text-sm">{t('spark.previous')}</span>
                                    </button>
                                    <span className="text-white/70 text-sm">
                                        {currentPage + 1} / {totalPages}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))}
                                        disabled={currentPage >= totalPages - 1}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-300 ${
                                            currentPage >= totalPages - 1
                                                ? 'bg-gray-200/12 text-gray-400 border-white/10 cursor-not-allowed'
                                                : 'bg-white/10 text-white border-white/10 hover:bg-white/20 cursor-pointer'
                                        }`}
                                    >
                                        <span className="text-sm">{t('spark.next')}</span>
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {fundedAddresses.length === 0 && stillChecking && (
                        <div className="rounded-2xl p-6 text-center border border-[color:var(--theme-inset-border)] bg-[color:var(--theme-inset-bg)]">
                            <div className="text-white/80 text-base mb-1">{t('spark.lookingUp')}</div>
                            <div className="text-white/50 text-sm">
                                {progressLabel || t('spark.checkingChain')}
                            </div>
                        </div>
                    )}

                    {fundedAddresses.length === 0 && !stillChecking && (
                        <div className="rounded-2xl p-6 text-center border border-[color:var(--theme-inset-border)] bg-[color:var(--theme-inset-bg)]">
                            <div className="text-white/80 text-base mb-1">{t('spark.noFundedKeys')}</div>
                            <div className="text-white/50 text-sm">
                                {t('spark.keysHidden')}
                            </div>
                        </div>
                    )}
                </GlassCard>

                <GlassCard className="p-5 md:p-6">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <Coins className="w-5 h-5 text-[color:var(--theme-accent)] shrink-0" />
                            <h2 className="text-xl font-bold text-white">{t('spark.fundedUnits')}</h2>
                        </div>
                        <div className="flex flex-col items-stretch sm:items-end gap-2">
                        {fundedUnits.length >= 1 && !confirmingConsolidate && !confirmingRefund && (
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={handleStartRefund}
                                    disabled={!canRefund}
                                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border transition-all duration-300 ${
                                        canRefund
                                            ? 'bg-white/10 text-white border-white/10 hover:bg-white/20 cursor-pointer'
                                            : 'bg-gray-200/12 text-gray-400 border-white/10 cursor-not-allowed'
                                    }`}
                                >
                                    {refunding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
                                    <span className="text-sm font-medium">
                                        {refunding ? t('spark.refunding') : t('spark.refund')}
                                    </span>
                                </button>
                                {fundedUnits.length >= 2 && (
                                    <button
                                        type="button"
                                        onClick={handleStartConsolidate}
                                        disabled={!canConsolidate}
                                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border transition-all duration-300 ${
                                            canConsolidate
                                                ? 'bg-white/10 text-white border-white/10 hover:bg-white/20 cursor-pointer'
                                                : 'bg-gray-200/12 text-gray-400 border-white/10 cursor-not-allowed'
                                        }`}
                                    >
                                        {consolidating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Combine className="w-4 h-4" />}
                                        <span className="text-sm font-medium">
                                            {consolidating ? t('spark.consolidating') : t('spark.consolidate')}
                                        </span>
                                    </button>
                                )}
                            </div>
                        )}
                        {confirmingConsolidate && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <span className="text-sm text-orange-200">
                                    {t('spark.consolidateConfirm', {
                                        count: fundedUnits.length,
                                        address: shortAddress(address),
                                        fee: formatSats(consolidateFee, locale),
                                    })}
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setConfirmingConsolidate(false)}
                                        disabled={consolidating}
                                        className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/10 text-white border border-white/10 hover:bg-white/20 transition-all duration-300"
                                    >
                                        <span className="text-sm font-medium">{t('spark.cancel')}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleConsolidate}
                                        disabled={consolidating}
                                        className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[color:var(--theme-accent-strong)]/90 text-white border border-white/20 hover:opacity-95 transition-all duration-300"
                                    >
                                        {consolidating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Combine className="w-4 h-4" />}
                                        <span className="text-sm font-medium">
                                            {consolidating ? t('spark.consolidating') : t('spark.consolidate')}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        )}
                        {confirmingRefund && (
                            <div className="flex flex-col gap-3 max-w-xl">
                                <p className="text-sm text-orange-200">
                                    {t('spark.refundConfirm', {
                                        count: fundedUnits.length,
                                        origins: refundPlan.length,
                                    })}
                                </p>
                                <ul className="space-y-1 text-xs text-white/55">
                                    {refundPlan.map((row) => (
                                        <li key={row.origin} className="font-mono break-all">
                                            {t('spark.refundPlanRow', {
                                                count: row.unitCount,
                                                address: shortAddress(row.origin),
                                                amount: formatSats(row.value, locale),
                                                fee: formatSats(row.fee, locale),
                                            })}
                                        </li>
                                    ))}
                                </ul>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setConfirmingRefund(false);
                                            setRefundPlan([]);
                                        }}
                                        disabled={refunding}
                                        className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/10 text-white border border-white/10 hover:bg-white/20 transition-all duration-300"
                                    >
                                        <span className="text-sm font-medium">{t('spark.cancel')}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleRefund}
                                        disabled={refunding}
                                        className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[color:var(--theme-accent-strong)]/90 text-white border border-white/20 hover:opacity-95 transition-all duration-300"
                                    >
                                        {refunding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
                                        <span className="text-sm font-medium">
                                            {refunding ? t('spark.refunding') : t('spark.refund')}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        )}
                        </div>
                    </div>

                    {fundedUnits.length >= 1 && (
                        <p className="text-white/60 text-sm mb-5">
                            {t('spark.refundHint')}
                            {fundedUnits.length >= 2 ? ` ${t('spark.consolidateHint')}` : ''}
                        </p>
                    )}
                    {consolidateError && (
                        <div className="p-4 mb-4 text-md text-red-800 rounded-lg bg-red-50 dark:bg-red-900/20 dark:text-red-300" role="alert">
                            <span className="font-bold">{t('spark.error')}</span> {consolidateError}
                        </div>
                    )}
                    {refundError && (
                        <div className="p-4 mb-4 text-md text-red-800 rounded-lg bg-red-50 dark:bg-red-900/20 dark:text-red-300" role="alert">
                            <span className="font-bold">{t('spark.error')}</span> {refundError}
                        </div>
                    )}
                    {consolidateTxId && (
                        <div className="p-4 mb-5 text-md rounded-lg bg-white/5" role="status">
                            <a
                                href={`https://mempool.space/tx/${consolidateTxId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-white hover:text-white/80 font-bold text-center block"
                            >
                                {t('spark.consolidateSuccess').split('\n').map((line, index) => (
                                    <span key={line}>
                                        {index > 0 ? <br /> : null}
                                        {line}
                                    </span>
                                ))}
                            </a>
                        </div>
                    )}
                    {refundTxIds.length > 0 && (
                        <div className="p-4 mb-5 text-md rounded-lg bg-white/5 space-y-2" role="status">
                            <p className="text-white font-bold text-center">{t('spark.refundSuccess')}</p>
                            {refundTxIds.map((txid) => (
                                <a
                                    key={txid}
                                    href={`https://mempool.space/tx/${txid}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-white/80 hover:text-white text-center block text-sm font-mono break-all"
                                >
                                    {txid}
                                </a>
                            ))}
                        </div>
                    )}

                    {participationUnits.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <AnimatePresence>
                                {participationUnits.map((utxo, index) => (
                                    <motion.div
                                    key={`${utxo.tx_hash}:${utxo.tx_output}`}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    transition={{ 
                                        delay: index * 0.05,
                                        duration: 0.3,
                                        ease: "easeOut"
                                    }}
                                    onClick={() => handleToggleSelection(index)}
                                    >
                                    <UTXOCard
                                        utxo={utxo}
                                        index={index}
                                    />
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    ) : (
                        <div className="rounded-2xl p-6 text-center border border-[color:var(--theme-inset-border)] bg-[color:var(--theme-inset-bg)]">
                            <div className="text-white/80 text-base mb-1">{t('spark.noUnits')}</div>
                            <div className="text-white/50 text-sm">
                                {t('spark.noUnitsHint')}
                            </div>
                        </div>
                    )}
                </GlassCard>

                <GlassCard className="p-5 md:p-6">
                    <div className="flex items-center gap-3 mb-2">
                        <Download className="w-5 h-5 text-[color:var(--theme-accent)] shrink-0" />
                        <h2 className="text-lg font-semibold text-white">{t('spark.importTitle')}</h2>
                    </div>
                    <p className="text-white/60 text-sm mb-4">
                        {t('spark.importHint')}
                    </p>
                    <textarea
                        value={importText}
                        onChange={(event) => setImportText(event.target.value)}
                        placeholder='{"version":1,"keys":[{"address":"...","privateKey":"..."}]}'
                        className="w-full h-28 px-4 py-3 mb-4 rounded-2xl border border-[color:var(--theme-inset-border)] bg-[color:var(--theme-inset-bg)] text-white placeholder-white/40 resize-none focus:outline-none focus:border-[color:var(--theme-card-border)] font-mono text-sm"
                    />
                    <button
                        type="button"
                        onClick={handleImport}
                        disabled={!importText.trim()}
                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl border transition-all duration-300 ${
                            importText.trim()
                                ? 'bg-white/10 text-white border-white/10 hover:bg-white/20 cursor-pointer'
                                : 'bg-gray-200/12 text-gray-200 border-white/10 cursor-not-allowed'
                        }`}
                    >
                        {t('spark.importButton')}
                    </button>
                    {importError && (
                        <div className="mt-4 p-4 text-md text-red-800 rounded-lg bg-red-50 dark:bg-red-900/20 dark:text-red-300" role="alert">
                            <span className="font-bold">{t('spark.error')}</span> {importError}
                        </div>
                    )}
                </GlassCard>
            </div>
        </div>
        </motion.div>
    );
}
