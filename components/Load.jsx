
import { motion } from "framer-motion";
import GlassCard from "../components/GlassCard";
import { Activity, Copy, Check, Eye, EyeOff, ChevronLeft, ChevronRight } from "lucide-react";

import QRCode from "react-qr-code";
import React, { useEffect, useState, useContext } from 'react';
import { SharedContext } from '../src/SharedContext';
import UTXOCard from "./UTXOCard";
import { AnimatePresence } from 'framer-motion';
import {
    createParticipationKey,
    parseParticipationKeys,
    readStoredKeyPairs,
    serializeParticipationKeys,
    writeStoredKeyPairs,
} from '../services/ParticipationKeys';

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

function formatSats(sats) {
    return new Intl.NumberFormat('en-US').format(sats || 0);
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
    const { refs, setCurrentIndex, addressFunds, fundsProgress, refreshRefs, ensureUtxoHex } = useContext(SharedContext);

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

    const handleImport = async () => {
        setImportError(null);
        try {
            const incoming = parseParticipationKeys(importText);
            const merged = { ...readStoredKeyPairs(), ...incoming };
            const importedAddress = Object.keys(incoming)[0];
            applyKeys(merged, importedAddress);
            window.location.reload();
        } catch (error) {
            setImportError(error.message || 'Could not import those participation keys');
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
        ? `Checking keys ${fundsProgress.checked} / ${fundsProgress.total}`
        : fundsProgress?.phase === 'units'
        ? `Loading funded units ${fundsProgress.checked} / ${fundsProgress.total}`
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

    return (
        
        <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ 
            delay: 0.2,
            duration: 0.8,
            ease: [0.4, 0, 0.2, 1]
            }}
            className="glass-card rounded-2xl p-6"
        >
        {<GlassCard className="p-8 mb-8 max-w-5xl mx-auto">

        <div className="flex items-center gap-3 mb-6">
            <Activity className="w-6 h-6 text-orange-400" />
            <h2 className="text-2xl font-bold text-white">Load bitcoins (units) 
            <span className="text-sm"> (min 0.00001 BTC)</span>
            </h2>
        </div>

        {address && (
        <div className="flex items-center justify-center gap-3 mb-6">
            { <QRCode
                value={address}
                size='256'
                bgColor="rgba(255, 255, 0, 0)"
                fgColor="black"
                level="H"
                includeMargin={true}
                style={{
                height: "auto",
                maxWidth: "20%",
                width: "20%",
                borderRadius: "5px",
                boxShadow: "0 0px 0px rgba(0, 0, 0, 0.15)"
                }}
            />}
        </div>
        )}
        {address && (
            <p className="text-center text-white/50 text-sm mb-6">
                Watching for incoming bitcoin. Funded keys appear here automatically.
            </p>
        )}

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
                <Activity className="w-6 h-6 text-blue-400" />
                <h2 className="text-2xl font-bold text-white">Participation Keys</h2>
            </div>
            {fundedAddresses.length > 0 && (
                <button
                    type="button"
                    onClick={() => handleCopyKeys(fundedKeyPairs, 'all')}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white border border-white/10 hover:bg-white/20 transition-all duration-300"
                >
                    {copied === 'all' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span className="text-sm font-medium">
                        {copied === 'all' ? 'Copied all keys' : 'Copy all keys'}
                    </span>
                </button>
            )}
        </div>

        <p className="text-white/60 text-sm mb-6">
            Copy these keys to reuse them in another browser. The copied text includes the private key, so anyone who has it can spend the coins on that address.
        </p>

        {isLoadingFunds && fundsProgress.total > 0 && (
            <div className="mb-6">
                <div className="flex justify-between gap-3 text-sm text-white/70 mb-2">
                    <span>{progressLabel}</span>
                    <span>{fundsProgress.funded} funded</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                        className="h-full bg-orange-400/80 transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </div>
        )}

        {fundedAddresses.length > 0 && (
            <div className="mb-8">
            <div className="grid grid-cols-1 gap-4">
                {pagedAddresses.map((savedAddress) => {
                    const utxoSum = participationUnits
                        .filter((unit) => unit.public_key === savedAddress)
                        .reduce((sum, unit) => sum + (unit.value || 0), 0);
                    const funds = addressFunds?.[savedAddress] || { received: utxoSum, available: utxoSum };
                    return (
                    <div key={savedAddress} className="glass-panel rounded-3xl p-5 border border-white/10 bg-white/5">
                        <div className="flex items-start justify-between gap-3 mb-4">
                            <div>
                                <div className="text-gray-400 text-xs mb-1">Address</div>
                                <div className="text-white text-sm font-mono break-all">{savedAddress}</div>
                            </div>
                            {funds.pending && (
                                <span className="shrink-0 px-3 py-1 rounded-full text-xs font-semibold bg-orange-500/20 text-orange-300 border border-orange-400/30">
                                    Unconfirmed
                                </span>
                            )}
                        </div>
                        <div className="mb-4">
                            <div className="text-gray-400 text-xs mb-1">Amount sent</div>
                            <div className="text-2xl font-bold text-white">
                                {formatSats(funds.received)} SATS
                            </div>
                            <div className="text-gray-400 text-sm">
                                ≈ {formatBtc(funds.received)} BTC
                                {funds.unconfirmed > 0 ? ` · ${formatSats(funds.unconfirmed)} sats unconfirmed` : ''}
                                {funds.available !== funds.received ? ` · ${formatSats(funds.available)} sats available` : ''}
                            </div>
                        </div>
                        <div className="text-gray-400 text-xs mb-1">Private key</div>
                        <div className="text-white/80 text-sm font-mono break-all mb-4">
                            {revealed[savedAddress] ? savedKeys[savedAddress] : '••••••••••••••••••••••••••••••••'}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setRevealed((current) => ({ ...current, [savedAddress]: !current[savedAddress] }))}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 text-white border border-white/10 hover:bg-white/20 transition-all duration-300"
                            >
                                {revealed[savedAddress] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                <span className="text-sm">{revealed[savedAddress] ? 'Hide' : 'Show'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleCopyKeys({ [savedAddress]: savedKeys[savedAddress] }, savedAddress)}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 text-white border border-white/10 hover:bg-white/20 transition-all duration-300"
                            >
                                {copied === savedAddress ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                <span className="text-sm">{copied === savedAddress ? 'Copied' : 'Copy this key'}</span>
                            </button>
                        </div>
                    </div>
                    );
                })}
            </div>
            {fundedAddresses.length > PAGE_SIZE && (
                <div className="flex items-center justify-center gap-4 mt-6">
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
                        <span className="text-sm">Previous</span>
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
                        <span className="text-sm">Next</span>
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}
            </div>
        )}

        {fundedAddresses.length === 0 && stillChecking && (
            <div className="glass-panel rounded-3xl p-8 max-w-md mx-auto mb-8 text-center">
                <div className="text-white/80 text-lg mb-2">Looking up funded keys…</div>
                <div className="text-white/50 text-sm">
                    {progressLabel || 'Checking the chain for bitcoin sent to your participation keys.'}
                </div>
            </div>
        )}

        {fundedAddresses.length === 0 && !stillChecking && (
            <div className="glass-panel rounded-3xl p-8 max-w-md mx-auto mb-8 text-center">
                <div className="text-white/80 text-lg mb-2">No funded participation keys</div>
                <div className="text-white/50 text-sm">
                    Keys with 0 SATS are hidden. Send bitcoin to the QR address, then this list will show that key.
                </div>
            </div>
        )}

        <div className="mb-10">
            <h3 className="text-lg font-semibold text-white mb-2">Import keys from another browser</h3>
            <p className="text-white/60 text-sm mb-4">
                Paste a copied participation key bundle here. Those keys will be saved in this browser and any funded units will show below.
            </p>
            <textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder='{"version":1,"keys":[{"address":"...","privateKey":"..."}]}'
                className="w-full h-36 px-4 py-3 mb-4 backdrop-blur-xl bg-white/10 rounded-2xl border border-white/20 text-white placeholder-white/40 resize-none focus:outline-none focus:border-white/50 font-mono text-sm"
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
                Import participation keys
            </button>
            {importError && (
                <div className="mt-4 p-4 text-md text-red-800 rounded-lg bg-red-50 dark:bg-red-900/20 dark:text-red-300" role="alert">
                    <span className="font-bold">Error:</span> {importError}
                </div>
            )}
        </div>
   
        <div className="flex items-center gap-3 mb-6">
            <Activity className="w-6 h-6 text-blue-400" />
            <h2 className="text-2xl font-bold text-white">Funded units</h2>
        </div>

        {participationUnits.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
        )}

        {participationUnits.length === 0 && (
            <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
            >
            <div className="glass-panel rounded-3xl p-8 max-w-md mx-auto">
                <div className="text-black-400 text-lg mb-2">No funded units yet</div>
                <div className="text-black-500 text-sm">
                Send bitcoin to the QR address, or import keys that already have funds. Those units will appear here.
                </div>
            </div>
            </motion.div>
        )}

        </GlassCard> }
        </motion.div>
    );
}
