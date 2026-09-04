// Compose.jsx
import React, { useEffect, useState, useContext } from 'react';
import { Activity } from "lucide-react";
import TextInput from '../components/TextInput';
import EmbedButton from '../components/EmbedButton';
import { SharedContext } from '../src/SharedContext';
import { sendBitcoinTransaction, validateUTXO } from '../services/bitcoinService';

export default function Compose() {
  const [message, setMessage] = useState("");
  const [fee, setFee] = useState(null);
  const { refs, setRefs } = useContext(SharedContext);
  const { currentIndex, setCurrentIndex } = useContext(SharedContext);

  const [isLoading, setIsLoading] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [transactionID, setTransactionID] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setFee(450);
  }, []);

  const handleSubmit = async () => {
    if (!message.trim()) {
      setError("Please enter a message");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const currentUTXO = refs[currentIndex];
      
      // Validate UTXO before proceeding
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
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Activity className="w-6 h-6 text-blue-400" />
        <h2 className="text-2xl font-bold text-white">Speak about your truth</h2>
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
          <span className="font-bold">Error:</span> {error}
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <EmbedButton
          onClick={handleSubmit}
          disabled={isDisabled || !message.trim()}
          isLoading={isLoading}
        />
      </div>

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
                Your voice matters.<br />Don't Trust. Verify.
              </a>
            </center>
          </span>
        </div>
      )}
    </div>
  );
}