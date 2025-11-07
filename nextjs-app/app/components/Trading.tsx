'use client';

import { useState, useEffect } from 'react';
import { useSignTypedData } from 'wagmi';
import { parseSignature, isHex } from 'viem';
import { Wallet } from 'ethers';
import { useHyperliquid } from '../contexts/HyperliquidContext';
import { SkeletonBalance } from './Skeleton';
import { useClearinghouseState, useAllMids, useInvalidateHyperliquidQueries } from '../hooks/useHyperliquidQueries';

interface TradingProps {
  walletAddress: string;
  coin?: string;
}

const TESTNET = true;
const ARBITRUM_CHAIN_ID = TESTNET ? 421614 : 42161;

const approveAgentDomain = {
  name: 'HyperliquidSignTransaction',
  version: '1',
  chainId: ARBITRUM_CHAIN_ID,
  verifyingContract: '0x0000000000000000000000000000000000000000' as const,
} as const;

const approveAgentTypes = {
  'HyperliquidTransaction:ApproveAgent': [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'agentAddress', type: 'address' },
    { name: 'agentName', type: 'string' },
    { name: 'nonce', type: 'uint64' },
  ],
} as const;

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

function saveAgentToStorage(walletAddress: string, agentInfo: { privateKey: string; userAddress: string }): void {
  if (typeof window === 'undefined') return;
  const key = `hyperliquid_agent_${walletAddress}`;
  localStorage.setItem(key, JSON.stringify(agentInfo));
}

function generateAgentWallet(): { privateKey: string; address: string } {
  const wallet = Wallet.createRandom();
  return {
    privateKey: wallet.privateKey,
    address: wallet.address,
  };
}

