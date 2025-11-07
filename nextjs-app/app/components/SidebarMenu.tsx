'use client';

import { useState, useEffect } from 'react';
import { Hyperliquid } from 'hyperliquid';

interface SidebarMenuProps {
  walletAddress: string;
  sdk: Hyperliquid | null;
}

const TESTNET = true;

export function SidebarMenu({ walletAddress, sdk }: SidebarMenuProps) {
  const [activeMenuTab, setActiveMenuTab] = useState<'balances' | 'positions' | 'openOrders' | 'orderHistory'>('balances');
  const [positions, setPositions] = useState<Array<{
    coin: string;
    size: string;
    entryPx: string;
    unrealizedPnl: string;
    leverage?: { value: string };
    marginUsed?: string;
  }>>([]);
  const [openOrders, setOpenOrders] = useState<Array<{
    coin?: string;
    side?: string;
    sz?: string;
    limitPx?: string;
    orderType?: string;
    oid?: number;
  }>>([]);
  const [cancellingOrderId, setCancellingOrderId] = useState<number | null>(null);
  const [closingPositionCoin, setClosingPositionCoin] = useState<string | null>(null);
  const [orderHistory, setOrderHistory] = useState<Array<{
    order?: {
      coin?: string;
      side?: string;
      sz?: string;
      limitPx?: string;
    };
    status?: string;
    statusTimestamp?: number;
  }>>([]);
  const [accountValue, setAccountValue] = useState<string>('Loading...');
  const [perpsBalance, setPerpsBalance] = useState<string>('Loading...');
  const [spotBalance, setSpotBalance] = useState<string>('Loading...');

  // Fetch data for menu tabs
  useEffect(() => {
    if (!walletAddress || !sdk) return;

    const fetchMenuData = async () => {
      try {
        const normalizedWalletAddress = walletAddress.toLowerCase();

        // Fetch balances and positions
        if (activeMenuTab === 'positions' || activeMenuTab === 'balances') {
          const clearinghouseState = await sdk.info.perpetuals.getClearinghouseState(normalizedWalletAddress);
          if (clearinghouseState) {
            const accountVal = parseFloat(clearinghouseState.marginSummary?.accountValue || '0');
            const withdrawable = parseFloat(clearinghouseState.withdrawable || '0');
            setAccountValue(`$${accountVal.toFixed(2)}`);
            setPerpsBalance(`$${withdrawable.toFixed(2)}`);

            if (clearinghouseState.assetPositions) {
              const activePositions = clearinghouseState.assetPositions
                .filter((pos: { position?: { szi?: string } }) => pos.position && parseFloat(pos.position.szi || '0') !== 0)
                .map((pos: { position: { coin: string; szi: string; entryPx: string; unrealizedPnl: string; leverage?: { value: number }; marginUsed?: string } }) => ({
                  coin: pos.position.coin,
                  size: pos.position.szi,
                  entryPx: pos.position.entryPx,
                  unrealizedPnl: pos.position.unrealizedPnl,
                  leverage: pos.position.leverage ? { value: String(pos.position.leverage.value) } : undefined,
                  marginUsed: pos.position.marginUsed,
                }));
              setPositions(activePositions);
            }
          }

          // Fetch spot balance
          try {
            const spotState = await sdk.info.spot.getSpotClearinghouseState(normalizedWalletAddress);
            if (spotState && typeof spotState === 'object' && 'balances' in spotState) {
              const balances = (spotState as any).balances || [];
              if (Array.isArray(balances) && balances.length > 0) {
                const usdcBalance = balances.find((bal: any) => 
                  bal.coin === 'USDC' || bal.coin === 'USDC-SPOT'
                );
                if (usdcBalance) {
                  const total = parseFloat(usdcBalance.total || '0');
                  setSpotBalance(`$${total.toFixed(2)}`);
                } else {
                  setSpotBalance('$0.00');
                }
              } else {
                setSpotBalance('$0.00');
              }
            } else {
              setSpotBalance('$0.00');
            }
          } catch (error) {
            console.error('Error fetching spot balance:', error);
            setSpotBalance('N/A');
          }
        }

        // Fetch open orders
        if (activeMenuTab === 'openOrders') {
          const orders = await sdk.info.getUserOpenOrders(normalizedWalletAddress);
          setOpenOrders(orders || []);
        }

        // Fetch order history
        if (activeMenuTab === 'orderHistory') {
          const history = await sdk.info.getHistoricalOrders(normalizedWalletAddress);
          setOrderHistory(history || []);
        }
      } catch (error) {
        console.error('Error fetching menu data:', error);
      }
    };

    fetchMenuData();
    // Refresh every 5 seconds
    const interval = setInterval(fetchMenuData, 5000);
    return () => clearInterval(interval);
  }, [walletAddress, sdk, activeMenuTab]);

  // Get agent info from localStorage
  const getAgentFromStorage = (): { privateKey: string; userAddress: string } | null => {
    if (typeof window === 'undefined') return null;
    const key = `hyperliquid_agent_${walletAddress}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  };

  // Handle cancel order
  const handleCancelOrder = async (order: { coin?: string; oid?: number }) => {
    if (!order.coin || !order.oid) {
      console.error('Missing coin or oid for cancel order');
      return;
    }

    const agentInfo = getAgentFromStorage();
    if (!agentInfo) {
      alert('Agent not found. Please enable trading first.');
      return;
    }

    setCancellingOrderId(order.oid);

    try {
      // Create SDK instance with private key for signing
      const tradingSdk = new Hyperliquid({
        testnet: TESTNET,
        enableWs: false,
        walletAddress: agentInfo.userAddress,
        privateKey: agentInfo.privateKey,
      });

      await tradingSdk.connect();
      await tradingSdk.ensureInitialized();

      // Cancel the order
      const cancelRequest = {
        coin: order.coin,
        o: order.oid,
      };

      const response = await tradingSdk.exchange.cancelOrder(cancelRequest);
      console.log('Cancel order response:', response);

      if (response.status === 'ok') {
        // Refresh open orders
        const normalizedWalletAddress = walletAddress.toLowerCase();
        const orders = await sdk?.info.getUserOpenOrders(normalizedWalletAddress);
        setOpenOrders(orders || []);
      } else {
        alert(`Failed to cancel order: ${JSON.stringify(response)}`);
      }
    } catch (error) {
      console.error('Error cancelling order:', error);
      alert(`Error cancelling order: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCancellingOrderId(null);
    }
  };

  // Handle close position
  const handleClosePosition = async (position: { coin: string; size: string }) => {
    if (!position.coin) {
      console.error('Missing coin for close position');
      return;
    }

    const agentInfo = getAgentFromStorage();
    if (!agentInfo) {
      alert('Agent not found. Please enable trading first.');
      return;
    }

    setClosingPositionCoin(position.coin);

    try {
      // Create SDK instance with private key for signing
      const tradingSdk = new Hyperliquid({
        testnet: TESTNET,
        enableWs: false,
        walletAddress: agentInfo.userAddress,
        privateKey: agentInfo.privateKey,
      });

      await tradingSdk.connect();
      await tradingSdk.ensureInitialized();

      // Close the position using marketClose
      const response = await tradingSdk.custom.marketClose(position.coin);
      console.log('Close position response:', response);

      if (response.status === 'ok') {
        // Refresh positions
        const normalizedWalletAddress = walletAddress.toLowerCase();
        const clearinghouseState = await sdk?.info.perpetuals.getClearinghouseState(normalizedWalletAddress);
        if (clearinghouseState && clearinghouseState.assetPositions) {
          const activePositions = clearinghouseState.assetPositions
            .filter((pos: { position?: { szi?: string } }) => pos.position && parseFloat(pos.position.szi || '0') !== 0)
            .map((pos: { position: { coin: string; szi: string; entryPx: string; unrealizedPnl: string; leverage?: { value: number }; marginUsed?: string } }) => ({
              coin: pos.position.coin,
              size: pos.position.szi,
              entryPx: pos.position.entryPx,
              unrealizedPnl: pos.position.unrealizedPnl,
              leverage: pos.position.leverage ? { value: String(pos.position.leverage.value) } : undefined,
              marginUsed: pos.position.marginUsed,
            }));
          setPositions(activePositions);
        }
      } else {
        alert(`Failed to close position: ${JSON.stringify(response)}`);
      }
    } catch (error) {
      console.error('Error closing position:', error);
      alert(`Error closing position: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setClosingPositionCoin(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden h-full">
      {/* Horizontal Tabs */}
      <div className="flex gap-1 p-2 bg-gradient-to-r from-gray-50 to-purple-50/50 dark:from-gray-800 dark:to-purple-900/30 border-b border-gray-200/50 dark:border-gray-700/50">
        <button
          onClick={() => setActiveMenuTab('balances')}
          className={`flex-1 px-4 py-3 font-semibold text-sm transition-all duration-200 rounded-lg relative ${
            activeMenuTab === 'balances'
              ? 'text-white bg-gradient-to-r from-purple-600 to-blue-600 shadow-lg shadow-purple-500/30 scale-105'
              : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-700/50 hover:text-purple-600 dark:hover:text-purple-400'
          }`}
        >
          <span className="relative z-10">Balances</span>
          {activeMenuTab === 'balances' && (
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20 blur-xl rounded-lg"></div>
          )}
        </button>
        <button
          onClick={() => setActiveMenuTab('positions')}
          className={`flex-1 px-4 py-3 font-semibold text-sm transition-all duration-200 rounded-lg relative ${
            activeMenuTab === 'positions'
              ? 'text-white bg-gradient-to-r from-purple-600 to-blue-600 shadow-lg shadow-purple-500/30 scale-105'
              : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-700/50 hover:text-purple-600 dark:hover:text-purple-400'
          }`}
        >
          <span className="relative z-10">Positions</span>
          {activeMenuTab === 'positions' && (
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20 blur-xl rounded-lg"></div>
          )}
        </button>
        <button
          onClick={() => setActiveMenuTab('openOrders')}
          className={`flex-1 px-4 py-3 font-semibold text-sm transition-all duration-200 rounded-lg relative ${
            activeMenuTab === 'openOrders'
              ? 'text-white bg-gradient-to-r from-purple-600 to-blue-600 shadow-lg shadow-purple-500/30 scale-105'
              : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-700/50 hover:text-purple-600 dark:hover:text-purple-400'
          }`}
        >
          <span className="relative z-10">Open Orders</span>
          {activeMenuTab === 'openOrders' && (
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20 blur-xl rounded-lg"></div>
          )}
        </button>
        <button
          onClick={() => setActiveMenuTab('orderHistory')}
          className={`flex-1 px-4 py-3 font-semibold text-sm transition-all duration-200 rounded-lg relative ${
            activeMenuTab === 'orderHistory'
              ? 'text-white bg-gradient-to-r from-purple-600 to-blue-600 shadow-lg shadow-purple-500/30 scale-105'
              : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-700/50 hover:text-purple-600 dark:hover:text-purple-400'
          }`}
        >
          <span className="relative z-10">Order History</span>
          {activeMenuTab === 'orderHistory' && (
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20 blur-xl rounded-lg"></div>
          )}
        </button>
      </div>

      {/* Menu Content */}
      <div className="flex-1 p-6 overflow-auto bg-gradient-to-br from-white/50 to-purple-50/30 dark:from-gray-800/50 dark:to-purple-900/20">
        {activeMenuTab === 'balances' && (
          <div className="animate-fadeIn">
            <h3 className="text-xl font-bold mb-6 text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span className="w-1 h-6 bg-gradient-to-b from-purple-600 to-blue-600 rounded-full"></span>
              Balances
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-gradient-to-r from-white to-purple-50/50 dark:from-gray-800 dark:to-purple-900/30 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 border border-purple-100/50 dark:border-purple-800/50 hover:scale-[1.02]">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Account Value:</span>
                <span className="font-bold text-lg bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">{accountValue}</span>
              </div>
              <div className="flex justify-between items-center p-4 bg-gradient-to-r from-white to-blue-50/50 dark:from-gray-800 dark:to-blue-900/30 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 border border-blue-100/50 dark:border-blue-800/50 hover:scale-[1.02]">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Perps Balance:</span>
                <span className="font-bold text-lg text-blue-600 dark:text-blue-400">{perpsBalance}</span>
              </div>
              <div className="flex justify-between items-center p-4 bg-gradient-to-r from-white to-green-50/50 dark:from-gray-800 dark:to-green-900/30 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 border border-green-100/50 dark:border-green-800/50 hover:scale-[1.02]">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Spot Balance:</span>
                <span className="font-bold text-lg text-green-600 dark:text-green-400">{spotBalance}</span>
              </div>
            </div>
          </div>
        )}

        {activeMenuTab === 'positions' && (
          <div className="animate-fadeIn">
            <h3 className="text-xl font-bold mb-6 text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span className="w-1 h-6 bg-gradient-to-b from-purple-600 to-blue-600 rounded-full"></span>
              Positions
            </h3>
            {positions.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-block p-4 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">No open positions</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/30 dark:to-blue-900/30 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Coin</th>
                      <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Size</th>
                      <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Entry</th>
                      <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">P&L</th>
                      <th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white/50 dark:bg-gray-800/50">
                    {positions.map((pos, idx) => (
                      <tr key={idx} className="border-b border-gray-100 dark:border-gray-800 hover:bg-purple-50/50 dark:hover:bg-purple-900/20 transition-colors">
                        <td className="p-3 font-semibold text-gray-900 dark:text-gray-100">{pos.coin}</td>
                        <td className="p-3 text-right text-gray-700 dark:text-gray-300">{pos.size}</td>
                        <td className="p-3 text-right text-gray-700 dark:text-gray-300">{pos.entryPx}</td>
                        <td className={`p-3 text-right font-bold ${parseFloat(pos.unrealizedPnl) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {parseFloat(pos.unrealizedPnl) >= 0 ? '+' : ''}{pos.unrealizedPnl}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleClosePosition(pos)}
                            disabled={closingPositionCoin === pos.coin}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                              closingPositionCoin === pos.coin
                                ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                                : 'bg-red-500 hover:bg-red-600 text-white shadow-md hover:shadow-lg hover:scale-105'
                            }`}
                          >
                            {closingPositionCoin === pos.coin ? 'Closing...' : 'Close'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeMenuTab === 'openOrders' && (
          <div className="animate-fadeIn">
            <h3 className="text-xl font-bold mb-6 text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span className="w-1 h-6 bg-gradient-to-b from-purple-600 to-blue-600 rounded-full"></span>
              Open Orders
            </h3>
            {openOrders.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-block p-4 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">No open orders</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/30 dark:to-blue-900/30 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Coin</th>
                      <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Side</th>
                      <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Size</th>
                      <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Price</th>
                      <th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white/50 dark:bg-gray-800/50">
                    {openOrders.map((order, idx) => (
                      <tr key={idx} className="border-b border-gray-100 dark:border-gray-800 hover:bg-purple-50/50 dark:hover:bg-purple-900/20 transition-colors">
                        <td className="p-3 font-semibold text-gray-900 dark:text-gray-100">{order.coin || 'N/A'}</td>
                        <td className="p-3">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                            order.side === 'B' 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {order.side === 'B' ? 'Buy' : 'Sell'}
                          </span>
                        </td>
                        <td className="p-3 text-right text-gray-700 dark:text-gray-300">{order.sz || 'N/A'}</td>
                        <td className="p-3 text-right font-medium text-gray-900 dark:text-gray-100">{order.limitPx || 'N/A'}</td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleCancelOrder(order)}
                            disabled={cancellingOrderId === order.oid}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                              cancellingOrderId === order.oid
                                ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                                : 'bg-red-500 hover:bg-red-600 text-white shadow-md hover:shadow-lg hover:scale-105'
                            }`}
                          >
                            {cancellingOrderId === order.oid ? 'Closing...' : 'Close'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeMenuTab === 'orderHistory' && (
          <div className="animate-fadeIn">
            <h3 className="text-xl font-bold mb-6 text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span className="w-1 h-6 bg-gradient-to-b from-purple-600 to-blue-600 rounded-full"></span>
              Order History
            </h3>
            {orderHistory.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-block p-4 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">No order history</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/30 dark:to-blue-900/30 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Coin</th>
                      <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Side</th>
                      <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Size</th>
                      <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white/50 dark:bg-gray-800/50">
                    {orderHistory.slice(0, 10).map((entry, idx) => (
                      <tr key={idx} className="border-b border-gray-100 dark:border-gray-800 hover:bg-purple-50/50 dark:hover:bg-purple-900/20 transition-colors">
                        <td className="p-3 font-semibold text-gray-900 dark:text-gray-100">{entry.order?.coin || 'N/A'}</td>
                        <td className="p-3">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                            entry.order?.side === 'B' 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {entry.order?.side === 'B' ? 'Buy' : 'Sell'}
                          </span>
                        </td>
                        <td className="p-3 text-right text-gray-700 dark:text-gray-300">{entry.order?.sz || 'N/A'}</td>
                        <td className="p-3">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                            entry.status === 'filled' 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                            entry.status === 'canceled' 
                              ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' :
                              'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                          }`}>
                            {entry.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

