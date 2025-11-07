'use client';

import { useAccount } from 'wagmi';
import { useState } from 'react';
import { useHyperliquid } from './contexts/HyperliquidContext';
import { Header } from './components/Header';
import { PairInfoBar } from './components/PairInfoBar';
import { TokenSidebar } from './components/TokenSidebar';
import { RightPanel } from './components/RightPanel';
import { Trading } from './components/Trading';
import { Chart } from './components/Chart';
import { TabsSection } from './components/TabsSection';

export default function Home() {
  const { isConnected, address } = useAccount();
  const { readOnlySdk } = useHyperliquid();
  const [selectedCoin, setSelectedCoin] = useState<string>('BTC-PERP');

  return (
    <div className="min-h-screen flex flex-col bg-[#0C130F] text-[#c0c0c0] overflow-hidden">
        <Header />
        <PairInfoBar selectedCoin={selectedCoin} setSelectedCoin={setSelectedCoin} />
      
      {/* Main Layout - 4 sections: Sidebar | Chart+Tabs | Orderbook/Trades | Trading */}
      <main className="flex h-[calc(100vh-104px)] mt-[104px] bg-[#0C130F] overflow-hidden min-w-0">
        {/* Left Sidebar - Token list (80px) */}
        <div className="flex-shrink-0 h-full">
          <TokenSidebar selectedCoin={selectedCoin} setSelectedCoin={setSelectedCoin} sdk={readOnlySdk} />
        </div>
        
        {/* Center - Chart + Tabs (flex-1, co giãn) */}
        <div className="flex flex-col flex-1 min-w-0 border-x border-[#1b1b1b]">
          {/* Chart Section - Max width 876px, height 558px */}
          <div className="flex-shrink-0 border-b border-[#1b1b1b] min-h-[558px] " >
            <Chart 
              coin={selectedCoin} 
              walletAddress={isConnected && address ? address : undefined} 
            />
          </div>
          
          {/* Tabs Section - Co giãn theo tỷ lệ màn hình */}
           <TabsSection 
            walletAddress={isConnected && address ? address : undefined}
            selectedCoin={selectedCoin}
          />
        </div>
        
        {/* Right side - Orderbook/Trades/Orders + Trading Form */}
        <div className="flex flex-shrink-0 border-l border-[#1b1b1b]">
          {/* Right Panel - Orderbook + Trades + Orders (300px) */}
          <RightPanel 
            walletAddress={isConnected && address ? address : undefined} 
            coin={selectedCoin} 
            sdk={readOnlySdk} 
          />
          
          {/* Trading Form - Ngang hàng với RightPanel (300px) */}
          {isConnected && address ? (
            <div className="w-[300px] h-full border-l border-[#1b1b1b] flex-shrink-0">
              <Trading walletAddress={address} coin={selectedCoin} />
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
