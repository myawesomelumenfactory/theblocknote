import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from "framer-motion";
import GlassCard from "./GlassCard";
import TranslateButton from "./TranslateButton";
import { decodeOpReturn } from '../services/TheBlockNote';
import { Activity, ChevronUp, ChevronDown, Clock, List, Loader2, MessageCircle } from "lucide-react";
import { REPLY_MAX, fetchMessageReactions, replyToMessage, shortNpub, voteMessage } from '../services/declarations';
import { getFreeNoteIdentity } from '../services/freeNotes';
import { gatewayUrl } from '../services/ipfs';
import { loadImmutableRecords } from '../services/ImmutablesStore';
import {
  commentBelongsToMessage,
  parseCommentValue,
} from '../services/immutableProtocol';
import immutablesData, { immutablesState } from 'virtual:immutables';
import { windowMotion } from '../services/introMotion';
import { useLanguage } from '../src/i18n/LanguageContext';

const BATCH_SIZE = 5;

export default function LatestMessagesBlocks() {

  const [messages, setMessages] = useState([]);
  const [opReturns, setOpReturns] = useState([]);
  const [theblocknote, setTheBlockNote] = useState([]);
  const [freeReactions, setFreeReactions] = useState(() => new Map());
  const freeIdentity = useMemo(() => getFreeNoteIdentity(), []);
  const [txids, setTxids] = useState([]);
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [voteNotice, setVoteNotice] = useState(null);
  const [votingIndex, setVotingIndex] = useState(null);
  const [commentingIndex, setCommentingIndex] = useState(null);
  const [openVoteLists, setOpenVoteLists] = useState(() => new Set());
  const [openCommentLists, setOpenCommentLists] = useState(() => new Set());
  const [commentDrafts, setCommentDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState('latest');
  const { t } = useLanguage();
  const sentinelRef = useRef(null);
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

  function toggleCommentList(messageIndex) {
    setOpenCommentLists((prev) => {
      const next = new Set(prev);
      if (next.has(messageIndex)) next.delete(messageIndex);
      else next.add(messageIndex);
      return next;
    });
  }

  const hasFreeVote = (messageIndex) => Boolean(freeReactions.get(messageIndex)?.votes.has(freeIdentity.pubkey));

  const handleVote = async (messageIndex, direction) => {
    if (hasFreeVote(messageIndex)) return;
    setVotingIndex(messageIndex);
    setVoteNotice(null);

    try {
      const vote = await voteMessage(messageIndex, direction);
      setFreeReactions((prev) => {
        const next = new Map(prev);
        const entry = next.get(messageIndex) || { ups: new Set(), downs: new Set(), votes: new Map() };
        const field = direction === 'up' ? 'ups' : 'downs';
        next.set(messageIndex, {
          ...entry,
          [field]: new Set(entry[field]).add(freeIdentity.pubkey),
          votes: new Map(entry.votes).set(freeIdentity.pubkey, vote),
        });
        return next;
      });
      setOpenVoteLists((prev) => new Set([...prev, messageIndex]));
      setVoteNotice({
        type: 'success',
        text: direction === 'up' ? t('messages.upRecorded') : t('messages.downRecorded'),
        url: gatewayUrl(vote.cid),
      });
    } catch (error) {
      setVoteNotice({ type: 'error', text: error.message || t('messages.voteFailed') });
    } finally {
      setVotingIndex(null);
    }
  };

  const handleVoteUp = (messageIndex) => handleVote(messageIndex, 'up');
  const handleVoteDown = (messageIndex) => handleVote(messageIndex, 'down');

  const handleComment = async (messageIndex) => {
    const draft = String(commentDrafts[messageIndex] || '').trim();
    if (!draft) {
      setVoteNotice({ type: 'error', text: t('messages.commentEmpty') });
      return;
    }

    setCommentingIndex(messageIndex);
    setVoteNotice(null);

    try {
      const reply = await replyToMessage(messageIndex, draft);
      setFreeReactions((prev) => {
        const next = new Map(prev);
        const entry = next.get(messageIndex) || { ups: new Set(), downs: new Set(), votes: new Map(), replies: [] };
        next.set(messageIndex, { ...entry, replies: [...entry.replies, reply] });
        return next;
      });
      setCommentDrafts((prev) => ({ ...prev, [messageIndex]: '' }));
      setOpenCommentLists((prev) => new Set([...prev, messageIndex]));
      setVoteNotice({
        type: 'success',
        text: t('messages.commentRecorded'),
        url: gatewayUrl(reply.cid),
      });
    } catch (error) {
      setVoteNotice({ type: 'error', text: error.message || t('messages.commentFailed') });
    } finally {
      setCommentingIndex(null);
    }
  };

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
    var comments = [];
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
            "unconfirmed": Boolean(m.unconfirmed),
            "downs": 0,
            "ups": 0,
            "votes": [],
            "comments": []
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

        if ( type == 2 ) {
          const parsed = parseCommentValue(m.value);
          if (!parsed) return;
          comments.push({
            "time": m.time,
            "prefix": parsed.prefix,
            "prefixRaw": parsed.prefixRaw,
            "vout": parsed.vout,
            "text": parsed.text,
            "txid": voteTxidFromIndex(m.index),
            "unconfirmed": Boolean(m.unconfirmed),
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

      comments.forEach((comment) => {
        if (commentBelongsToMessage(comment, m.index)) {
          m.comments.push({
            txid: comment.txid,
            time: comment.time,
            text: comment.text,
            unconfirmed: Boolean(comment.unconfirmed),
          });
        }
      });

      m.votes.sort((a, b) => b.time - a.time);
      m.comments.sort((a, b) => a.time - b.time);
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

  const messageKey = theblocknote.map((m) => m.index).filter(Boolean).join(',');
  useEffect(() => {
    if (!messageKey) return undefined;
    let cancelled = false;
    fetchMessageReactions(messageKey.split(','))
      .then((votes) => {
        if (!cancelled) setFreeReactions(votes);
      })
      .catch((error) => console.warn('Free votes failed to load', error));
    return () => {
      cancelled = true;
    };
  }, [messageKey]);

  const withFreeReactions = useMemo(
    () =>
      theblocknote.map((msg) => {
        const free = freeReactions.get(msg.index);
        if (!free || (free.votes.size === 0 && free.replies.length === 0)) return msg;
        const freeVotes = [...free.votes.values()].map((vote) => ({
          free: true,
          cid: vote.cid,
          pubkey: vote.pubkey,
          time: vote.time,
          direction: vote.up ? 'up' : 'down',
        }));
        const freeComments = free.replies.map((reply) => ({
          free: true,
          cid: reply.cid,
          pubkey: reply.pubkey,
          time: reply.time,
          text: reply.text,
        }));
        return {
          ...msg,
          ups: msg.ups + free.ups.size,
          downs: msg.downs + free.downs.size,
          votes: [...(msg.votes || []), ...freeVotes].sort((a, b) => b.time - a.time),
          comments: [...(msg.comments || []), ...freeComments].sort((a, b) => a.time - b.time),
        };
      }),
    [theblocknote, freeReactions]
  );

  const visibleMessages = useMemo(() => {
    const rows = [...withFreeReactions];
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
  }, [withFreeReactions, sortMode]);

  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [sortMode]);

  useEffect(() => {
    setVisibleCount((current) => {
      const total = visibleMessages.length;
      if (total === 0) return current;
      return Math.min(Math.max(current, BATCH_SIZE), total);
    });
  }, [visibleMessages.length]);

  const shownMessages = visibleMessages.slice(0, visibleCount);
  const hasMore = visibleCount < visibleMessages.length;

  const loadMore = useCallback(() => {
    setVisibleCount((current) => {
      const total = visibleMessages.length;
      if (current >= total) return current;
      return Math.min(current + BATCH_SIZE, total);
    });
  }, [visibleMessages.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return undefined;

    let root = sentinel.parentElement;
    while (root) {
      const overflowY = window.getComputedStyle(root).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') break;
      root = root.parentElement;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        loadMore();
      },
      { root, rootMargin: '200px', threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, shownMessages.length, loadMore]);

  return (
    <motion.div 
        {...windowMotion({
        delay: 0.15,
        duration: 0.6,
        ease: [0.4, 0, 0.2, 1]
        })}
        className="w-full"
    >
    {<GlassCard className="p-6 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <Activity className="w-6 h-6 text-[color:var(--theme-accent)] shrink-0" />
            <div className="min-w-0">
              <h2 className="text-2xl font-bold text-white">{t('messages.title')}</h2>
              {!loading && (
                <p className="text-white/50 text-sm mt-0.5 tabular-nums" aria-live="polite">
                  {t(
                    visibleMessages.length === 1 ? 'messages.count' : 'messages.countPlural',
                    { count: visibleMessages.length }
                  )}
                </p>
              )}
            </div>
          </div>
          <div
            role="group"
            aria-label={t('messages.filter')}
            className="flex w-fit max-w-full shrink-0 items-center self-start sm:self-auto rounded-full border border-[color:var(--theme-inset-border)] bg-[color:var(--theme-inset-bg)] p-0.5"
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
                  className={`messages-sort-btn flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-[color:var(--theme-chip-bg)] text-black'
                      : 'text-black/55 hover:text-black'
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

      {loading ? (
        <div
          className="flex flex-col items-center justify-center py-16 min-h-[280px] gap-3"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="w-8 h-8 text-[color:var(--theme-accent)] animate-spin" />
          <span className="text-white/60 text-sm">{t('messages.loading')}</span>
        </div>
      ) : (
      <div>
      {shownMessages.length === 0 ? (
        <p className="text-white/50 text-sm py-8 text-center">
          {sortMode === 'down' ? t('messages.noDowns') : t('messages.none')}
        </p>
      ) : null}
      <ul>
        {shownMessages.map((msg, index) => {
          const txid = voteTxidFromIndex(msg.index);
          const txUrl = explorerTxUrl(txid);
          const voteLocked = votingIndex === msg.index || hasFreeVote(msg.index);
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
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-white text-lg min-w-0">{msg.value}</p>
                  {msg.unconfirmed ? (
                    <span
                      title={t('messages.unconfirmedHint')}
                      className="shrink-0 inline-flex items-center rounded-full border border-red-400/45 bg-red-500/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-300"
                    >
                      {t('messages.unconfirmed')}
                    </span>
                  ) : null}
                </div>
                {txUrl ? (
                    <a
                      href={txUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t('messages.viewTx')}
                      className="text-white/30 text-sm hover:text-white/60"
                    >
                      {formatTimestampToUTC(msg.time)}
                      {msg.unconfirmed ? ` · ${t('messages.unconfirmedDetail')}` : ''}
                    </a>
                ) : (
                  <p className="text-white/30 text-sm">
                    {formatTimestampToUTC(msg.time)}
                    {msg.unconfirmed ? ` · ${t('messages.unconfirmedDetail')}` : ''}
                  </p>
                )}
                <TranslateButton text={msg.value} className="mt-2" textClassName="text-white text-lg" />
              </div>
              
              {/* Voting Controls at Bottom */}
              <div className="flex items-center justify-center gap-4 pt-4 border-t border-white/10">
                {/* Vote Up Button */}
                <button
                  type="button"
                  onClick={() => handleVoteUp(msg.index)}
                  disabled={voteLocked}
                  title={hasFreeVote(msg.index) ? t('messages.alreadyVoted') : t('messages.voteUp')}
                  className={`
                    messages-vote-btn flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200 border border-transparent
                    ${voteLocked
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
                  disabled={voteLocked}
                  title={hasFreeVote(msg.index) ? t('messages.alreadyVoted') : t('messages.voteDown')}
                  className={`
                    messages-vote-btn flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200 border border-transparent
                    ${voteLocked
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
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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

                  <button
                    type="button"
                    onClick={() => toggleCommentList(msg.index)}
                    aria-expanded={openCommentLists.has(msg.index)}
                    className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>
                      {openCommentLists.has(msg.index) ? t('messages.hideComments') : t('messages.showComments')}
                      {` (${(msg.comments || []).length})`}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${openCommentLists.has(msg.index) ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>

                {openVoteLists.has(msg.index) && (
                  <ul className="mt-3 space-y-2">
                    {(msg.votes || []).length === 0 ? (
                      <li className="text-white/40 text-sm">{t('messages.noVotes')}</li>
                    ) : (
                      (msg.votes || []).map((vote) => (
                        <li
                          key={`${vote.txid || vote.cid}-${vote.direction}-${vote.time}`}
                          className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-3 mb-1">
                            <span className={`text-xs font-medium ${vote.direction === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                              {vote.direction === 'up' ? t('messages.upVote') : t('messages.downVote')}
                              {vote.free ? ` · ${t('messages.freeVote', { handle: shortNpub(vote.pubkey) })}` : ''}
                            </span>
                            <span className="text-white/40 text-xs">{formatTimestampToUTC(vote.time)}</span>
                          </div>
                          <a
                            href={vote.free ? gatewayUrl(vote.cid) : explorerTxUrl(vote.txid)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-white/80 hover:text-white break-all underline decoration-white/20 hover:decoration-white/60"
                          >
                            {vote.free ? vote.cid : vote.txid}
                          </a>
                        </li>
                      ))
                    )}
                  </ul>
                )}

                {openCommentLists.has(msg.index) && (
                  <div className="mt-3 space-y-3">
                    <ul className="space-y-2">
                      {(msg.comments || []).length === 0 ? (
                        <li className="text-white/40 text-sm">{t('messages.noComments')}</li>
                      ) : (
                        (msg.comments || []).map((comment) => (
                          <li
                            key={`${comment.txid || comment.cid}-${comment.time}`}
                            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start gap-2 flex-wrap">
                                  <a
                                    href={comment.free ? gatewayUrl(comment.cid) : explorerTxUrl(comment.txid)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={comment.free ? t('messages.freeComment', { handle: shortNpub(comment.pubkey) }) : t('messages.viewTx')}
                                    className="text-white text-sm hover:text-white/80 underline decoration-white/25 hover:decoration-white/60"
                                  >
                                    {comment.text}
                                  </a>
                                  {comment.unconfirmed ? (
                                    <span
                                      title={t('messages.unconfirmedHint')}
                                      className="shrink-0 inline-flex items-center rounded-full border border-red-400/45 bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300"
                                    >
                                      {t('messages.unconfirmed')}
                                    </span>
                                  ) : null}
                                </div>
                                <TranslateButton text={comment.text} className="mt-1" textClassName="text-white text-sm" />
                                {comment.unconfirmed ? (
                                  <p className="text-white/35 text-xs mt-1">
                                    {t('messages.unconfirmedDetail')}
                                  </p>
                                ) : null}
                              </div>
                              <span className="text-white/40 text-xs shrink-0 pt-0.5">{formatTimestampToUTC(comment.time)}</span>
                            </div>
                          </li>
                        ))
                      )}
                    </ul>

                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={commentDrafts[msg.index] || ''}
                          maxLength={REPLY_MAX}
                          onChange={(event) =>
                            setCommentDrafts((prev) => ({
                              ...prev,
                              [msg.index]: event.target.value.slice(0, REPLY_MAX),
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleComment(msg.index);
                            }
                          }}
                          placeholder={t('messages.commentPlaceholder')}
                          disabled={commentingIndex === msg.index}
                          className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-[color:var(--theme-inset-border)] bg-[color:var(--theme-inset-bg)] text-white text-sm placeholder-white/40 focus:outline-none focus:border-[color:var(--theme-card-border)] disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={() => handleComment(msg.index)}
                          disabled={
                            commentingIndex === msg.index ||
                            !(commentDrafts[msg.index] || '').trim()
                          }
                          title={t('messages.commentSend')}
                          className={`shrink-0 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                            commentingIndex === msg.index ||
                            !(commentDrafts[msg.index] || '').trim()
                              ? 'bg-gray-500/20 text-gray-400 border-white/10 cursor-not-allowed'
                              : 'bg-white/10 text-white border-white/10 hover:bg-white/20'
                          }`}
                        >
                          {commentingIndex === msg.index ? t('messages.commentSending') : t('messages.commentSend')}
                        </button>
                      </div>
                      <div className="flex justify-end">
                        <span
                          className={`text-xs tabular-nums ${
                            REPLY_MAX - (commentDrafts[msg.index] || '').length < 10
                              ? 'text-red-400'
                              : 'text-white/45'
                          }`}
                        >
                          {t('messages.commentLimit', {
                            remaining: REPLY_MAX - (commentDrafts[msg.index] || '').length,
                            max: REPLY_MAX,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </GlassCard> }
          </motion.div>
          );
        })}
      </ul>
      {hasMore ? (
        <button
          type="button"
          ref={sentinelRef}
          onClick={loadMore}
          className="flex items-center justify-center gap-2 py-4 text-white/50 hover:text-white/80 transition-colors"
        >
          <Loader2 className="w-4 h-4 text-[color:var(--theme-accent)] animate-spin" />
          <span className="text-sm">{t('messages.loadingMore')}</span>
        </button>
      ) : null}
      </div>
      )}

    </GlassCard> }
    </motion.div>
  );
}