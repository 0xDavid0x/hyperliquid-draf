'use client';

import { useState } from 'react';
import { LongBTCButton } from './LongBTCButton';
import { SendTokens } from './SendTokens';

interface TradingProps {
  walletAddress: string;
}

export function Trading({ walletAddress }: TradingProps) {
  const [activeTab, setActiveTab] = useState<'trade' | 'send'>('trade');

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden flex flex-col flex-1">
        {/* Tabs */}
        <div className="flex gap-1 p-2 bg-gradient-to-r from-gray-50 to-purple-50/50 dark:from-gray-800 dark:to-purple-900/30 border-b border-gray-200/50 dark:border-gray-700/50">
          <button
            onClick={() => setActiveTab('trade')}
            className={`flex-1 px-4 py-3 font-semibold text-sm transition-all duration-200 rounded-lg relative ${
              activeTab === 'trade'
                ? 'text-white bg-gradient-to-r from-purple-600 to-blue-600 shadow-lg shadow-purple-500/30 scale-105'
                : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-700/50 hover:text-purple-600 dark:hover:text-purple-400'
            }`}
          >
            <span className="relative z-10">Trade</span>
            {activeTab === 'trade' && (
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20 blur-xl"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('send')}
            className={`flex-1 px-4 py-3 font-semibold text-sm transition-all duration-200 rounded-lg relative ${
              activeTab === 'send'
                ? 'text-white bg-gradient-to-r from-purple-600 to-blue-600 shadow-lg shadow-purple-500/30 scale-105'
                : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-700/50 hover:text-purple-600 dark:hover:text-purple-400'
            }`}
          >
            <span className="relative z-10">Send Tokens</span>
            {activeTab === 'send' && (
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20 blur-xl"></div>
            )}
          </button>
        </div>
        
        {/* Tab Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'trade' && <LongBTCButton walletAddress={walletAddress} />}
          {activeTab === 'send' && <SendTokens walletAddress={walletAddress} />}
        </div>
      </div>
    </div>
  );
}


