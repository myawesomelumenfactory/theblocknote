import React, { useEffect, useMemo, useState, useContext, useRef } from 'react';
import { motion } from "framer-motion";
import GlassCard from "./GlassCard";
import { decodeOpReturn } from '../services/TheBlockNote';
import { Activity, ChevronUp, ChevronDown, Clock, List, Loader2 } from "lucide-react";
import { applyVoteUp, applyVoteDown, getHighestFundedUnit } from '../services/BitcoinService';
import { appendImmutable, loadImmutableRecords } from '../services/ImmutablesStore';
import immutablesData, { immutablesState } from 'virtual:immutables';
import { SharedContext } from '../src/SharedContext';
import { windowMotion } from '../services/introMotion';
import { useLanguage } from '../src/i18n/LanguageContext';

const BATCH_SIZE = 5;

export default function LatestMessagesBlocks() {

  const [messages, setMessages] = useState([]);
  const [opReturns, setOpReturns] = useState([]);
  const [theblocknote, setTheBlockNote] = useState([]);
  const [txids, setTxids] = useState([]);
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [voteNotice, setVoteNotice] = useState(null);
  const [votingIndex, setVotingIndex] = useState(null);
  const [openVoteLists, setOpenVoteLists] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState('latest');
  const { refs, ensureUtxoHex, refreshRefs } = useContext(SharedContext);
  const { t } = useLanguage();
  const listRef = useRef(null);
  const sentinelRef = useRef(null);
  const hasFundedUnit = Boolean(getHighestFundedUnit(Array.isArray(refs) ? refs : [], 450));
  const sortModes = [
    { id: 'latest', label: t('messages.latest'), title: t('messages.latestTitle') },
    { id: 'up', label: t('messages.up'), title: t('messages.upTitle') },
    { id: 'down', label: t('messages.down'), title: t('messages.downTitle') },
  ];

  function formatTimestampToUTC(timestampInSeconds) {
    const date = new Date(timestampInSeconds * 1000); // convert seconds to ms
    
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0'); // Months start at 0
    const dd = String(date.getUTCDate()).padStart(2, '0');
  
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
  
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss} UTC`;
  }

  function voteTxidFromIndex(index) {
    return String(index || '').split('_')[0];
  }

  function explorerTxUrl(txid) {
    return txid ? `https://mempool.space/tx/${txid}` : null;
  }

  function toggleVoteList(messageIndex) {
    setOpenVoteLists((prev) => {
      const next = new Set(prev);
      if (next.has(messageIndex)) next.delete(messageIndex);
      else next.add(messageIndex);
      return next;
    });
  }

  const handleVote = async (messageIndex, direction) => {
    const selectedUnit = getHighestFundedUnit(Array.isArray(refs) ? refs : [], 450);
    if (!selectedUnit) {
      setVoteNotice({ type: 'error', text: t('messages.voteBefore') });
      return;
    }

    setVotingIndex(messageIndex);
    setVoteNotice(null);

    try {
      const parts = messageIndex.split('_');
      const hash = parts[0];
      const vout = parts[1];
      const utxo = ensureUtxoHex ? await ensureUtxoHex(selectedUnit.index) : selectedUnit;
      const result = direction === 'up'
        ? await applyVoteUp(utxo, hash, vout, 450)
        : await applyVoteDown(utxo, hash, vout, 450);

      if (!result.success) {
        setVoteNotice({ type: 'error', text: result.error || t('messages.voteFailed') });
        return;
      }

      await appendImmutable({
        index: `${result.transactionId}_0`,
        time: Math.floor(Date.now() / 1000),
        value: direction === 'up' ? `t 0 1 ${hash} ${vout}` : `t 0 -1 ${hash} ${vout}`,
      });

      const newVote = {
        txid: result.transactionId,
        time: Math.floor(Date.now() / 1000),
        direction,
      };

      setTheBlockNote((prev) =>
        prev.map((msg) =>
          msg.index === messageIndex
            ? {
                ...msg,
                ups: direction === 'up' ? msg.ups + 1 : msg.ups,
                downs: direction === 'down' ? msg.downs + 1 : msg.downs,
                votes: [...(msg.votes || []), newVote],
              }
            : msg
        )
      );
      setOpenVoteLists((prev) => new Set([...prev, messageIndex]));
      setVoteNotice({
        type: 'success',
        text: direction === 'up' ? t('messages.upRecorded') : t('messages.downRecorded'),
        url: result.explorerUrl,
      });
      if (refreshRefs) {
        await refreshRefs({ watch: true, address: selectedUnit.public_key });
      }
    } catch (error) {
      setVoteNotice({ type: 'error', text: error.message || t('messages.voteFailed') });
    } finally {
      setVotingIndex(null);
    }
  };

  const handleVoteUp = (messageIndex) => handleVote(messageIndex, 'up');
  const handleVoteDown = (messageIndex) => handleVote(messageIndex, 'down');

  function loadMessages() {
    console.log('--- CURRENT BLOCK HEX ---');
    setOpReturns([]);

    const url = `https://blockstream.info/api/block/00000000000000000001cb78cb8b1d6af46b6ebca356611d980a47f77a865e0e/txids`;

    fetch(url)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setTxids(data.slice(0, 1000));

        txids.forEach(tx => {
          console.log("--- TRANSACTION ---");

          const url = `https://blockchain.info/rawtx/${tx}`;
          console.log(url);

          fetch(url)
          .then((res) => {
            if (!res.ok) {
              throw new Error(`HTTP error: ${res.status}`);
            }
            return res.json();
          })
          .then((data) => {
            console.log('--- RAW TX ---');

            var extracted = {
              hash: data.hash,
              time: formatTimestampToUTC(data.time),
              messages: data.out
                .map(item => decodeOpReturn(item.script))      // decode OP_RETURN messages
                .filter(decoded => decoded !== null)            // filter out nulls
                .filter(decoded => decoded.startsWith("t 0 0")) // keep only messages starting with "t 0 0"
                .map(decoded => {
                  // Extract the string inside quotes
                  const match = decoded.match(/"([^"]+)"/);
                  return match ? match[1] : decoded; // fallback to original if no quotes found
                })
            };

            console.log(extracted);

            if (extracted.messages.length > 0) {  // Only add if not empty
              setOpReturns(prev => [...prev, extracted]);
            }
          })

        })
      })
  }

  const forwardProtocol = async() => {

    console.log('--- FORWARD PROTOCOL ---');

    const protocol = JSON.parse(localStorage.getItem('protocol'));

    console.log(protocol);
    if ( protocol === null ) {
      console.log('--- FORWARD PROTOCOL EMPTY ---');
      console.log('--- FETCHING LATEST BLOCK from https://blockchain.info/latestblock ---');
      console.log('--- FETCH LATEST BLOCK DATA https://blockchain.info/rawblock/00000000000000000000b34f4bbb4554a329032148ffc0154d205c9d60f58954 ---');
      // common process
      console.log('--- GENERATE SPARKS AND theblocknote data');
      console.log('--- SAVE TO LOCAL STORAGE WITH THE FORWARD BLOCK NUMBER');
      // common process

      console.log('--- SAVE THE NEXT BLOCK TO FORWARD: ACTUALLY THE PREV BLOCK FROM API');
    } else {
      console.log('--- FORWARD PROTOCOL ALREADY FILLED ---');
      console.log('--- PARSE WITH THE NEXT BLOCK HASH VARIABLE FROM THE PROTOCOL');

      // common process
      console.log('--- GENERATE SPARKS AND theblocknote data');
      console.log('--- SAVE TO LOCAL STORAGE WITH THE FORWARD BLOCK NUMBER');
      // common process
    }

    /*
    var sparks = [];
    var immutables = [];
    var theblocknote = [];
    var forwarded = [];

    const protocol = JSON.parse(localStorage.getItem('protocol'));

    // fetch API https://blockchain.info/latestblock (field block_index)
    var latestBlockHash = "00000000000000000000b34f4bbb4554a329032148ffc0154d205c9d60f58954"; // field hash
    var latestBlockIndex = 910938;

    var toBeForwarded = false;
    if ( protocol !== null ) {
      toBeForwarded = !protocol.forwarded.includes(latestBlockIndex);
    }

    if ( toBeForwarded ) {
      const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      const res = await fetch(`https://blockchain.info/rawblock/${currentBlockHash}`);
      const data = await res.json();
  
      var txs = data.tx;
  
      txs.forEach((tx) => {
        tx.out.forEach((out, out_index) => {
          immutables.push({
            "index": tx.hash + "_" + out_index,
            "time": tx.time,
            "value": out.script
          });
        })
      });
  
      immutables.forEach(t => {
        if ( t.value !== null ) {
          const parts = t.value.match(/"([^"]+)"|[^\s"]+/g).map(part => {
            // Remove quotes if present
            return part.replace(/^"|"$/g, '');
          });
          var protocol = parts[0];
          var version = parts[1];
          var type = parts[2];
  
          if ( protocol == "t" ) {
            console.log("--- THEBLOCKNOTE DATA DETECTED ---");
            theblocknote.push({
              "index": tx.hash + "_" + out_index,
              "time": tx.time,
              "value": decodeOpReturn(out.script)
            });
          }
        }
      });

      forwarded.push(currentBlockIndex);
      currentBlockIndex = data.prev_block; // mark the current block to parse from the previous block
  
      localStorage.setItem('protocol', JSON.stringify({
        "forwarded": forwarded,
        "sparks": sparks,
        "theblocknote": theblocknote
      }));
  
    }*/
 
  }

  /**
   * Reconstruct The Block Note Protocol
   * from immutables.json data
   */
  const fetchTheBlockNote = async() => {
    try {
    var messages = await fetchMessages();
    var downs   = [];
    var ups     = [];
    var theblocknote = [];

    messages.forEach((m) => {

      if ( m.value !== null ) {
        const matched = m.value.match(/"([^"]+)"|[^\s"]+/g);
        if (!matched) return;
        const parts = matched.map(part => {
          // Remove quotes if present
          return part.replace(/^"|"$/g, '');
        });
        
        var protocol = parts[0];
        var version = parts[1];
        var type = parts[2];

        if ( type == 0 ) {
          var message = parts[3];
          theblocknote.push({
            "time": m.time,
            "index": m.index,
            "value": message,
            "downs": 0,
            "ups": 0,
            "votes": []
          });
       }

        if ( type == -1 ) {
          var hash = parts[3];
          var index = parts[4];
          downs.push({
            "time": m.time,
            "hash": hash,
            "index": parseInt(index),
            "txid": voteTxidFromIndex(m.index)
          });
        }

        if ( type == 1 ) {
          var hash = parts[3];
          var index = parts[4];
          ups.push({
            "time": m.time,
            "hash": hash,
            "index": parseInt(index),
            "txid": voteTxidFromIndex(m.index)
          });
        }
      }

    });

    // Processing donws votes
      theblocknote.forEach(m => {
      if (!m.index) return;
      const parts = m.index.split("_");
      var hash = parts[0];
      var index = parts[1];

      downs.forEach(down => {
        if ( down.hash === hash && down.index == index ) {
          m.downs++;
          m.votes.push({
            txid: down.txid,
            time: down.time,
            direction: 'down',
          });
        }
      });

      ups.forEach(up => {
        if ( up.hash === hash && up.index == index ) {
          m.ups++;
          m.votes.push({
            txid: up.txid,
            time: up.time,
            direction: 'up',
          });
        }
      });
      m.votes.sort((a, b) => b.time - a.time);
    })

    theblocknote.sort((a, b) => b.time - a.time);
    setTheBlockNote(theblocknote);
    } catch (error) {
      console.error('Failed to load immutables.json', error);
    } finally {
      setLoading(false);
    }
  }

  const fetchMessages = async() => {
    return loadImmutableRecords(immutablesData, immutablesState);
  }

  useEffect(() => {
    fetchTheBlockNote();
    const poll = window.setInterval(() => {
      fetchTheBlockNote();
    }, 30000);
    const onUpdate = () => fetchTheBlockNote();
    window.addEventListener('theblocknote:immutables', onUpdate);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener('theblocknote:immutables', onUpdate);
    };
  }, []);

  const visibleMessages = useMemo(() => {
    const rows = [...theblocknote];
    if (sortMode === 'up') {
      rows.sort((a, b) => b.ups - a.ups || b.time - a.time);
      return rows;
    }
    if (sortMode === 'down') {
      return rows
        .filter((row) => row.downs > 0)
        .sort((a, b) => b.downs - a.downs || b.time - a.time);
    }
    rows.sort((a, b) => b.time - a.time);
    return rows;
  }, [theblocknote, sortMode]);

  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [sortMode]);

  useEffect(() => {
    setVisibleCount((current) => {
      const total = visibleMessages.length;
      if (total === 0) return BATCH_SIZE;
      return Math.min(Math.max(current, BATCH_SIZE), total);
    });
  }, [visibleMessages.length]);

  const shownMessages = visibleMessages.slice(0, visibleCount);
  const hasMore = visibleCount < visibleMessages.length;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = listRef.current;
    if (!sentinel || !hasMore) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisibleCount((current) => Math.min(current + BATCH_SIZE, visibleMessages.length));
      },
      { root: root || null, rootMargin: '240px', threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, shownMessages.length, visibleMessages.length]);

  return (
    <motion.div 
        {...windowMotion({
        delay: 0.15,
        duration: 0.6,
        ease: [0.4, 0, 0.2, 1]
        })}
        className="w-full h-full min-h-0 flex-1 flex flex-col"
    >
    {<GlassCard className="p-6 md:p-8 h-full min-h-0 flex-1 flex flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <Activity className="w-6 h-6 text-blue-400 shrink-0" />
            <h2 className="text-2xl font-bold text-white">{t('messages.title')}</h2>
          </div>
          <div
            role="group"
            aria-label={t('messages.filter')}
            className="flex shrink-0 items-center rounded-full border border-white/10 bg-white/5 p-0.5"
          >
            {sortModes.map((mode) => {
              const active = sortMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  title={mode.title}
                  aria-pressed={active}
                  onClick={() => setSortMode(mode.id)}
                  className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-white/15 text-white'
                      : 'text-white/45 hover:text-white/80'
                  }`}
                >
                  {mode.id === 'latest' ? (
                    <Clock className="w-3 h-3" />
                  ) : mode.id === 'up' ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                  {mode.label}
                </button>
              );
            })}
          </div>
      </div>

      {voteNotice?.type === 'success' && (
        <div className="p-4 mb-4 text-md text-white rounded-lg bg-white/10" role="status">
          <span className="font-bold">{voteNotice.text}</span>
          {voteNotice.url && (
            <>
              {' '}
              <a
                href={voteNotice.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-white/80 hover:text-white"
              >
                {t('messages.verify')}
              </a>
            </>
          )}
        </div>
      )}
      {voteNotice?.type === 'error' && (
        <div className="p-4 mb-4 text-md text-red-800 rounded-lg bg-red-50 dark:bg-red-900/20 dark:text-red-300" role="alert">
          <span className="font-bold">{t('messages.error')}</span> {voteNotice.text}
        </div>
      )}
      {!hasFundedUnit && !loading && (
        <p className="text-white/50 text-sm mb-4">
          {t('messages.needUnit')}
        </p>
      )}

      {loading ? (
        <div
          className="flex flex-col items-center justify-center py-16 min-h-[280px] flex-1 gap-3"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <span className="text-white/60 text-sm">{t('messages.loading')}</span>
        </div>
      ) : (
      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
      >
      {shownMessages.length === 0 ? (
        <p className="text-white/50 text-sm py-8 text-center">
          {sortMode === 'down' ? t('messages.noDowns') : t('messages.none')}
        </p>
      ) : null}
      <ul>
        {shownMessages.map((msg, index) => {
          const txid = voteTxidFromIndex(msg.index);
          const txUrl = explorerTxUrl(txid);
          return (
          <motion.div 
            {...windowMotion({
            delay: index < BATCH_SIZE ? index * 0.05 : 0,
            duration: 0.4,
            ease: [0.4, 0, 0.2, 1]
          })}
          className="mb-4"
          key={msg.index}
          >
          {<GlassCard className="p-5">
            <div className="space-y-4">
              {/* Message Content */}
              <div>
                <p className="text-white text-lg mb-2">{msg.value}</p>
                {txUrl ? (
                    <a
                      href={txUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t('messages.viewTx')}
                      className="text-white/30 text-sm hover:text-white/60"
                    >
                      {formatTimestampToUTC(msg.time)}
                    </a>
                ) : (
                  <p className="text-white/30 text-sm">{formatTimestampToUTC(msg.time)}</p>
                )}
              </div>
              
              {/* Voting Controls at Bottom */}
              <div className="flex items-center justify-center gap-4 pt-4 border-t border-white/10">
                {/* Vote Up Button */}
                <button
                  type="button"
                  onClick={() => handleVoteUp(msg.index)}
                  disabled={!hasFundedUnit || votingIndex === msg.index}
                  title={!hasFundedUnit ? t('messages.loadToVote') : t('messages.voteUp')}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200
                    ${!hasFundedUnit || votingIndex === msg.index
                      ? 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
                      : 'bg-white/10 text-white hover:bg-green-500/20 hover:text-green-400 hover:scale-105'
                    }
                  `}
                >
                  <ChevronUp className="w-4 h-4" />
                  <span className="text-sm font-medium">{msg.ups}</span>
                </button>
                
                {/* Vote Down Button */}
                <button
                  type="button"
                  onClick={() => handleVoteDown(msg.index)}
                  disabled={!hasFundedUnit || votingIndex === msg.index}
                  title={!hasFundedUnit ? t('messages.loadToVote') : t('messages.voteDown')}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200
                    ${!hasFundedUnit || votingIndex === msg.index
                      ? 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
                      : 'bg-white/10 text-white hover:bg-red-500/20 hover:text-red-400 hover:scale-105'
                    }
                  `}
                >
                  <ChevronDown className="w-4 h-4" />
                  <span className="text-sm font-medium">{msg.downs}</span>
                </button>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => toggleVoteList(msg.index)}
                  aria-expanded={openVoteLists.has(msg.index)}
                  className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
                >
                  <List className="w-4 h-4" />
                  <span>
                    {openVoteLists.has(msg.index) ? t('messages.hideVotes') : t('messages.showVotes')}
                    {` (${(msg.votes || []).length})`}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${openVoteLists.has(msg.index) ? 'rotate-180' : ''}`}
                  />
                </button>

                {openVoteLists.has(msg.index) && (
                  <ul className="mt-3 space-y-2">
                    {(msg.votes || []).length === 0 ? (
                      <li className="text-white/40 text-sm">{t('messages.noVotes')}</li>
                    ) : (
                      (msg.votes || []).map((vote) => (
                        <li
                          key={`${vote.txid}-${vote.direction}-${vote.time}`}
                          className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-3 mb-1">
                            <span className={`text-xs font-medium ${vote.direction === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                              {vote.direction === 'up' ? t('messages.upVote') : t('messages.downVote')}
                            </span>
                            <span className="text-white/40 text-xs">{formatTimestampToUTC(vote.time)}</span>
                          </div>
                          <a
                            href={explorerTxUrl(vote.txid)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-white/80 hover:text-white break-all underline decoration-white/20 hover:decoration-white/60"
                          >
                            {vote.txid}
                          </a>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            </div>
          </GlassCard> }
          </motion.div>
          );
        })}
      </ul>
      {hasMore ? (
        <div
          ref={sentinelRef}
          className="flex items-center justify-center gap-2 py-4"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
          <span className="text-white/50 text-sm">{t('messages.loadingMore')}</span>
        </div>
      ) : null}
      </div>
      )}

    </GlassCard> }
    </motion.div>
  );
}