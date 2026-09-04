
import React, { useEffect, useState } from 'react';
import { Activity } from "lucide-react";
import TextInput from '../components/TextInput';
import EmbedButton from '../components/EmbedButton';
import * as ecc from 'tiny-secp256k1';
import ECPairFactory from 'ecpair';
import * as bitcoin from 'bitcoinjs-lib';
import { SharedContext } from '../src/SharedContext';
import { useContext } from 'react';

export default function Introduction() {

  return (
    <div>
<div className="flex items-center justify-center gap-3 mb-6 text-center">
        <h1><strong>Bitcoin</strong> is the most subtle form of <strong>Revolution</strong> ever created.</h1>
        </div>
        <center>
            Raise your voice, make it matter and speak freely on the <strong>Bitcoin Decentralized Network.</strong>
        </center>
    </div>
  );
}
