'use client';

import { useState, useEffect, useMemo } from 'react';
import { useHyperliquid } from '../contexts/HyperliquidContext';
import { SkeletonTableRow } from './Skeleton';
import {
  useClearinghouseState,
  useUserOpenOrders,
  useUserTwapSliceFills,
  useUserFillsByTime,
  useUserFunding,
  useHistoricalOrders,
  useInvalidateHyperliquidQueries,
} from '../hooks/useHyperliquidQueries';

interface TabsSectionProps {
  walletAddress?: string;
  selectedCoin: string;
}

interface Position {
  coin: string;
  size: string;
  entryPx: string;
  unrealizedPnl: string;
  leverage?: { value: number };
  marginUsed?: string;
  roe?: number;
}

interface OpenOrder {
  coin?: string;
  side?: string;
  sz?: string;
  limitPx?: string;
  orderType?: string;
  oid?: number;
  timestamp?: number;
}

interface TradeFill {
  coin?: string;
  side?: string;
  px?: string;
  sz?: string;
  time?: number;
  closedPnl?: string;
  oid?: number;
  hash?: string;
}

interface TwapFill {
  coin?: string;
  side?: string;
  px?: string;
  sz?: string;
  time?: number;
  twapId?: number;
  sliceId?: number;
}

interface FundingEntry {
  coin?: string;
  funding?: string;
  time?: number;
  hash?: string;
}

interface HistoricalOrder {
  order?: {
    coin?: string;
    side?: string;
    sz?: string;
    limitPx?: string;
    orderType?: string;
  };
  status?: string;
  statusTimestamp?: number;
  oid?: number;
}

