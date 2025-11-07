'use client';

import { useState, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { SendTokens } from './SendTokens';
import { Hyperliquid } from 'hyperliquid';

interface HeaderProps {
  selectedCoin: string;
  setSelectedCoin: (coin: string) => void;
  sdk: Hyperliquid | null;
}

export function Header({ selectedCoin, setSelectedCoin, sdk }: HeaderProps) {
  const { isConnected, address } = useAccount();
  const [showSendTokens, setShowSendTokens] = useState(false);
  const [showCoinSelector, setShowCoinSelector] = useState(false);
  const [availableCoins, setAvailableCoins] = useState<string[]>([]);
  const [loadingCoins, setLoadingCoins] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [coinData, setCoinData] = useState<Record<string, {
    price: number;
    maxLeverage: number;
    change24h: number;
  }>>({});

  // Fetch available coins list only (no 24h data yet)
  useEffect(() => {
    const fetchAvailableCoins = async () => {
      if (!sdk) return;
      
      setLoadingCoins(true);
      try {
        // Use SDK to get all perp assets
        const allAssets = await sdk.info.getAllAssets();
        
        // Get perp coins list
        const perpCoinNames = allAssets.perp || [];
        
        // Convert to full coin names with -PERP suffix
        const perpPairs = perpCoinNames.map((name: string) => 
          name.includes('-PERP') ? name : `${name}-PERP`
        ).sort();
        
        setAvailableCoins(perpPairs);
        
        // Get current prices and max leverage
        const allMids = await sdk.info.getAllMids();
        const [meta] = await sdk.info.perpetuals.getMetaAndAssetCtxs();
        
        const data: Record<string, {
          price: number;
          maxLeverage: number;
          change24h: number;
        }> = {};
        
        // Fetch max leverage for each coin using assetIndex (same method as Trading.tsx)
        for (const coin of perpPairs) {
          const currentPrice = allMids[coin] || allMids[coin.replace('-PERP', '')] || 0;
          
          let maxLeverage = 1;
          try {
            const assetIndex = await sdk.symbolConversion.getAssetIndex(coin);
            if (assetIndex !== undefined && meta.universe[assetIndex]) {
              maxLeverage = meta.universe[assetIndex].maxLeverage;
            }
          } catch (error) {
            console.error(`Error fetching maxLeverage for ${coin}:`, error);
          }
          
          data[coin] = {
            price: typeof currentPrice === 'number' ? currentPrice : parseFloat(String(currentPrice)),
            maxLeverage,
            change24h: 0, // Will be fetched when dropdown opens
          };
        }
        
        setCoinData(data);
      } catch (error) {
        console.error('Error fetching available coins:', error);
      } finally {
        setLoadingCoins(false);
      }
    };

    if (sdk) {
      fetchAvailableCoins();
    }
  }, [sdk]);


  return (
    <>
      <header className="relative z-50 w-full bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 shadow-lg">
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
              {/* Coin Selector */}
              <div className="relative">
                <button
                  onClick={() => setShowCoinSelector(!showCoinSelector)}
                  className="px-4 py-2 bg-[#00C4B4] hover:bg-[#00B8A8] text-white font-semibold rounded-lg shadow-lg transition-all duration-200 text-sm flex items-center gap-2"
                >
                  <span>{selectedCoin.replace('-PERP', '-USDC')}</span>
                  <svg 
                    className={`w-4 h-4 transition-transform ${showCoinSelector ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {/* Coin Selector Dropdown */}
                {showCoinSelector && (
                  <>
                    <div 
                      className="fixed inset-0 bg-black/20 z-40" 
                      onClick={() => setShowCoinSelector(false)} 
                    />
                    <div className="absolute top-full right-0 mt-2 z-50 w-[700px] max-h-[600px] overflow-y-auto bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700">
                      <div className="p-3 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
                        <div className="flex justify-between items-center">
                          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Select Trading Pair</h3>
                          <button
                            onClick={() => {
                              setShowCoinSelector(false);
                              setSearchQuery('');
                            }}
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Search..."
                          value={searchQuery}
                          className="w-full mt-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#00C4B4] focus:border-transparent"
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                      <div className="p-2">
                        {loadingCoins ? (
                          <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
                            Loading...
                          </div>
                        ) : availableCoins.length === 0 ? (
                          <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
                            No trading pairs available
                          </div>
                        ) : (
                          <div className="space-y-1 max-h-[500px] overflow-y-auto">
                            {/* Table Header */}
                            <div className="grid grid-cols-10 gap-2 px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
                              <div className="col-span-3">Pair</div>
                              <div className="col-span-2 text-right">Price</div>
                              <div className="col-span-2 text-right">24h Change</div>
                              <div className="col-span-2 text-right">Max Leverage</div>
                              <div className="col-span-1"></div>
                            </div>
                            {availableCoins
                              .filter((coin) => 
                                coin.toLowerCase().includes(searchQuery.toLowerCase())
                              )
                              .map((coin) => {
                                const data = coinData[coin];
                                const change = data?.change24h || 0;
                                const isPositive = change >= 0;
                                
                                return (
                                  <button
                                    key={coin}
                                    onClick={() => {
                                      setSelectedCoin(coin);
                                      setShowCoinSelector(false);
                                      setSearchQuery('');
                                    }}
                                    className={`w-full grid grid-cols-10 gap-2 px-3 py-2 rounded-lg text-xs transition-all hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                                      selectedCoin === coin
                                        ? 'bg-[#00C4B4]/10 border border-[#00C4B4]'
                                        : ''
                                    }`}
                                  >
                                    <div className={`col-span-3 font-semibold text-left ${
                                      selectedCoin === coin
                                        ? 'text-[#00C4B4]'
                                        : 'text-gray-900 dark:text-gray-100'
                                    }`}>
                                      {coin.replace('-PERP', '-USDC')}
                                    </div>
                                    <div className="col-span-2 text-right text-gray-700 dark:text-gray-300">
                                      {data?.price ? `$${data.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                    </div>
                                    <div className={`col-span-2 text-right font-medium ${
                                      isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                    }`}>
                                      {data?.change24h !== undefined ? `${isPositive ? '+' : ''}${data.change24h.toFixed(2)}%` : '-'}
                                    </div>
                                    <div className="col-span-2 text-right text-gray-700 dark:text-gray-300">
                                      {data?.maxLeverage ? `${data.maxLeverage}x` : '-'}
                                    </div>
                                    <div className="col-span-1 flex items-center justify-end">
                                      {selectedCoin === coin && (
                                        <div className="w-2 h-2 rounded-full bg-[#00C4B4]"></div>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
              {isConnected && address && (
                <button
                  onClick={() => setShowSendTokens(!showSendTokens)}
                  className="px-4 py-2 bg-[#00C4B4] hover:bg-[#00B8A8] text-white font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 text-sm"
                >
                  Send Tokens
                </button>
              )}
              <ConnectButton />
            </div>
          </div>
        </div>
      </header>
      
      {/* SendTokens Modal - Outside header to avoid z-index issues */}
      {showSendTokens && isConnected && address && (
        <>
          <div 
            className="fixed inset-0 bg-black/30 z-[100] backdrop-blur-sm" 
            onClick={() => setShowSendTokens(false)} 
          />
          <div className="fixed top-20 right-6 z-[101] w-96 max-h-[80vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex justify-between items-center mb-4 sticky top-0 bg-white dark:bg-gray-800 pb-2 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Send Tokens</h2>
              <button
                onClick={() => setShowSendTokens(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
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

