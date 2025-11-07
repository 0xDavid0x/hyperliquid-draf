'use client';

import { useState, useEffect, useRef } from 'react';
import { Hyperliquid } from 'hyperliquid';
import { SkeletonText, SkeletonBox } from './Skeleton';
interface RightPanelProps {
  walletAddress?: string;
  coin: string;
  sdk: Hyperliquid | null;
}

interface OrderLevel {
  px: string;
  sz: string;
  n: number;
}

interface WsBook {
  coin: string;
  levels: [OrderLevel[], OrderLevel[]];
}

interface WsTrade {
  coin: string;
  side: string;
  px: string;
  sz: string;
  hash: string;
  time: number;
  tid: number;
}

export function RightPanel({ walletAddress, coin, sdk }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<'orderbook' | 'trades'>('orderbook');
  const [orderbook, setOrderbook] = useState<WsBook | null>(null);
  const [trades, setTrades] = useState<WsTrade[]>([]);
  const [spread, setSpread] = useState<{ bid: number; ask: number; spread: number; spreadPercent: number } | null>(null);
  
  const subscribedCoinRef = useRef<string | null>(null);

  // Subscribe to orderbook and trades for current coin
  useEffect(() => {
    if (!sdk || !coin || !sdk.subscriptions) return;

    const coinSymbol = coin.includes('-USDC') ? coin.replace('-USDC', '-PERP') : coin;
    if (!coinSymbol.includes('-PERP')) return;

    // Skip if already subscribed to this exact coin
    if (subscribedCoinRef.current === coinSymbol) {
      return;
    }

    let isMounted = true;

    const subscribe = async () => {
      try {
        // Ensure SDK is initialized and WebSocket is connected
        await sdk.ensureInitialized();
        
        // Wait a bit for WebSocket to be ready if needed
        if (sdk.isWebSocketEnabled() && !sdk.isWebSocketConnected()) {
          // Wait for connection (max 3 seconds)
          let attempts = 0;
          while (!sdk.isWebSocketConnected() && attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
          }
        }

        // Unsubscribe from previous coin if exists
        if (subscribedCoinRef.current) {
          try {
            await sdk.subscriptions.unsubscribeFromL2Book(subscribedCoinRef.current);
            await sdk.subscriptions.unsubscribeFromTrades(subscribedCoinRef.current);
          } catch (e) {
            console.warn('Error unsubscribing from previous coin:', e);
          }
        }

        // Clear previous data
        if (isMounted) {
          setOrderbook(null);
          setSpread(null);
          setTrades([]);
        }

        // Subscribe to orderbook for this coin only
        const orderbookCallback = (data: WsBook & { coin: string }) => {
          if (!isMounted) return;
          
          setOrderbook(data);
          
          // Calculate spread
          if (data.levels[0].length > 0 && data.levels[1].length > 0) {
            const bestBid = parseFloat(data.levels[0][0].px);
            const bestAsk = parseFloat(data.levels[1][0].px);
            const spreadValue = bestAsk - bestBid;
            const spreadPercent = (spreadValue / bestBid) * 100;
            
            setSpread({
              bid: bestBid,
              ask: bestAsk,
              spread: spreadValue,
              spreadPercent,
            });
          }
        };

        // Subscribe to trades for this coin only
        const tradesCallback = (data: any) => {
          if (!isMounted) return;
          
          if (Array.isArray(data)) {
            // Keep last 50 trades
            setTrades(prev => {
              const newTrades = [...data, ...prev].slice(0, 50);
              return newTrades;
            });
          }
        };

        // Subscribe to this specific coin
        await sdk.subscriptions.subscribeToL2Book(coinSymbol, orderbookCallback);
        await sdk.subscriptions.subscribeToTrades(coinSymbol, tradesCallback);
        
        if (isMounted) {
          subscribedCoinRef.current = coinSymbol;
        }
      } catch (error) {
        console.error('Error subscribing to coin:', error);
        if (isMounted) {
          subscribedCoinRef.current = null;
        }
      }
    };

    subscribe();

    // Cleanup: unsubscribe when coin changes or component unmounts
    return () => {
      isMounted = false;
      if (sdk?.subscriptions && subscribedCoinRef.current) {
        sdk.subscriptions.unsubscribeFromL2Book(subscribedCoinRef.current).catch(() => {});
        sdk.subscriptions.unsubscribeFromTrades(subscribedCoinRef.current).catch(() => {});
        subscribedCoinRef.current = null;
      }
    };
  }, [sdk, coin]);

  const formatPrice = (price: string | number) => {
    const num = typeof price === 'string' ? parseFloat(price) : price;
    if (num >= 1000) {
      return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return num.toFixed(4);
  };

  const formatSize = (size: string | number) => {
    const num = typeof size === 'string' ? parseFloat(size) : size;
    if (num >= 1) {
      return num.toFixed(4);
    }
    return num.toFixed(8);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  // Show "Connect wallet" message if no wallet
  if (!walletAddress) {
    return (
      <div className="w-[300px] h-full flex flex-col border-r border-[#1b1b1b]">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center text-[#888]">
            <p className="mb-4">Connect wallet to start trading</p>
          </div>
        </div>
      </div>
    );
  }

  // Show skeleton if SDK is not ready but wallet is connected
  if (!sdk) {
    return (
      <div className="w-[300px] h-full flex flex-col bg-[#0C130F] border-r border-[#1b1b1b] flex-shrink-0">
        <div className="flex flex-col h-full min-h-0">
          {/* Tabs skeleton */}
          <div className="flex border-b border-[#1b1b1b]">
            <div className="flex-1 px-3 py-2">
              <SkeletonText width={80} height={16} />
            </div>
            <div className="flex-1 px-3 py-2">
              <SkeletonText width={60} height={16} />
            </div>
          </div>
          {/* Content skeleton */}
          <div className="flex-1 flex flex-col p-2 gap-1">
            {/* Orderbook skeleton */}
            <div className="flex-1 flex flex-col gap-0.5">
              {/* Asks skeleton */}
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={`ask-skeleton-${i}`} className="flex justify-between px-2 py-0.5">
                  <SkeletonText width={60} height={12} />
                  <SkeletonText width={50} height={12} />
                </div>
              ))}
              {/* Mid price skeleton */}
              <div className="px-2 py-1 my-1">
                <SkeletonText width={80} height={16} className="mx-auto" />
              </div>
              {/* Bids skeleton */}
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={`bid-skeleton-${i}`} className="flex justify-between px-2 py-0.5">
                  <SkeletonText width={60} height={12} />
                  <SkeletonText width={50} height={12} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[300px] h-full flex flex-col bg-[#0C130F] border-r border-[#1b1b1b] flex-shrink-0">
      {/* Orderbook/Trades/Orders Section - Full height */}
      <div className="flex flex-col h-full min-h-0">
        {/* Tabs */}
        <div className="flex border-b border-[#1b1b1b]">
          <button
            onClick={() => setActiveTab('orderbook')}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === 'orderbook'
                ? 'text-[#c0c0c0] border-b-2 border-[#03c987] bg-[#0C130F]'
                : 'text-[#888] hover:text-[#c0c0c0]'
            }`}
          >
            Orderbook
          </button>
          <button
            onClick={() => setActiveTab('trades')}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === 'trades'
                ? 'text-[#c0c0c0] border-b-2 border-[#03c987] bg-[#0C130F]'
                : 'text-[#888] hover:text-[#c0c0c0]'
            }`}
          >
            Trades
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
        {activeTab === 'orderbook' && (
          <div className="flex flex-col h-full">
            {orderbook ? (
              <>
                {/* Spread Info */}
                {spread && (
                  <div className="p-2 border-b border-[#1b1b1b] bg-[#1b1b1b] text-xs">
                    <div className="flex justify-between text-[#888] mb-1">
                      <span>Spread</span>
                      <span className="text-[#c0c0c0]">{formatPrice(spread.spread)} ({spread.spreadPercent.toFixed(3)}%)</span>
                    </div>
                  </div>
                )}

                {/* Asks (Sell Orders) - Highest price at top */}
                <div className="flex-1 overflow-y-auto scrollbar-thin">
                  <div className="sticky top-0 bg-[#0C130F] px-2 py-1 border-b border-[#1b1b1b] z-10">
                    <div className="flex justify-between text-xs text-[#888] font-medium">
                      <span>Price</span>
                      <span>Size</span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    {orderbook.levels[1]?.slice(0, 15).reverse().map((ask, index) => {
                      const price = parseFloat(ask.px);
                      const size = parseFloat(ask.sz);
                      // Calculate cumulative size from top
                      const reversedAsks = orderbook.levels[1].slice(0, 15).reverse();
                      const totalSize = reversedAsks.slice(0, index + 1).reduce((sum, level) => sum + parseFloat(level.sz), 0);
                      const maxSize = reversedAsks.reduce((sum, level) => sum + parseFloat(level.sz), 0);
                      const widthPercent = maxSize > 0 ? (totalSize / maxSize) * 100 : 0;

                      return (
                        <div
                          key={`ask-${index}`}
                          className="relative px-2 py-0.5 hover:bg-[#1b1b1b] cursor-pointer group"
                        >
                          <div
                            className="absolute right-0 top-0 bottom-0 bg-red-900/20 opacity-30 group-hover:opacity-50"
                            style={{ width: `${widthPercent}%` }}
                          />
                          <div className="relative flex justify-between text-xs">
                            <span className="text-[#ff4d4f]">{formatPrice(price)}</span>
                            <span className="text-[#c0c0c0]">{formatSize(size)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Mid Price */}
                {spread && (
                  <div className="px-2 py-1 border-y border-[#1b1b1b] bg-[#1b1b1b]">
                    <div className="text-center text-sm font-bold text-[#c0c0c0]">
                      {formatPrice((spread.bid + spread.ask) / 2)}
                    </div>
                  </div>
                )}

                {/* Bids (Buy Orders) */}
                <div className="flex-1 overflow-y-auto scrollbar-thin">
                  <div className="flex flex-col">
                    {orderbook.levels[0]?.slice(0, 15).map((bid, index) => {
                      const price = parseFloat(bid.px);
                      const size = parseFloat(bid.sz);
                      const totalSize = orderbook.levels[0].slice(0, index + 1).reduce((sum, level) => sum + parseFloat(level.sz), 0);
                      const maxSize = orderbook.levels[0].slice(0, 15).reduce((sum, level) => sum + parseFloat(level.sz), 0);
                      const widthPercent = (totalSize / maxSize) * 100;

                      return (
                        <div
                          key={`bid-${index}`}
                          className="relative px-2 py-0.5 hover:bg-[#1b1b1b] cursor-pointer group"
                        >
                          <div
                            className="absolute left-0 top-0 bottom-0 bg-[#03c987]/20 opacity-30 group-hover:opacity-50"
                            style={{ width: `${widthPercent}%` }}
                          />
                          <div className="relative flex justify-between text-xs">
                            <span className="text-[#03c987]">{formatPrice(price)}</span>
                            <span className="text-[#c0c0c0]">{formatSize(size)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col p-2 gap-1">
                {/* Skeleton for orderbook */}
                <div className="flex-1 flex flex-col gap-0.5">
                  {/* Asks skeleton */}
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={`ask-skeleton-${i}`} className="flex justify-between px-2 py-0.5">
                      <SkeletonText width={60} height={12} />
                      <SkeletonText width={50} height={12} />
                    </div>
                  ))}
                  {/* Mid price skeleton */}
                  <div className="px-2 py-1 my-1">
                    <SkeletonText width={80} height={16} className="mx-auto" />
                  </div>
                  {/* Bids skeleton */}
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={`bid-skeleton-${i}`} className="flex justify-between px-2 py-0.5">
                      <SkeletonText width={60} height={12} />
                      <SkeletonText width={50} height={12} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'trades' && (
          <div className="flex flex-col h-full">
            <div className="sticky top-0 bg-[#0C130F] px-2 py-1 border-b border-[#1b1b1b]">
              <div className="flex justify-between text-xs text-[#888] font-medium">
                <span>Price</span>
                <span>Size</span>
                <span>Time</span>
              </div>
            </div>
            <div className="flex flex-col">
              {trades.length > 0 ? (
                trades.slice(0, 30).map((trade, index) => {
                  const price = parseFloat(trade.px);
                  const size = parseFloat(trade.sz);
                  const isBuy = trade.side === 'B';

                  return (
                    <div
                      key={`trade-${trade.hash}-${index}`}
                      className="flex justify-between items-center px-2 py-1 hover:bg-[#1b1b1b] text-xs border-b border-[#1b1b1b]"
                    >
                      <span className={isBuy ? 'text-[#03c987]' : 'text-[#ff4d4f]'}>
                        {formatPrice(price)}
                      </span>
                      <span className="text-[#c0c0c0]">{formatSize(size)}</span>
                      <span className="text-[#888]">{formatTime(trade.time)}</span>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-[#888]">
                  No trades yet
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>

    </div>
  );
}