export function Trading({ walletAddress, coin = 'BTC-PERP' }: TradingProps) {
  const { readOnlySdk, getTradingSdk } = useHyperliquid();
  const [activeTab, setActiveTab] = useState<'long' | 'short'>('long');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [orderSize, setOrderSize] = useState<string>('10');
  const [leverage, setLeverage] = useState<number>(20);
  const [orderTab, setOrderTab] = useState<'market' | 'limit'>('market');
  const [limitOrderType, setLimitOrderType] = useState<'Gtc' | 'Ioc' | 'Alo'>('Gtc');
  const [limitPrice, setLimitPrice] = useState<string>('');
  const [lastNonce, setLastNonce] = useState<number>(0);
  const [perpsBalance, setPerpsBalance] = useState<string | null>(null);
  const [isTradingEnabled, setIsTradingEnabled] = useState<boolean | null>(null);
  const { invalidateClearinghouseState } = useInvalidateHyperliquidQueries();
  const [sizePercent, setSizePercent] = useState<number>(0);
  const [reduceOnly, setReduceOnly] = useState<boolean>(false);
  const [takeProfitStopLoss, setTakeProfitStopLoss] = useState<boolean>(false);
  const [marginType, setMarginType] = useState<'isolated' | 'cross'>('isolated');
  const [sizeUnit, setSizeUnit] = useState<string>('USDC');
  const { signTypedDataAsync } = useSignTypedData();
  
  // Get allMids from React Query cache at top level
  const { data: allMidsCache } = useAllMids();

  // Remove old SDK state - now using context

  // Get coin name from coin prop (remove -PERP suffix)
  const coinName = coin.replace('-PERP', '');
  
  // Type for size unit: coin name or USDC
  type SizeUnitType = typeof coinName | 'USDC';

  // Keep sizeUnit as USDC by default (don't change when coin changes)

  const generateUniqueNonce = (): number => {
    const timestamp = Math.floor(Date.now());
    if (timestamp <= lastNonce) {
      const newNonce = lastNonce + 1;
      setLastNonce(newNonce);
      return newNonce;
    }
    setLastNonce(timestamp);
    return timestamp;
  };

  useEffect(() => {
    if (walletAddress) {
      const agentInfo = getAgentFromStorage(walletAddress);
      if (!agentInfo) {
        console.log('No agent found in localStorage, trading is not enabled');
        setIsTradingEnabled(false);
      } else {
        console.log('Agent found in localStorage:', agentInfo);
      }
    }
  }, [walletAddress]);

  // Fetch perps balance using React Query
  const { data: perpsState, isLoading: isLoadingBalance } = useClearinghouseState(walletAddress);
  
  useEffect(() => {
    if (perpsState) {
      const withdrawable = parseFloat(perpsState.withdrawable || '0');
      setPerpsBalance(`$${withdrawable.toFixed(2)}`);
      const agentInfo = getAgentFromStorage(walletAddress);
      setIsTradingEnabled(!!agentInfo);
    } else if (!isLoadingBalance) {
      setPerpsBalance('N/A');
      const agentInfo = getAgentFromStorage(walletAddress);
      setIsTradingEnabled(!!agentInfo);
    }
  }, [perpsState, isLoadingBalance, walletAddress]);

  const handleEnableTrading = async () => {
    if (!readOnlySdk) {
      setStatus({
        type: 'error',
        message: 'SDK not initialized. Please refresh the page.',
      });
      return;
    }

    if (!walletAddress) {
      setStatus({
        type: 'error',
        message: 'Wallet address is required.',
      });
      return;
    }

    setIsLoading(true);
    setStatus(null);

    try {
      await readOnlySdk.ensureInitialized();
      console.log('=== ENABLE TRADING START ===');
      
      let agentInfo = getAgentFromStorage(walletAddress);
      console.log("🚀 ~ handleEnableTrading ~ agentInfo:", agentInfo)
      
      if (!agentInfo) {
        console.log('Step 1: No agent found in localStorage, approving agent...');
        
        const agentWallet = generateAgentWallet();
        const agentAddress = agentWallet.address;
        
        const approveNonce = generateUniqueNonce();
        const approveAgentMessage = {
          hyperliquidChain: TESTNET ? 'Testnet' : 'Mainnet',
          signatureChainId: `0x${ARBITRUM_CHAIN_ID.toString(16)}`,
          agentAddress,
          agentName: '',
          nonce: BigInt(approveNonce),
          type: 'approveAgent',
        };
        
        console.log('Approve Agent message:', {
          hyperliquidChain: approveAgentMessage.hyperliquidChain,
          signatureChainId: approveAgentMessage.signatureChainId,
          agentAddress: approveAgentMessage.agentAddress,
          agentName: approveAgentMessage.agentName,
          nonce: approveNonce,
          type: approveAgentMessage.type,
        });
        
        const approveSignature = await signTypedDataAsync({
          domain: approveAgentDomain,
          types: approveAgentTypes,
          primaryType: 'HyperliquidTransaction:ApproveAgent',
          message: {
            hyperliquidChain: approveAgentMessage.hyperliquidChain, 
            agentAddress: approveAgentMessage.agentAddress as `0x${string}`,
            agentName: approveAgentMessage.agentName,
            nonce: BigInt(approveNonce),
          } as const,
        });
        
        const approveSigHex = (isHex(approveSignature) ? approveSignature : `0x${approveSignature}`) as `0x${string}`;
        const parsedApproveSig = parseSignature(approveSigHex);
        const approveR = parsedApproveSig.r;
        const approveS = parsedApproveSig.s;
        let approveV = Number(parsedApproveSig.v);
        if (approveV === 0 || approveV === 1) {
          approveV += 27;
        }
        
        const approveAgentPayload = {
          action: {
            agentAddress: approveAgentMessage.agentAddress,
            hyperliquidChain: approveAgentMessage.hyperliquidChain,
            nonce: approveNonce,
            signatureChainId: approveAgentMessage.signatureChainId,
            type: 'approveAgent',
          },
          expiresAfter: null,
          nonce: approveNonce,
          isFrontend: true,
          signature: { r: approveR, s: approveS, v: approveV },
          vaultAddress: null,
        };
        
        console.log('Approve Agent payload:', JSON.stringify(approveAgentPayload, null, 2));
        
        const approveResponse = await fetch(
          TESTNET ? 'https://api.hyperliquid-testnet.xyz/exchange' : 'https://api.hyperliquid.xyz/exchange',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(approveAgentPayload),
          }
        );
        
        const approveResult = await approveResponse.json();
        console.log('Approve Agent response:', approveResult);
        
        if (!approveResponse.ok || approveResult.status === 'err') {
          throw new Error(approveResult.response || approveResult.message || 'Failed to approve agent');
        }
        
        agentInfo = {
          privateKey: agentWallet.privateKey,
          userAddress: walletAddress,
        };
        saveAgentToStorage(walletAddress, agentInfo);
        console.log('Step 1 complete: Agent approved and saved to localStorage');
      } else {
        console.log('Step 1: Agent already approved, found in localStorage');
      }

      setIsTradingEnabled(true);
      console.log('=== ENABLE TRADING COMPLETE ===');
      setStatus({
        type: 'success',
        message: 'Trading enabled successfully! You can now place orders.',
      });
    } catch (error: unknown) {
      console.error('Error enabling trading:', error);
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to enable trading. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdjustLeverage = async () => {
    if (!walletAddress) {
      setStatus({
        type: 'error',
        message: 'Wallet address is required.',
      });
      return;
    }

    const agentInfo = getAgentFromStorage(walletAddress);
    if (!agentInfo || !agentInfo.privateKey) {
      setStatus({
        type: 'error',
        message: 'Agent not approved. Please enable trading first.',
      });
      return;
    }

    setIsLoading(true);
    setStatus(null);

    try {
      const tradingSdk = await getTradingSdk(agentInfo.privateKey, agentInfo.userAddress);
      
      const coinSymbol = coin;
      console.log(`Adjusting leverage to ${leverage}x on ${coinSymbol}...`);
      
      await tradingSdk.exchange.updateLeverage(coinSymbol, 'isolated', leverage);
      console.log(`Leverage adjusted to ${leverage}x successfully`);

      setStatus({
        type: 'success',
        message: `Leverage adjusted to ${leverage}x successfully!`,
      });
      
      // Invalidate queries to refresh data
      if (walletAddress) {
        invalidateClearinghouseState(walletAddress);
      }
    } catch (error: unknown) {
      console.error('Error adjusting leverage:', error);
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to adjust leverage. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlaceOrder = async (isBuy: boolean) => {
    console.log(`=== PLACE ${isBuy ? 'LONG' : 'SHORT'} ${coinName} ORDER START ===`);
    
    if (!walletAddress) {
      setStatus({
        type: 'error',
        message: 'Wallet address is required.',
      });
      return;
    }

    const agentInfo = getAgentFromStorage(walletAddress);
    if (!agentInfo || !agentInfo.privateKey) {
      setStatus({
        type: 'error',
        message: 'Agent not approved. Please enable trading first.',
      });
      return;
    }

    setIsLoading(true);
    setStatus(null);

    try {
      console.log('=== PLACE ORDER START ===');
      console.log('agentInfo', agentInfo);
      const tradingSdk = await getTradingSdk(agentInfo.privateKey, agentInfo.userAddress);
      
      // Use React Query cache if available, otherwise fetch
      const allMids = allMidsCache || await tradingSdk.info.getAllMids();
      const coinPriceValue = allMids[coin] || allMids[coin.replace('-PERP', '')];
      
      if (!coinPriceValue) {
        throw new Error(`Could not fetch ${coin} price`);
      }

      const currentPrice = typeof coinPriceValue === 'number' ? coinPriceValue : parseFloat(String(coinPriceValue));
      
      const [meta] = await tradingSdk.info.perpetuals.getMetaAndAssetCtxs();
      
      const coinSymbol = coin;
      console.log(`Placing order on perpetual market: ${coinSymbol}`);
      
      const assetIndex = await tradingSdk.symbolConversion.getAssetIndex(coinSymbol);
      if (assetIndex === undefined) {
        throw new Error(`Could not find asset index for ${coinSymbol}. Make sure it's a perpetual market.`);
      }
      
      console.log(`Asset index for ${coinSymbol}: ${assetIndex}`);
      
      const asset = meta.universe[assetIndex];
      if (!asset) {
        throw new Error(`Could not find ${coinSymbol} in perpetual metadata`);
      }
      
      console.log(`Asset found in perpetual universe: ${asset.name}, maxLeverage: ${asset.maxLeverage}, szDecimals: ${asset.szDecimals}`);
      
      const tickSize = 1.0;
      const szDecimals = asset.szDecimals || 4; // Default to 4 decimals if not specified
      
      if (orderTab === 'limit' && (!limitPrice || parseFloat(limitPrice) <= 0)) {
        const rawLimitPrice = isBuy ? currentPrice * 0.99 : currentPrice * 1.01;
        const defaultLimitPrice = Math.round(rawLimitPrice / tickSize) * tickSize;
        setLimitPrice(String(defaultLimitPrice));
        console.log(`Current price: ${currentPrice}, Default limit: ${defaultLimitPrice} (tick size: ${tickSize})`);
      }
      
      console.log('Ensuring user exists (noop action)...');
      try {
        await tradingSdk.exchange.noop();
        console.log('User exists confirmed');
      } catch (noopError) {
        console.warn('Noop action failed (user may already exist):', noopError);
      }

      console.log(`Setting leverage to ${leverage}x on perpetual market...`);
      await tradingSdk.exchange.updateLeverage(coinSymbol, 'isolated', leverage);
      console.log(`Leverage set to ${leverage}x successfully`);

      // Convert order size to coin if needed
      let sizeNum: number;
      if (sizeUnit === 'USDC') {
        // Convert USDC to coin
        sizeNum = parseFloat(orderSize) / currentPrice;
      } else {
        sizeNum = parseFloat(orderSize);
      }
      
      if (isNaN(sizeNum) || sizeNum <= 0) {
        throw new Error('Please enter a valid order size');
      }

      // Round size to szDecimals precision to avoid "floatToWire causes rounding" error
      const sizeMultiplier = Math.pow(10, szDecimals);
      sizeNum = Math.round(sizeNum * sizeMultiplier) / sizeMultiplier;
      
      // Ensure minimum size (0.0001 or equivalent based on szDecimals)
      const minSize = Math.pow(10, -szDecimals);
      if (sizeNum <= 0 || sizeNum < minSize) {
        throw new Error(`Order size too small. Minimum size is ${minSize.toFixed(szDecimals)} ${sizeUnit === 'USDC' ? 'USDC' : coinName}`);
      }
      
      console.log(`Order size after rounding: ${sizeNum} (szDecimals: ${szDecimals}, original: ${orderSize})`);

      console.log(`Placing ${isBuy ? 'LONG' : 'SHORT'} perpetual order on ${coinSymbol}...`);
      
      let finalLimitPrice: number;
      
      if (orderTab === 'market') {
        console.log('Placing MARKET order (FrontendMarket)...');
        const slippageMultiplier = isBuy ? 1.005 : 0.995;
        finalLimitPrice = currentPrice * slippageMultiplier;
        finalLimitPrice = Math.round(finalLimitPrice / tickSize) * tickSize;
        console.log(`Market order price: ${finalLimitPrice} (current: ${currentPrice}, slippage: ${isBuy ? '+0.5%' : '-0.5%'})`);
      } else {
        console.log(`Placing LIMIT order (${limitOrderType})...`);
        if (limitPrice && parseFloat(limitPrice) > 0) {
          finalLimitPrice = parseFloat(limitPrice);
          finalLimitPrice = Math.round(finalLimitPrice / tickSize) * tickSize;
        } else {
          const rawLimitPrice = isBuy ? currentPrice * 0.99 : currentPrice * 1.01;
          finalLimitPrice = Math.round(rawLimitPrice / tickSize) * tickSize;
        }
      }
      
      const tifValue = orderTab === 'market' ? 'FrontendMarket' : limitOrderType;
      const orderParams = {
        coin: coinSymbol,
        is_buy: isBuy,
        sz: sizeNum,
        limit_px: finalLimitPrice,
        order_type: { 
          limit: { 
            tif: tifValue
          } 
        },
        reduce_only: reduceOnly,
      };
      
      console.log('Order params:', JSON.stringify(orderParams, null, 2));
      const orderResult = await tradingSdk.exchange.placeOrder(orderParams as Parameters<typeof tradingSdk.exchange.placeOrder>[0]);
      
      console.log('Order response:', orderResult);

      if (orderResult.status === 'err') {
        const errorMsg = orderResult.response || 'Failed to place order';
        if (errorMsg.includes('does not exist')) {
          throw new Error('Trading failed. Please check your balance and try again.');
        }
        throw new Error(errorMsg);
      }

      setStatus({
        type: 'success',
        message: `${isBuy ? 'Long' : 'Short'} order placed successfully! Status: ${JSON.stringify(orderResult.status)}`,
      });
      
      // Invalidate queries to refresh data
      if (walletAddress) {
        invalidateClearinghouseState(walletAddress);
      }
    } catch (error: unknown) {
      console.error('Error placing order:', error);
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to place order. Please check your balance and try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Update order size based on percentage slider
  useEffect(() => {
    const updateSizeFromPercent = async () => {
      if (sizePercent > 0 && perpsBalance !== null && perpsBalance !== 'N/A' && readOnlySdk && coin) {
        try {
          const balance = parseFloat(perpsBalance.replace(/[^0-9.]/g, ''));
          if (isNaN(balance)) return;
          
          // Use React Query cache
          const allMids = allMidsCache || {};
          const coinPriceValue = allMids[coin] || allMids[coin.replace('-PERP', '')];
          if (!coinPriceValue) return;
          
          const price = typeof coinPriceValue === 'number' ? coinPriceValue : parseFloat(String(coinPriceValue));
          if (isNaN(price) || price <= 0) return;
          
          const sizeInUsd = (balance * sizePercent) / 100;
          if (sizeUnit === coinName) {
            const sizeInCoin = sizeInUsd / price;
            setOrderSize(sizeInCoin.toFixed(4));
          } else {
            setOrderSize(sizeInUsd.toFixed(2));
          }
        } catch (error) {
          console.error('Error fetching price for size calculation:', error);
        }
      }
    };
    
    updateSizeFromPercent();
  }, [sizePercent, perpsBalance, sizeUnit, coinName, readOnlySdk, coin, allMidsCache]);

  // Handle size unit change - convert between coin and USDC
  const handleSizeUnitChange = async (newUnit: SizeUnitType) => {
    if (newUnit === sizeUnit) return;
    
    const currentSize = parseFloat(orderSize) || 0;
    if (currentSize === 0) {
      setSizeUnit(newUnit);
      return;
    }

    if (!readOnlySdk || !coin) {
      setSizeUnit(newUnit);
      return;
    }

    try {
      // Use React Query cache
      const allMids = allMidsCache || {};
      const coinPriceValue = allMids[coin] || allMids[coin.replace('-PERP', '')];
      if (!coinPriceValue) {
        setSizeUnit(newUnit);
        return;
      }
      
      const price = typeof coinPriceValue === 'number' ? coinPriceValue : parseFloat(String(coinPriceValue));
      if (isNaN(price) || price <= 0) {
        setSizeUnit(newUnit);
        return;
      }

      if (sizeUnit === coinName && newUnit === 'USDC') {
        // Convert coin to USDC
        const usdcValue = currentSize * price;
        setOrderSize(usdcValue.toFixed(2));
      } else if (sizeUnit === 'USDC' && newUnit === coinName) {
        // Convert USDC to coin
        const coinValue = currentSize / price;
        setOrderSize(coinValue.toFixed(4));
      }
      setSizeUnit(newUnit);
    } catch (error) {
      console.error('Error fetching price for unit conversion:', error);
      setSizeUnit(newUnit);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0C130F] overflow-hidden">
      <div className="flex flex-col flex-1 overflow-y-auto scrollbar-thin">
        {/* Top Controls - Pills */}
        <div className="flex gap-2 p-3 border-b border-[#1b1b1b]">
          <button
            onClick={() => setMarginType('isolated')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              marginType === 'isolated'
                ? 'bg-[#1b1b1b] text-[#c0c0c0]'
                : 'bg-[#1b1b1b] text-[#888] hover:text-[#c0c0c0]'
            }`}
          >
            Isolated
          </button>
          <button
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-[#1b1b1b] text-[#c0c0c0]"
          >
            {leverage}x
          </button>
          <button
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-[#1b1b1b] text-[#888]"
          >
            One-Way
          </button>
        </div>

        {/* Order Type Tabs */}
        <div className="flex gap-4 px-3 py-2 border-b border-[#1b1b1b]">
          <button
            onClick={() => setOrderTab('market')}
            className={`text-sm font-medium transition-all relative pb-1 ${
              orderTab === 'market'
                ? 'text-[#c0c0c0]'
                : 'text-[#888] hover:text-[#c0c0c0]'
            }`}
          >
            Market
            {orderTab === 'market' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#03c987]"></div>
            )}
          </button>
          <button
            onClick={() => setOrderTab('limit')}
            className={`text-sm font-medium transition-all relative pb-1 ${
              orderTab === 'limit'
                ? 'text-[#c0c0c0]'
                : 'text-[#888] hover:text-[#c0c0c0]'
            }`}
          >
            Limit
            {orderTab === 'limit' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#03c987]"></div>
            )}
          </button>
          <button className="text-sm font-medium text-[#888] hover:text-[#c0c0c0] flex items-center gap-1">
            Pro
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        
        {/* Tab Content */}
        <div className="flex-1 overflow-auto p-4 scrollbar-thin">
          <div className="w-full space-y-4">
            {/* Buy/Sell Toggle */}
            <div className="flex gap-1 bg-[#1b1b1b] rounded-lg p-1">
              <button
                onClick={() => setActiveTab('long')}
                className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'long'
                    ? 'bg-[#03c987] text-white'
                    : 'text-[#888] hover:text-[#c0c0c0]'
                }`}
              >
                Buy / Long
              </button>
              <button
                onClick={() => setActiveTab('short')}
                className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'short'
                    ? 'bg-[#ff4d4f] hover:bg-[#ee3d40] text-white'
                    : 'text-[#888] hover:text-[#c0c0c0]'
                }`}
              >
                Sell / Short
              </button>
            </div>

            {/* Available to Trade & Current Position */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#888]">Available to Trade</span>
                {isLoadingBalance || perpsBalance === null ? (
                  <SkeletonBalance width={80} />
                ) : (
                  <span className="text-sm font-medium text-[#c0c0c0]">{perpsBalance}</span>
                )}
              </div>
            </div>

            {/* Leverage Input */}
            <div className="space-y-2">
              <label className="block text-sm text-[#888]">Leverage</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="50"
                  value={leverage}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    if (!isNaN(value) && value >= 1 && value <= 50) {
                      setLeverage(value);
                    }
                  }}
                  disabled={isLoading}
                  className="flex-1 px-3 py-2 bg-[#1b1b1b] border border-[#1b1b1b] rounded-lg text-[#c0c0c0] focus:ring-2 focus:ring-[#03c987] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="20"
                />
                <button
                  onClick={handleAdjustLeverage}
                  disabled={isLoading || !readOnlySdk || isTradingEnabled === false}
                  className="px-4 py-2 bg-[#1b1b1b] hover:bg-[#2a2a2a] text-[#c0c0c0] text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Set
                </button>
              </div>
            </div>


            {/* Limit Order Type Selection */}
            {orderTab === 'limit' && (
              <div className="space-y-2">
                <label className="block text-sm text-gray-400">Time in Force</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLimitOrderType('Gtc')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      limitOrderType === 'Gtc'
                        ? 'bg-[#03c987] text-white'
                        : 'bg-[#2a2a2a] text-gray-400 hover:text-white'
                    }`}
                  >
                    GTC
                  </button>
                  <button
                    onClick={() => setLimitOrderType('Ioc')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      limitOrderType === 'Ioc'
                        ? 'bg-[#03c987] text-white'
                        : 'bg-[#2a2a2a] text-gray-400 hover:text-white'
                    }`}
                  >
                    IOC
                  </button>
                  <button
                    onClick={() => setLimitOrderType('Alo')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      limitOrderType === 'Alo'
                        ? 'bg-[#03c987] text-white'
                        : 'bg-[#2a2a2a] text-gray-400 hover:text-white'
                    }`}
                  >
                    ALO
                  </button>
                </div>
              </div>
            )}

            {/* Limit Price Input */}
            {orderTab === 'limit' && (
              <div className="space-y-2">
                <label className="block text-sm text-gray-400">Limit Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#374151] rounded-lg text-white focus:ring-2 focus:ring-[#03c987] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Enter limit price"
                />
              </div>
            )}

            {/* Size Input */}
            <div className="space-y-2">
              <label className="block text-sm text-gray-400">Size</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step={sizeUnit === coinName ? '0.0001' : '0.01'}
                  min={sizeUnit === coinName ? '0.0001' : '0.01'}
                  value={orderSize}
                  onChange={(e) => {
                    setOrderSize(e.target.value);
                    setSizePercent(0);
                  }}
                  disabled={isLoading}
                  className="flex-1 px-3 py-2 bg-[#2a2a2a] border border-[#374151] rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-[#03c987] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder={sizeUnit === coinName ? '1' : '10'}
                />
                <div className="relative">
                  <select
                    value={sizeUnit}
                    onChange={(e) => handleSizeUnitChange(e.target.value as SizeUnitType)}
                    className="appearance-none px-3 py-2 bg-[#2a2a2a] border border-[#374151] rounded-lg text-white text-sm flex items-center gap-1 hover:bg-[#374151] transition-colors cursor-pointer pr-8 focus:ring-2 focus:ring-[#03c987] focus:border-transparent"
                  >
                    <option value={coinName} className="bg-[#2a2a2a]">{coinName}</option>
                    <option value="USDC" className="bg-[#2a2a2a]">USDC</option>
                  </select>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Size Slider */}
            <div className="space-y-2">
              <div className="relative">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="25"
                  value={sizePercent}
                  onChange={(e) => {
                    const percent = parseInt(e.target.value);
                    setSizePercent(percent);
                  }}
                  className="w-full h-2 bg-[#2a2a2a] rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, #03c987 0%, #03c987 ${sizePercent}%, #2a2a2a ${sizePercent}%, #2a2a2a 100%)`
                  }}
                />
                <div className="flex justify-between mt-1">
                  {[0, 25, 50, 75, 100].map((mark) => (
                    <div
                      key={mark}
                      className={`w-1.5 h-1.5 rounded-full ${
                        mark <= sizePercent ? 'bg-[#03c987]' : 'bg-[#4B5563]'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <span className="text-xs text-gray-400 bg-[#2a2a2a] px-2 py-1 rounded">
                  {sizePercent}%
                </span>
              </div>
            </div>

            {/* Checkboxes */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reduceOnly}
                  onChange={(e) => setReduceOnly(e.target.checked)}
                  className="w-4 h-4 rounded border-[#374151] bg-[#2a2a2a] text-[#03c987] focus:ring-[#03c987] focus:ring-offset-0"
                />
                <span className="text-sm text-gray-400">Reduce Only</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={takeProfitStopLoss}
                  onChange={(e) => setTakeProfitStopLoss(e.target.checked)}
                  className="w-4 h-4 rounded border-[#374151] bg-[#2a2a2a] text-[#03c987] focus:ring-[#03c987] focus:ring-offset-0"
                />
                <span className="text-sm text-gray-400">Take Profit / Stop Loss</span>
              </label>
            </div>

            {/* Show Enable Trading button or Place Order button */}
            {isTradingEnabled === false ? (
              <button
                onClick={handleEnableTrading}
                disabled={isLoading || !readOnlySdk}
                className="w-full bg-[#03c987] hover:bg-[#02b877] disabled:bg-[#4B5563] text-white font-semibold py-3 px-6 rounded-lg transition-all disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Enabling Trading...
                  </span>
                ) : (
                  'Enable Trading'
                )}
              </button>
            ) : (
              <button
                onClick={() => handlePlaceOrder(activeTab === 'long')}
                disabled={isLoading || !readOnlySdk}
                className={`w-full ${
                  activeTab === 'long'
                    ? 'bg-[#03c987] hover:bg-[#02b877]'
                    : 'bg-red-600 hover:bg-red-700'
                } disabled:bg-[#4B5563] text-white font-semibold py-3 px-6 rounded-lg transition-all disabled:cursor-not-allowed`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Placing Order...
                  </span>
                ) : (
                  orderTab === 'market' 
                    ? `${activeTab === 'long' ? 'Long' : 'Short'} ${coin.replace('-PERP', '')} Market (x${leverage})` 
                    : `${activeTab === 'long' ? 'Long' : 'Short'} ${coin.replace('-PERP', '')} Limit (${limitOrderType})`
                )}
              </button>
            )}

            {status && (
              <div
                className={`p-3 rounded-lg ${
                  status.type === 'success'
                    ? 'bg-[#064E3B] border border-[#03c987]'
                    : status.type === 'error'
                    ? 'bg-[#7F1D1D] border border-[#EF4444]'
                    : 'bg-[#1E3A5F] border border-[#3B82F6]'
                }`}
              >
                <p
                  className={`text-sm ${
                    status.type === 'success'
                      ? 'text-[#03c987]'
                      : status.type === 'error'
                      ? 'text-[#EF4444]'
                      : 'text-[#3B82F6]'
                  }`}
                >
                  {status.message}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