function getAgentFromStorage(walletAddress: string): { privateKey: string; userAddress: string } | null {
  if (typeof window === 'undefined') return null;
  const key = `hyperliquid_agent_${walletAddress}`;
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function TabsSection({ walletAddress, selectedCoin }: TabsSectionProps) {
  const { readOnlySdk, getTradingSdk } = useHyperliquid();
  const [activeTab, setActiveTab] = useState<'positions' | 'openOrders' | 'twap' | 'tradeHistory' | 'fundingHistory' | 'orderHistory'>('positions');
  
  // React Query hooks
  const { data: clearinghouseState, isLoading: isLoadingPositions } = useClearinghouseState(
    walletAddress,
    activeTab === 'positions'
  );
  const { data: openOrdersData, isLoading: isLoadingOpenOrders } = useUserOpenOrders(
    walletAddress,
    activeTab === 'openOrders'
  );
  const { data: twapFillsData, isLoading: isLoadingTwap } = useUserTwapSliceFills(
    walletAddress,
    activeTab === 'twap'
  );
  
  const now = Date.now();
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
  const { data: tradeHistoryData, isLoading: isLoadingTradeHistory } = useUserFillsByTime(
    walletAddress,
    sevenDaysAgo,
    now,
    activeTab === 'tradeHistory'
  );
  
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
  const { data: fundingData, isLoading: isLoadingFunding } = useUserFunding(
    walletAddress,
    thirtyDaysAgo,
    now,
    activeTab === 'fundingHistory'
  );
  
  const { data: orderHistoryData, isLoading: isLoadingOrderHistory } = useHistoricalOrders(
    walletAddress,
    activeTab === 'orderHistory'
  );
  
  const { invalidateClearinghouseState, invalidateUserOpenOrders } = useInvalidateHyperliquidQueries();

  // Transform positions data
  const positions = useMemo(() => {
    if (!clearinghouseState?.assetPositions) return [];
    return clearinghouseState.assetPositions
      .filter((pos: any) => pos.position && parseFloat(pos.position.szi || '0') !== 0)
      .map((pos: any) => {
        const p = pos.position;
        const size = parseFloat(p.szi || '0');
        const entryPx = parseFloat(p.entryPx || '0');
        const unrealizedPnl = parseFloat(p.unrealizedPnl || '0');
        const marginUsed = parseFloat(p.marginUsed || '0');
        const roe = marginUsed > 0 ? (unrealizedPnl / marginUsed) * 100 : 0;

        return {
          coin: p.coin,
          size: size > 0 ? size.toFixed(4) : size.toFixed(4),
          entryPx: entryPx.toFixed(2),
          unrealizedPnl: unrealizedPnl.toFixed(2),
          leverage: p.leverage ? { value: p.leverage.value } : undefined,
          marginUsed: marginUsed.toFixed(2),
          roe: roe,
        };
      });
  }, [clearinghouseState]);

  // Transform and filter open orders
  const openOrders = useMemo(() => {
    if (!openOrdersData) return [];
    return selectedCoin
      ? openOrdersData.filter((order: any) => {
          const orderCoin = order.coin?.replace('-PERP', '') || '';
          const selected = selectedCoin.replace('-PERP', '');
          return orderCoin === selected;
        })
      : openOrdersData;
  }, [openOrdersData, selectedCoin]);

  // Transform and filter TWAP fills
  const twapFills = useMemo(() => {
    if (!twapFillsData || !Array.isArray(twapFillsData)) return [];
    const filtered = selectedCoin
      ? twapFillsData.filter((fill: any) => {
          const fillCoin = fill.coin?.replace('-PERP', '') || '';
          const selected = selectedCoin.replace('-PERP', '');
          return fillCoin === selected;
        })
      : twapFillsData;
    return filtered.slice(0, 50);
  }, [twapFillsData, selectedCoin]);

  // Transform and filter trade history
  const tradeHistory = useMemo(() => {
    if (!tradeHistoryData || !Array.isArray(tradeHistoryData)) return [];
    const filtered = selectedCoin
      ? tradeHistoryData.filter((fill: any) => {
          const fillCoin = fill.coin?.replace('-PERP', '') || '';
          const selected = selectedCoin.replace('-PERP', '');
          return fillCoin === selected;
        })
      : tradeHistoryData;
    return filtered.slice(0, 50);
  }, [tradeHistoryData, selectedCoin]);

  // Transform and filter funding history
  const fundingHistory = useMemo(() => {
    if (!fundingData || !Array.isArray(fundingData)) return [];
    const transformed = fundingData.map((entry: any) => ({
      coin: entry.delta?.coin,
      funding: entry.delta?.usdc,
      time: entry.time,
      hash: entry.hash,
    }));
    const filtered = selectedCoin
      ? transformed.filter((entry: any) => {
          const entryCoin = entry.coin?.replace('-PERP', '') || '';
          const selected = selectedCoin.replace('-PERP', '');
          return entryCoin === selected;
        })
      : transformed;
    return filtered.slice(0, 50);
  }, [fundingData, selectedCoin]);

  // Transform and filter order history
  const orderHistory = useMemo(() => {
    if (!orderHistoryData || !Array.isArray(orderHistoryData)) return [];
    const filtered = selectedCoin
      ? orderHistoryData.filter((order: any) => {
          const orderCoin = order.order?.coin?.replace('-PERP', '') || '';
          const selected = selectedCoin.replace('-PERP', '');
          return orderCoin === selected;
        })
      : orderHistoryData;
    return filtered.slice(0, 50);
  }, [orderHistoryData, selectedCoin]);

  // Calculate loading state based on active tab
  const loading = 
    (activeTab === 'positions' && isLoadingPositions) ||
    (activeTab === 'openOrders' && isLoadingOpenOrders) ||
    (activeTab === 'twap' && isLoadingTwap) ||
    (activeTab === 'tradeHistory' && isLoadingTradeHistory) ||
    (activeTab === 'fundingHistory' && isLoadingFunding) ||
    (activeTab === 'orderHistory' && isLoadingOrderHistory);
  const [closeAllMode, setCloseAllMode] = useState<'market' | 'limit'>('market');
  const [isClosingAll, setIsClosingAll] = useState(false);
  const [closeAllStatus, setCloseAllStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [closingPosition, setClosingPosition] = useState<string | null>(null);
  const [positionCloseMode, setPositionCloseMode] = useState<{ [coin: string]: 'market' | 'limit' }>({});

  const tabs = [
    { id: 'positions' as const, label: 'Positions' },
    { id: 'openOrders' as const, label: 'Open Orders' },
    { id: 'twap' as const, label: 'TWAP' },
    { id: 'tradeHistory' as const, label: 'Trade History' },
    { id: 'fundingHistory' as const, label: 'Funding History' },
    { id: 'orderHistory' as const, label: 'Order History' },
  ];

  // Note: Data fetching is now handled by React Query hooks above
  // Data is automatically refetched based on staleTime and refetchInterval settings

  const formatPrice = (price: string | number) => {
    const num = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(num)) return '0.00';
    if (num >= 1000) {
      return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return num.toFixed(2);
  };

  const formatSize = (size: string | number) => {
    const num = typeof size === 'string' ? parseFloat(size) : size;
    if (isNaN(num)) return '0.0000';
    if (num >= 1) {
      return num.toFixed(4);
    }
    return num.toFixed(8);
  };

  const formatTime = (timestamp: number | undefined) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Handle close single position
  const handleClosePosition = async (coin: string, positionSize: string) => {
    if (!walletAddress || !readOnlySdk) {
      return;
    }

    const agentInfo = getAgentFromStorage(walletAddress);
    if (!agentInfo || !agentInfo.privateKey) {
      setCloseAllStatus({
        type: 'error',
        message: 'Agent not approved. Please enable trading first.',
      });
      setTimeout(() => setCloseAllStatus(null), 5000);
      return;
    }

    const closeMode = positionCloseMode[coin] || 'market';
    setClosingPosition(coin);

    try {
      const tradingSdk = await getTradingSdk(agentInfo.privateKey, agentInfo.userAddress);
      const size = parseFloat(positionSize);
      const isBuy = size < 0; // If position is negative (short), we need to buy to close
      const closeSize = Math.abs(size);

      if (closeMode === 'market') {
        // Market close using custom.marketClose
        const result = await tradingSdk.custom.marketClose(coin, closeSize, undefined, 0.05);
        console.log(`Market close ${coin} result:`, result);

        // Invalidate queries to refresh data
        if (walletAddress) {
          invalidateClearinghouseState(walletAddress);
        }
      } else {
        // Limit close - place limit order with reduce_only
        const allMids = await readOnlySdk.info.getAllMids();
        const currentPrice = parseFloat(allMids[coin] || allMids[coin.replace('-PERP', '')] || '0');

        if (!currentPrice || currentPrice <= 0) {
          throw new Error(`Could not get price for ${coin}`);
        }

        const result = await tradingSdk.exchange.placeOrder({
          coin: coin,
          is_buy: isBuy,
          sz: closeSize,
          limit_px: currentPrice,
          order_type: { limit: { tif: 'Gtc' } },
          reduce_only: true,
        });

        console.log(`Limit close ${coin} result:`, result);

        // Invalidate queries to refresh data
        if (walletAddress) {
          invalidateClearinghouseState(walletAddress);
          invalidateUserOpenOrders(walletAddress);
        }
      }
    } catch (error: any) {
      console.error(`Error closing position ${coin}:`, error);
      setCloseAllStatus({
        type: 'error',
        message: `Failed to close ${coin}: ${error?.message || 'Unknown error'}`,
      });
      setTimeout(() => setCloseAllStatus(null), 5000);
    } finally {
      setClosingPosition(null);
    }
  };

  // Handle close all positions
  const handleCloseAllPositions = async () => {
    if (!walletAddress || !readOnlySdk || positions.length === 0) {
      setCloseAllStatus({
        type: 'error',
        message: 'No positions to close',
      });
      return;
    }

    const agentInfo = getAgentFromStorage(walletAddress);
    if (!agentInfo || !agentInfo.privateKey) {
      setCloseAllStatus({
        type: 'error',
        message: 'Agent not approved. Please enable trading first.',
      });
      return;
    }

    setIsClosingAll(true);
    setCloseAllStatus(null);

    try {
      const tradingSdk = await getTradingSdk(agentInfo.privateKey, agentInfo.userAddress);

      if (closeAllMode === 'market') {
        // Market close all positions
        const results = await tradingSdk.custom.closeAllPositions(0.05); // 5% slippage
        console.log('Close all positions (market) results:', results);
        
        setCloseAllStatus({
          type: 'success',
          message: `Successfully closed ${positions.length} position(s)`,
        });

        // Invalidate queries to refresh data
        if (walletAddress) {
          invalidateClearinghouseState(walletAddress);
          invalidateUserOpenOrders(walletAddress);
        }

        // Clear status message after 5 seconds
        setTimeout(() => {
          setCloseAllStatus(null);
        }, 5000);
      } else {
        // Limit close all positions - place limit orders with reduce_only
        const normalizedAddress = walletAddress.toLowerCase();
        const clearinghouseState = await readOnlySdk.info.perpetuals.getClearinghouseState(normalizedAddress);
        const allMids = await readOnlySdk.info.getAllMids();
        
        const closePromises: Promise<any>[] = [];

        for (const position of clearinghouseState.assetPositions || []) {
          const item = position.position;
          const positionSize = parseFloat(item.szi || '0');
          
          if (positionSize === 0) continue;

          const coinSymbol = item.coin;
          const currentPrice = parseFloat(allMids[coinSymbol] || allMids[coinSymbol.replace('-PERP', '')] || '0');
          
          if (!currentPrice || currentPrice <= 0) {
            console.warn(`Could not get price for ${coinSymbol}`);
            continue;
          }

          // Determine direction: if position is positive (long), we need to sell (is_buy = false)
          // If position is negative (short), we need to buy (is_buy = true)
          const isBuy = positionSize < 0;
          const closeSize = Math.abs(positionSize);

          // Use current market price for limit order
          const limitPrice = currentPrice;

          try {
            const orderPromise = tradingSdk.exchange.placeOrder({
              coin: coinSymbol,
              is_buy: isBuy,
              sz: closeSize,
              limit_px: limitPrice,
              order_type: { limit: { tif: 'Gtc' } },
              reduce_only: true,
            });
            closePromises.push(orderPromise);
          } catch (err) {
            console.error(`Error placing close order for ${coinSymbol}:`, err);
          }
        }

        const results = await Promise.allSettled(closePromises);
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        console.log('Close all positions (limit) results:', results);
        
        setCloseAllStatus({
          type: successful > 0 ? 'success' : 'error',
          message: `Placed ${successful} limit close order(s)${failed > 0 ? `, ${failed} failed` : ''}`,
        });

        // Invalidate queries to refresh data
        if (walletAddress) {
          invalidateClearinghouseState(walletAddress);
          invalidateUserOpenOrders(walletAddress);
        }

        // Clear status message after 5 seconds
        setTimeout(() => {
          setCloseAllStatus(null);
        }, 5000);
      }
    } catch (error: any) {
      console.error('Error closing all positions:', error);
      setCloseAllStatus({
        type: 'error',
        message: error?.message || 'Failed to close all positions. Please try again.',
      });
    } finally {
      setIsClosingAll(false);
    }
  };

  return (
    <div className="flex-[1] bg-[#0C130F] border-t border-[#1b1b1b] flex flex-col min-h-0">
      {/* Tabs */}
      <div className="flex border-b border-[#1b1b1b] overflow-x-auto scrollbar-thin">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'text-[#c0c0c0] border-b-2 border-[#03c987] bg-[#0C130F]'
                : 'text-[#888] hover:text-[#c0c0c0] hover:bg-[#0C130F]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto text-[#c0c0c0] text-sm scrollbar-thin">
        {!walletAddress ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-[#888]">
              <p>Connect wallet to view data</p>
            </div>
          </div>
        ) : loading ? (
          <div className="p-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1b1b1b] text-[#888]">
                    <th className="text-left py-2 px-2">Symbol</th>
                    <th className="text-right py-2 px-2">Size</th>
                    <th className="text-right py-2 px-2">Entry</th>
                    <th className="text-right py-2 px-2">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonTableRow key={i} cols={4} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            {/* Positions Tab */}
            {activeTab === 'positions' && (
              <div className="p-3 flex flex-col h-full">
                {/* Close All Controls */}
                {positions.length > 0 && (
                  <div className="mb-3 flex items-center gap-2 pb-3 border-b border-[#1b1b1b]">
                    <select
                      value={closeAllMode}
                      onChange={(e) => setCloseAllMode(e.target.value as 'market' | 'limit')}
                      className="px-3 py-1.5 text-xs bg-[#1b1b1b] border border-[#1b1b1b] rounded text-[#c0c0c0] focus:outline-none focus:ring-2 focus:ring-[#03c987]"
                      disabled={isClosingAll}
                    >
                      <option value="market">Market</option>
                      <option value="limit">Limit</option>
                    </select>
                    <button
                      onClick={handleCloseAllPositions}
                      disabled={isClosingAll || !walletAddress}
                      className="px-4 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 disabled:bg-[#4B5563] disabled:cursor-not-allowed text-white rounded transition-colors"
                    >
                      {isClosingAll ? 'Closing...' : 'Close All'}
                    </button>
                    {closeAllStatus && (
                      <div className={`text-xs px-2 py-1 rounded ${
                        closeAllStatus.type === 'success' 
                          ? 'bg-green-900/30 text-green-400' 
                          : 'bg-red-900/30 text-red-400'
                      }`}>
                        {closeAllStatus.message}
                      </div>
                    )}
                  </div>
                )}

                {/* Positions Table */}
                <div className="flex-1 overflow-auto">
                  {positions.length === 0 ? (
                    <div className="text-center py-8 text-[#888]">No open positions</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[#1b1b1b] text-[#888]">
                            <th className="text-left py-2 px-2">Symbol</th>
                            <th className="text-right py-2 px-2">Size</th>
                            <th className="text-right py-2 px-2">Entry</th>
                            <th className="text-right py-2 px-2">P&L</th>
                            <th className="text-right py-2 px-2">ROE</th>
                            <th className="text-right py-2 px-2">Margin</th>
                            <th className="text-right py-2 px-2">Leverage</th>
                            <th className="text-center py-2 px-2">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {positions.map((pos, idx) => {
                            const coin = pos.coin || '';
                            const isClosing = closingPosition === coin;
                            const closeMode = positionCloseMode[coin] || 'market';
                            
                            return (
                              <tr key={`${pos.coin}-${idx}`} className="border-b border-[#1b1b1b] hover:bg-[#1b1b1b]">
                                <td className="py-2 px-2 font-medium">{pos.coin?.replace('-PERP', '')}</td>
                                <td className="text-right py-2 px-2">{formatSize(pos.size)}</td>
                                <td className="text-right py-2 px-2">{formatPrice(pos.entryPx)}</td>
                                <td className={`text-right py-2 px-2 ${parseFloat(pos.unrealizedPnl) >= 0 ? 'text-[#03c987]' : 'text-[#ff4d4f]'}`}>
                                  {parseFloat(pos.unrealizedPnl) >= 0 ? '+' : ''}{formatPrice(pos.unrealizedPnl)}
                                </td>
                                <td className={`text-right py-2 px-2 ${(pos.roe || 0) >= 0 ? 'text-[#03c987]' : 'text-[#ff4d4f]'}`}>
                                  {(pos.roe || 0) >= 0 ? '+' : ''}{(pos.roe || 0).toFixed(2)}%
                                </td>
                                <td className="text-right py-2 px-2">{formatPrice(pos.marginUsed || '0')}</td>
                                <td className="text-right py-2 px-2">{pos.leverage?.value || '-'}x</td>
                                <td className="py-2 px-2">
                                  <div className="flex items-center justify-center gap-1">
                                    <select
                                      value={closeMode}
                                      onChange={(e) => {
                                        setPositionCloseMode(prev => ({
                                          ...prev,
                                          [coin]: e.target.value as 'market' | 'limit'
                                        }));
                                      }}
                                      className="px-2 py-1 text-xs bg-[#1b1b1b] border border-[#1b1b1b] rounded text-[#c0c0c0] focus:outline-none focus:ring-1 focus:ring-[#03c987]"
                                      disabled={isClosing}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <option value="market">Market</option>
                                      <option value="limit">Limit</option>
                                    </select>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleClosePosition(coin, pos.size);
                                      }}
                                      disabled={isClosing || !walletAddress}
                                      className="px-2 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 disabled:bg-[#4B5563] disabled:cursor-not-allowed text-white rounded transition-colors"
                                    >
                                      {isClosing ? '...' : 'Close'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Open Orders Tab */}
            {activeTab === 'openOrders' && (
              <div className="p-3">
                {openOrders.length === 0 ? (
                  <div className="text-center py-8 text-[#888]">No open orders</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#1b1b1b] text-[#888]">
                          <th className="text-left py-2 px-2">Symbol</th>
                          <th className="text-right py-2 px-2">Side</th>
                          <th className="text-right py-2 px-2">Size</th>
                          <th className="text-right py-2 px-2">Price</th>
                          <th className="text-right py-2 px-2">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openOrders.map((order, idx) => (
                          <tr key={`order-${order.oid || idx}`} className="border-b border-[#1b1b1b] hover:bg-[#1b1b1b]">
                            <td className="py-2 px-2 font-medium">{order.coin?.replace('-PERP', '') || '-'}</td>
                            <td className={`text-right py-2 px-2 ${order.side === 'B' ? 'text-[#03c987]' : 'text-[#ff4d4f]'}`}>
                              {order.side === 'B' ? 'Buy' : 'Sell'}
                            </td>
                            <td className="text-right py-2 px-2">{formatSize(order.sz || '0')}</td>
                            <td className="text-right py-2 px-2">{formatPrice(order.limitPx || '0')}</td>
                            <td className="text-right py-2 px-2">{(order as any).orderType || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TWAP Tab */}
            {activeTab === 'twap' && (
              <div className="p-3">
                {twapFills.length === 0 ? (
                  <div className="text-center py-8 text-[#888]">No TWAP fills</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#1b1b1b] text-[#888]">
                          <th className="text-left py-2 px-2">Symbol</th>
                          <th className="text-right py-2 px-2">Side</th>
                          <th className="text-right py-2 px-2">Size</th>
                          <th className="text-right py-2 px-2">Price</th>
                          <th className="text-right py-2 px-2">TWAP ID</th>
                          <th className="text-right py-2 px-2">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {twapFills.map((fill, idx) => {
                          const fillAny = fill as any;
                          return (
                            <tr key={`twap-${fillAny.twapId}-${fillAny.sliceId || idx}`} className="border-b border-[#1b1b1b] hover:bg-[#1b1b1b]">
                              <td className="py-2 px-2 font-medium">{fillAny.coin?.replace('-PERP', '') || '-'}</td>
                              <td className={`text-right py-2 px-2 ${fillAny.side === 'B' ? 'text-[#03c987]' : 'text-[#ff4d4f]'}`}>
                                {fillAny.side === 'B' ? 'Buy' : 'Sell'}
                              </td>
                              <td className="text-right py-2 px-2">{formatSize(fillAny.sz || '0')}</td>
                              <td className="text-right py-2 px-2">{formatPrice(fillAny.px || '0')}</td>
                              <td className="text-right py-2 px-2">{fillAny.twapId || '-'}</td>
                              <td className="text-right py-2 px-2">{formatTime(fillAny.time)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Trade History Tab */}
            {activeTab === 'tradeHistory' && (
              <div className="p-3">
                {tradeHistory.length === 0 ? (
                  <div className="text-center py-8 text-[#888]">No trade history</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#1b1b1b] text-[#888]">
                          <th className="text-left py-2 px-2">Symbol</th>
                          <th className="text-right py-2 px-2">Side</th>
                          <th className="text-right py-2 px-2">Size</th>
                          <th className="text-right py-2 px-2">Price</th>
                          <th className="text-right py-2 px-2">P&L</th>
                          <th className="text-right py-2 px-2">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tradeHistory.map((fill, idx) => (
                          <tr key={`trade-${fill.hash || fill.oid || idx}`} className="border-b border-[#1b1b1b] hover:bg-[#1b1b1b]">
                            <td className="py-2 px-2 font-medium">{fill.coin?.replace('-PERP', '') || '-'}</td>
                            <td className={`text-right py-2 px-2 ${fill.side === 'B' ? 'text-[#03c987]' : 'text-[#ff4d4f]'}`}>
                              {fill.side === 'B' ? 'Buy' : 'Sell'}
                            </td>
                            <td className="text-right py-2 px-2">{formatSize(fill.sz || '0')}</td>
                            <td className="text-right py-2 px-2">{formatPrice(fill.px || '0')}</td>
                            <td className={`text-right py-2 px-2 ${fill.closedPnl && parseFloat(fill.closedPnl) >= 0 ? 'text-[#03c987]' : fill.closedPnl ? 'text-[#ff4d4f]' : 'text-[#888]'}`}>
                              {fill.closedPnl ? (parseFloat(fill.closedPnl) >= 0 ? '+' : '') + formatPrice(fill.closedPnl) : '-'}
                            </td>
                            <td className="text-right py-2 px-2">{formatTime(fill.time)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Funding History Tab */}
            {activeTab === 'fundingHistory' && (
              <div className="p-3">
                {fundingHistory.length === 0 ? (
                  <div className="text-center py-8 text-[#888]">No funding history</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#1b1b1b] text-[#888]">
                          <th className="text-left py-2 px-2">Symbol</th>
                          <th className="text-right py-2 px-2">Funding</th>
                          <th className="text-right py-2 px-2">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fundingHistory.map((entry, idx) => (
                          <tr key={`funding-${entry.hash || entry.time || idx}`} className="border-b border-[#1b1b1b] hover:bg-[#1b1b1b]">
                            <td className="py-2 px-2 font-medium">{entry.coin?.replace('-PERP', '') || '-'}</td>
                            <td className={`text-right py-2 px-2 ${entry.funding && parseFloat(entry.funding) >= 0 ? 'text-[#03c987]' : 'text-[#ff4d4f]'}`}>
                              {entry.funding ? (parseFloat(entry.funding) >= 0 ? '+' : '') + formatPrice(entry.funding) : '-'}
                            </td>
                            <td className="text-right py-2 px-2">{formatTime(entry.time)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Order History Tab */}
            {activeTab === 'orderHistory' && (
              <div className="p-3">
                {orderHistory.length === 0 ? (
                  <div className="text-center py-8 text-[#888]">No order history</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#1b1b1b] text-[#888]">
                          <th className="text-left py-2 px-2">Symbol</th>
                          <th className="text-right py-2 px-2">Side</th>
                          <th className="text-right py-2 px-2">Size</th>
                          <th className="text-right py-2 px-2">Price</th>
                          <th className="text-right py-2 px-2">Status</th>
                          <th className="text-right py-2 px-2">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderHistory.map((order, idx) => {
                          const orderAny = order as any;
                          return (
                          <tr key={`history-${orderAny.oid || idx}`} className="border-b border-[#1b1b1b] hover:bg-[#1b1b1b]">
                            <td className="py-2 px-2 font-medium">{order.order?.coin?.replace('-PERP', '') || '-'}</td>
                            <td className={`text-right py-2 px-2 ${order.order?.side === 'B' ? 'text-[#03c987]' : 'text-[#ff4d4f]'}`}>
                              {order.order?.side === 'B' ? 'Buy' : order.order?.side === 'A' ? 'Sell' : '-'}
                            </td>
                            <td className="text-right py-2 px-2">{formatSize(order.order?.sz || '0')}</td>
                            <td className="text-right py-2 px-2">{formatPrice(order.order?.limitPx || '0')}</td>
                            <td className="text-right py-2 px-2">{order.status || '-'}</td>
                            <td className="text-right py-2 px-2">{formatTime(order.statusTimestamp)}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
