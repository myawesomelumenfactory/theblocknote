// pages/HomePage.js
import Header from '../components/Header';
import QRCode from "react-qr-code";
import React, { useEffect, useState } from 'react';

import * as bitcoin from "bitcoinjs-lib";
import * as ecc from 'tiny-secp256k1';
import ECPairFactory from 'ecpair';
import { Buffer } from 'buffer'; // Needed in React
import { SharedContext } from '../src/SharedContext';
import { useContext } from 'react';

import Load from '../components/Load';

const PowerPage = () => {
  const ECPair = ECPairFactory(ecc);

  const network = bitcoin.networks.bitcoin; // mainnet
  const keyPair = ECPair.makeRandom({network});

  const pubkey = Buffer.from(keyPair.publicKey);
  const privKey = keyPair.toWIF();

  const { address } = bitcoin.payments.p2pkh({
    pubkey,
    network: bitcoin.networks.bitcoin,
  });

  // Load localStorage or initialize
  let keyPairs = JSON.parse(localStorage.getItem('keyPairs'));
  if (!keyPairs) {
    keyPairs = {};
  }

  // Store new key pair
  keyPairs[address] = privKey;

  // Save updated object to localStorage
  localStorage.setItem('keyPairs', JSON.stringify(keyPairs));

  return (
    <>
        <Header/>
        <Load />
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',  // centers horizontally
            alignItems: 'center',      // centers vertically
            height: '50vh',            // adjust height as needed
            // Optionally add some margin or padding
          }}
        >
      </div>
    </>
  )
};

export default PowerPage;