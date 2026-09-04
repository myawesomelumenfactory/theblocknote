import React, { useEffect, useState, useContext } from 'react';
import { motion } from "framer-motion";
import GlassCard from "./GlassCard";
import { decodeOpReturn } from '../services/TheBlockNote';
import { Activity, ChevronUp, ChevronDown } from "lucide-react";
import { applyVoteUp, applyVoteDown } from '../services/BitcoinService';
import { SharedContext } from '../src/SharedContext';

export default function LatestMessagesBlocks() {

  const [messages, setMessages] = useState([]);
  const [opReturns, setOpReturns] = useState([]);
  const [theblocknote, setTheBlockNote] = useState([]);
  const [txids, setTxids] = useState([]);
  const [votedMessages, setVotedMessages] = useState(new Set()); // Track voted messages
  const { refs, setRefs } = useContext(SharedContext);
  const { currentIndex, setCurrentIndex } = useContext(SharedContext);

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

  // Handle vote up
  const handleVoteUp = async (messageIndex) => {
    setTheBlockNote(prev => 
      prev.map((msg, idx) => 
        idx === messageIndex 
          ? { ...msg, ups: msg.ups + 1 }
          : msg
      )
    );
    setVotedMessages(prev => new Set([...prev, `${messageIndex}-up`]));

    const parts = messageIndex.split("_"); 
    var hash = parts[0];
    var index = parts[1];

    const currentUTXO = refs[currentIndex];

    // Send the transaction for voting up
    const result = await applyVoteUp(currentUTXO, hash, index, 450);

    if (result.success) {
      console.log(`Transaction successful! View at: ${result.explorerUrl}`);
    }

    // Here you would typically send the vote to your backend/blockchain
    console.log(`Voted up message at index ${messageIndex}`);
  };

  // Handle vote down
  const handleVoteDown = async (messageIndex) => {
    setTheBlockNote(prev => 
      prev.map((msg, idx) => 
        idx === messageIndex 
          ? { ...msg, downs: msg.downs + 1 }
          : msg
      )
    );
    setVotedMessages(prev => new Set([...prev, `${messageIndex}-down`]));

    const parts = messageIndex.split("_"); 
    var hash = parts[0];
    var index = parts[1];

    const currentUTXO = refs[currentIndex];

    // Send the transaction for voting down
    const result = await applyVoteDown(currentUTXO, hash, index, 450);

    if (result.success) {
      console.log(`Transaction successful! View at: ${result.explorerUrl}`);
    }

    // Here you would typically send the vote to your backend/blockchain
    console.log(`Voted down message at index ${messageIndex}`);
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
            "ups": 0
          });
       }

        if ( type == -1 ) {
          var hash = parts[3];
          var index = parts[4];
          downs.push({
            "time": m.time,
            "hash": hash,
            "index": parseInt(index)
          });
        }

        if ( type == 1 ) {
          var hash = parts[3];
          var index = parts[4];
          ups.push({
            "time": m.time,
            "hash": hash,
            "index": parseInt(index)
          });
        }
      }

    });

    // Processing donws votes
    theblocknote.forEach(m => {
      const parts = m.index.split("_"); 
      var hash = parts[0];
      var index = parts[1];

      downs.forEach(down => {
        if ( down.hash === hash && down.index == index ) {
          m.downs++;
        }
      });

      ups.forEach(up => {
        if ( up.hash === hash && up.index == index ) {
          m.ups++;
        }
      });
    })

    theblocknote.sort((a, b) => b.time - a.time);
    setTheBlockNote(theblocknote);
    } catch (error) {
      console.error('Failed to load immutables.json', error);
    }
  }

  const fetchMessages = async() => {

    var immutables = [];
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const res = await fetch(`${import.meta.env.BASE_URL}data/immutables.json`);
    if (!res.ok) throw new Error('Failed to load input file');
    const data = await res.json();

    // Process each TX sequentially with delay
    for (let i = 0; i < data.length ; i++) {

      immutables.push(data[i]);
    }

    return immutables;
  }

  useEffect(() => {
    fetchTheBlockNote();
  }, []);

  return (
    <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ 
        delay: 2,
        duration: 3.2,
        ease: [0.4, 0, 0.2, 1] // Custom cubic-bezier for smooth, natural motion
        }}
        className="glass-card rounded-2xl p-6"
    >
    {<GlassCard className="p-8 mb-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
          <Activity className="w-6 h-6 text-blue-400" />
          <h2 className="text-2xl font-bold text-white">Latest Messages</h2>
      </div>

      <ul>
        {theblocknote.map((t, index) => (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ 
            delay: 2,
            duration: 3.2,
            ease: [0.4, 0, 0.2, 1] // Custom cubic-bezier for smooth, natural motion
          }}
          className="glass-card rounded-2xl p-6"
          key={t.index}
          >
          {<GlassCard className="p-8 mb-8 max-w-5xl mx-auto">
            <div className="space-y-4">
              {/* Message Content */}
              <div>
                <p className="text-white text-lg mb-2">{t.value}</p>
                <p className="text-white/30 text-sm">{formatTimestampToUTC(t.time)}</p>
              </div>
              
              {/* Voting Controls at Bottom */}
              <div className="flex items-center justify-center gap-4 pt-4 border-t border-white/10">
                {/* Vote Up Button */}
                <button
                  onClick={() => handleVoteUp(t.index)}
                  disabled={votedMessages.has(`${index}-up`) || votedMessages.has(`${index}-down`)}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200
                    ${votedMessages.has(`${index}-up`)
                      ? 'bg-green-500/30 text-green-400 cursor-not-allowed'
                      : votedMessages.has(`${index}-down`)
                      ? 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
                      : 'bg-white/10 text-white hover:bg-green-500/20 hover:text-green-400 hover:scale-105'
                    }
                  `}
                >
                  <ChevronUp className="w-4 h-4" />
                  <span className="text-sm font-medium">{t.ups}</span>
                </button>
                
                {/* Vote Down Button */}
                <button
                  onClick={() => handleVoteDown(t.index)}
                  disabled={votedMessages.has(`${index}-up`) || votedMessages.has(`${index}-down`)}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200
                    ${votedMessages.has(`${index}-down`)
                      ? 'bg-red-500/30 text-red-400 cursor-not-allowed'
                      : votedMessages.has(`${index}-up`)
                      ? 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
                      : 'bg-white/10 text-white hover:bg-red-500/20 hover:text-red-400 hover:scale-105'
                    }
                  `}
                >
                  <ChevronDown className="w-4 h-4" />
                  <span className="text-sm font-medium">{t.downs}</span>
                </button>
              </div>
            </div>
          </GlassCard> }
          </motion.div>
        ))}
      </ul>

    </GlassCard> }
    </motion.div>
  );
}