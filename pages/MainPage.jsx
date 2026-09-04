import React, { useEffect, useState } from 'react';
import Header from '../components/Header';
import LatestMessagesBlocks from '../components/LatestMessagesBlocks';

import SPEAK from '../components/SPEAK';

function MainPage() {

  return (
    <>
      <div>
      <div className="h-screen bg-[radial-gradient(circle_at_center,_#3a5ca7_10%,_#1e2a4a_100%,_#0c0f1a_120%)] text-white relative overflow-x-hidden overflow-y-auto pb-50">
        <Header/>
        <SPEAK/>
        <LatestMessagesBlocks/>
      </div>
    </div>
    </>
  )
}

export default MainPage
