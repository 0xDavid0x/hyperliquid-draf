'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

export function Header() {
  const { isConnected, address } = useAccount();

  return (
    <header className="w-full bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 shadow-lg">
      <div className="max-w-full mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-sm">H</span>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              Hyperliquid Trading
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <ConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
}

