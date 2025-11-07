'use client';

import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';
import { Hyperliquid } from 'hyperliquid';
import { Header } from './components/Header';
import { SidebarMenu } from './components/SidebarMenu';
import { Trading } from './components/Trading';
import { Chart } from './components/Chart';

const TESTNET = true;

export default function Home() {
  const { isConnected, address } = useAccount();
  const [sdk, setSdk] = useState<Hyperliquid | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<'chart' | 'menu'>('chart');
  const [selectedCoin, setSelectedCoin] = useState<string>('BTC-PERP');

  // Initialize SDK
  useEffect(() => {
    if (!address) return;

    const initializeSDK = async () => {
      try {
        const hyperliquid = new Hyperliquid({
          testnet: TESTNET,
          enableWs: false,
          walletAddress: address,
        });

        await hyperliquid.connect();
        await hyperliquid.ensureInitialized();
        setSdk(hyperliquid);
      } catch (error) {
        console.error('Error initializing SDK:', error);
      }
    };

    initializeSDK();
  }, [address]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 via-purple-50/30 to-blue-50/30 dark:from-gray-900 dark:via-purple-900/20 dark:to-blue-900/20">
      <Header selectedCoin={selectedCoin} setSelectedCoin={setSelectedCoin} sdk={sdk} />
      
      <div className="flex-1 flex gap-4 p-4">
        {/* Trading Component - Left side, fixed width */}
        {isConnected && address ? (
          <div className="w-1/4 min-w-[320px]">
            <Trading walletAddress={address} coin={selectedCoin} />
          </div>
        ) : (
          <div className="w-1/4 min-w-[320px] flex items-center justify-center bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200/50 dark:border-gray-700/50">
            <p className="text-gray-500 dark:text-gray-400 text-center px-4">
              Please connect your wallet to start trading
            </p>
          </div>
        )}
        
        {/* Right Panel - Chart and SidebarMenu */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Tab Selector */}
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setRightPanelTab('chart')}
              className={`px-4 py-2 font-semibold text-sm transition-all duration-200 rounded-lg ${
                rightPanelTab === 'chart'
                  ? 'bg-[#00C4B4] hover:bg-[#00B8A8] text-white shadow-lg'
                  : 'bg-white/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'
              }`}
            >
              Chart
            </button>
            {isConnected && address && sdk && (
              <button
                onClick={() => setRightPanelTab('menu')}
                className={`px-4 py-2 font-semibold text-sm transition-all duration-200 rounded-lg ${
                  rightPanelTab === 'menu'
                    ? 'bg-[#00C4B4] hover:bg-[#00B8A8] text-white shadow-lg'
                    : 'bg-white/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'
                }`}
              >
                Menu
              </button>
            )}
          </div>
          
          {/* Tab Content */}
          <div className="flex-1 min-h-0">
            {rightPanelTab === 'chart' ? (
              <Chart coin={selectedCoin} sdk={sdk} />
            ) : (
              isConnected && address && sdk && <SidebarMenu walletAddress={address} sdk={sdk} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
