'use client';

import { useState, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { SendTokens } from './SendTokens';


export function Header() {
  const { isConnected, address } = useAccount();
  const [showSendTokens, setShowSendTokens] = useState(false);


  return (
    <>
      <header className="fixed top-0 left-0 w-full h-14 bg-[#0C130F] border-b border-[#1b1b1b] flex items-center justify-between px-6 z-50">
        {/* Left - Menu */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#1b1b1b] rounded-lg flex items-center justify-center">
              <span className="text-[#c0c0c0] font-bold text-sm">H</span>
            </div>
            <h1 className="text-lg font-bold text-[#c0c0c0]">Hyperliquid</h1>
          </div>
          <nav className="flex items-center gap-4 text-sm text-[#888]">
            <button className="hover:text-[#c0c0c0] transition-colors">Swap</button>
            <button className="text-[#c0c0c0] font-medium">Perpetuals</button>
            <button className="hover:text-[#c0c0c0] transition-colors">LaunchPad</button>
            <button className="hover:text-[#c0c0c0] transition-colors">Rewards</button>
            <button className="hover:text-[#c0c0c0] transition-colors flex items-center gap-1">
              More
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </nav>
        </div>


        {/* Right - Wallet + Settings */}
        <div className="flex items-center gap-4">
          {isConnected && address && (
            <button
              onClick={() => setShowSendTokens(true)}
              className="px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1b1b1b] rounded transition-colors border border-[#1b1b1b] hover:border-[#03c987] !bg-[#03c987]"
            >
              Send Token
            </button>
          )}
          <ConnectButton />
          <button className="p-2 text-[#888] hover:text-[#c0c0c0] hover:bg-[#1b1b1b] rounded transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>
      
      {/* SendTokens Modal - Centered on screen */}
      {showSendTokens && isConnected && address && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-[100] backdrop-blur-sm" 
            onClick={() => setShowSendTokens(false)} 
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-full max-w-md max-h-[85vh] overflow-y-auto bg-[#0C130F] rounded-xl shadow-2xl border border-[#1b1b1b] p-6">
            <div className="flex justify-between items-center mb-4 sticky top-0 bg-[#0C130F] pb-3 border-b border-[#1b1b1b]">
              <h2 className="text-lg font-bold text-[#c0c0c0]">Send Tokens</h2>
              <button
                onClick={() => setShowSendTokens(false)}
                className="text-[#888] hover:text-[#c0c0c0] transition-colors p-1 hover:bg-[#1b1b1b] rounded"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <SendTokens walletAddress={address} />
          </div>
        </>
      )}
    </>
  );
}

