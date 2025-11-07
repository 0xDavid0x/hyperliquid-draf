'use client';

import { useState, useEffect } from 'react';
import { useSignTypedData } from 'wagmi';
import { parseSignature, isHex } from 'viem';
import { Wallet } from 'ethers';
import { 
  Hyperliquid,
} from 'hyperliquid';

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
  const [activeTab, setActiveTab] = useState<'long' | 'short'>('long');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [sdk, setSdk] = useState<Hyperliquid | null>(null);
  const [btcPrice, setBtcPrice] = useState<string>('Loading...');
  const [orderSize, setOrderSize] = useState<string>('10');
  const [leverage, setLeverage] = useState<number>(20);
  const [orderTab, setOrderTab] = useState<'market' | 'limit'>('market');
  const [limitOrderType, setLimitOrderType] = useState<'Gtc' | 'Ioc' | 'Alo'>('Gtc');
  const [limitPrice, setLimitPrice] = useState<string>('');
  const [lastNonce, setLastNonce] = useState<number>(0);
  const [perpsBalance, setPerpsBalance] = useState<string>('Loading...');
  const [isTradingEnabled, setIsTradingEnabled] = useState<boolean | null>(null);
  const [positionSize, setPositionSize] = useState<string>('0.00000');
  const [sizePercent, setSizePercent] = useState<number>(0);
  const [reduceOnly, setReduceOnly] = useState<boolean>(false);
  const [takeProfitStopLoss, setTakeProfitStopLoss] = useState<boolean>(false);
  const [marginType, setMarginType] = useState<'isolated' | 'cross'>('isolated');
  const [sizeUnit, setSizeUnit] = useState<string>('USDC');
  const { signTypedDataAsync } = useSignTypedData();

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

  useEffect(() => {
    const initializeSDK = async () => {
      try {
        const hyperliquid = new Hyperliquid({
          testnet: TESTNET,
          enableWs: false,
          walletAddress: walletAddress,
        });

        await hyperliquid.connect();
        await hyperliquid.ensureInitialized();
        setSdk(hyperliquid);

        const normalizedWalletAddress = walletAddress.toLowerCase();

        // Fetch coin price will be done in separate useEffect

        const agentInfo = getAgentFromStorage(walletAddress);

        try {
          const perpsState = await hyperliquid.info.perpetuals.getClearinghouseState(normalizedWalletAddress);
          const withdrawable = parseFloat(perpsState.withdrawable || '0');
          setPerpsBalance(`$${withdrawable.toFixed(2)}`);
          if (agentInfo) {
            setIsTradingEnabled(true);
          } else {
            setIsTradingEnabled(false);
          }
        } catch (error: unknown) {
          console.error('Error fetching perps balance:', error);
          const errorMessage = (error as Error)?.message || (error as { response?: string })?.response || '';
          if (errorMessage.includes('does not exist') || errorMessage.includes('not found')) {
            if (!agentInfo) {
              setIsTradingEnabled(false);
            } else {
              setIsTradingEnabled(false);
            }
          } else {
            if (agentInfo) {
              setIsTradingEnabled(true);
            } else {
              setIsTradingEnabled(false);
            }
          }
          setPerpsBalance('N/A');
        }
      } catch (error) {
        console.error('Error initializing SDK:', error);
        setStatus({
          type: 'error',
          message: 'Failed to initialize Hyperliquid SDK',
        });
      }
    };

    if (walletAddress) {
      initializeSDK();
    }

      return () => {
      };
    }, [walletAddress]);

  // Fetch coin price when coin changes
  useEffect(() => {
    const fetchCoinPrice = async () => {
      if (!sdk || !coin) return;
      
      try {
        const allMids = await sdk.info.getAllMids();
        const coinPriceValue = allMids[coin] || allMids[coin.replace('-PERP', '')];
        if (coinPriceValue) {
          setBtcPrice(`$${typeof coinPriceValue === 'number' ? (coinPriceValue as number).toFixed(2) : (parseFloat(String(coinPriceValue)) as number).toFixed(2)}`);
        } else {
          setBtcPrice('Loading...');
        }
      } catch (error) {
        console.error('Error fetching coin price:', error);
        setBtcPrice('N/A');
      }
    };

    if (sdk && coin) {
      fetchCoinPrice();
      // Refresh price every 5 seconds
      const interval = setInterval(fetchCoinPrice, 5000);
      return () => clearInterval(interval);
    }
  }, [sdk, coin]);

  const handleEnableTrading = async () => {
    if (!sdk) {
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
      await sdk.ensureInitialized();
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
      const tradingSdk = new Hyperliquid({
        privateKey: agentInfo.privateKey,
        testnet: TESTNET,
        walletAddress: agentInfo.userAddress,
        enableWs: false,
      });

      await tradingSdk.connect();
      await tradingSdk.ensureInitialized();
      
      const coinSymbol = coin;
      console.log(`Adjusting leverage to ${leverage}x on ${coinSymbol}...`);
      
      await tradingSdk.exchange.updateLeverage(coinSymbol, 'isolated', leverage);
      console.log(`Leverage adjusted to ${leverage}x successfully`);

      setStatus({
        type: 'success',
        message: `Leverage adjusted to ${leverage}x successfully!`,
      });
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
      const tradingSdk = new Hyperliquid({
        privateKey: agentInfo.privateKey,
        testnet: TESTNET,
        walletAddress: agentInfo.userAddress,
        enableWs: false,
      });

      await tradingSdk.connect();
      await tradingSdk.ensureInitialized();
      
      const allMids = await tradingSdk.info.getAllMids();
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

  // Calculate position size from clearinghouse state
  useEffect(() => {
    const fetchPosition = async () => {
      if (!sdk || !walletAddress) return;
      try {
        const normalizedWalletAddress = walletAddress.toLowerCase();
        const perpsState = await sdk.info.perpetuals.getClearinghouseState(normalizedWalletAddress);
        const coinPosition = perpsState.assetPositions?.find(
          (pos: any) => pos.position?.coin === coin || pos.position?.coin === coin.replace('-PERP', '')
        );
        if (coinPosition?.position?.szi) {
          const size = parseFloat(coinPosition.position.szi);
          setPositionSize(Math.abs(size).toFixed(5));
        } else {
          setPositionSize('0.00000');
        }
      } catch (error) {
        console.error('Error fetching position:', error);
        setPositionSize('0.00000');
      }
    };
    if (sdk && walletAddress) {
      fetchPosition();
      const interval = setInterval(fetchPosition, 10000);
      return () => clearInterval(interval);
    }
  }, [sdk, walletAddress, coin]);

  // Update order size based on percentage slider
  useEffect(() => {
    if (sizePercent > 0 && perpsBalance !== 'Loading...' && btcPrice !== 'Loading...') {
      const balance = parseFloat(perpsBalance.replace(/[^0-9.]/g, ''));
      const price = parseFloat(btcPrice.replace(/[^0-9.]/g, ''));
      if (!isNaN(balance) && !isNaN(price) && price > 0) {
        const sizeInUsd = (balance * sizePercent) / 100;
        if (sizeUnit === coinName) {
          const sizeInCoin = sizeInUsd / price;
          setOrderSize(sizeInCoin.toFixed(4));
        } else {
          setOrderSize(sizeInUsd.toFixed(2));
        }
      }
    }
  }, [sizePercent, perpsBalance, btcPrice, sizeUnit, coinName]);

  // Handle size unit change - convert between coin and USDC
  const handleSizeUnitChange = (newUnit: SizeUnitType) => {
    if (newUnit === sizeUnit) return;
    
    const currentSize = parseFloat(orderSize) || 0;
    if (currentSize === 0) {
      setSizeUnit(newUnit);
      return;
    }

    const price = parseFloat(btcPrice.replace(/[^0-9.]/g, ''));
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
  };

  return (
    <div className="h-full flex flex-col bg-[#1A202C]">
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top Controls - Pills */}
        <div className="flex gap-2 p-3 border-b border-[#2a2a2a]">
          <button
            onClick={() => setMarginType('isolated')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              marginType === 'isolated'
                ? 'bg-[#374151] text-white'
                : 'bg-[#2a2a2a] text-gray-400 hover:text-white'
            }`}
          >
            Isolated
          </button>
          <button
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-[#2a2a2a] text-white"
          >
            {leverage}x
          </button>
          <button
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-[#2a2a2a] text-gray-400"
          >
            One-Way
          </button>
        </div>

        {/* Order Type Tabs */}
        <div className="flex gap-4 px-3 py-2 border-b border-[#2a2a2a]">
          <button
            onClick={() => setOrderTab('market')}
            className={`text-sm font-medium transition-all relative pb-1 ${
              orderTab === 'market'
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Market
            {orderTab === 'market' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00C4B4]"></div>
            )}
          </button>
          <button
            onClick={() => setOrderTab('limit')}
            className={`text-sm font-medium transition-all relative pb-1 ${
              orderTab === 'limit'
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Limit
            {orderTab === 'limit' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00C4B4]"></div>
            )}
          </button>
          <button className="text-sm font-medium text-gray-400 hover:text-white flex items-center gap-1">
            Pro
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        
        {/* Tab Content */}
        <div className="flex-1 overflow-auto p-4">
          <div className="w-full space-y-4">
            {/* Buy/Sell Toggle */}
            <div className="flex gap-1 bg-[#2a2a2a] rounded-lg p-1">
              <button
                onClick={() => setActiveTab('long')}
                className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'long'
                    ? 'bg-[#00C4B4] text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Buy / Long
              </button>
              <button
                onClick={() => setActiveTab('short')}
                className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'short'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Sell / Short
              </button>
            </div>

            {/* Available to Trade & Current Position */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Available to Trade</span>
                <span className="text-sm font-medium text-white">{perpsBalance}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Current Position</span>
                <span className="text-sm font-medium text-white">{positionSize} {coin.replace('-PERP', '')}</span>
              </div>
            </div>

            {/* Coin Price Display */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">{coin.replace('-PERP', '')} Price</span>
                <span className="text-sm font-medium text-white">{btcPrice}</span>
              </div>
            </div>

            {/* Leverage Input */}
            <div className="space-y-2">
              <label className="block text-sm text-gray-400">Leverage</label>
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
                  className="flex-1 px-3 py-2 bg-[#2a2a2a] border border-[#374151] rounded-lg text-white focus:ring-2 focus:ring-[#00C4B4] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="20"
                />
                <button
                  onClick={handleAdjustLeverage}
                  disabled={isLoading || !sdk || isTradingEnabled === false}
                  className="px-4 py-2 bg-[#374151] hover:bg-[#4B5563] text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                        ? 'bg-[#00C4B4] text-white'
                        : 'bg-[#2a2a2a] text-gray-400 hover:text-white'
                    }`}
                  >
                    GTC
                  </button>
                  <button
                    onClick={() => setLimitOrderType('Ioc')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      limitOrderType === 'Ioc'
                        ? 'bg-[#00C4B4] text-white'
                        : 'bg-[#2a2a2a] text-gray-400 hover:text-white'
                    }`}
                  >
                    IOC
                  </button>
                  <button
                    onClick={() => setLimitOrderType('Alo')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      limitOrderType === 'Alo'
                        ? 'bg-[#00C4B4] text-white'
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
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#374151] rounded-lg text-white focus:ring-2 focus:ring-[#00C4B4] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="flex-1 px-3 py-2 bg-[#2a2a2a] border border-[#374151] rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-[#00C4B4] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder={sizeUnit === coinName ? '1' : '10'}
                />
                <div className="relative">
                  <select
                    value={sizeUnit}
                    onChange={(e) => handleSizeUnitChange(e.target.value as SizeUnitType)}
                    className="appearance-none px-3 py-2 bg-[#2a2a2a] border border-[#374151] rounded-lg text-white text-sm flex items-center gap-1 hover:bg-[#374151] transition-colors cursor-pointer pr-8 focus:ring-2 focus:ring-[#00C4B4] focus:border-transparent"
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
                    if (percent > 0 && perpsBalance !== 'Loading...' && btcPrice !== 'Loading...') {
                      const balance = parseFloat(perpsBalance.replace(/[^0-9.]/g, ''));
                      const price = parseFloat(btcPrice.replace(/[^0-9.]/g, ''));
                      if (!isNaN(balance) && !isNaN(price) && price > 0) {
                        const sizeInUsd = (balance * percent) / 100;
                        if (sizeUnit === coinName) {
                          const sizeInCoin = sizeInUsd / price;
                          setOrderSize(sizeInCoin.toFixed(4));
                        } else {
                          setOrderSize(sizeInUsd.toFixed(2));
                        }
                      }
                    }
                  }}
                  className="w-full h-2 bg-[#2a2a2a] rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, #00C4B4 0%, #00C4B4 ${sizePercent}%, #2a2a2a ${sizePercent}%, #2a2a2a 100%)`
                  }}
                />
                <div className="flex justify-between mt-1">
                  {[0, 25, 50, 75, 100].map((mark) => (
                    <div
                      key={mark}
                      className={`w-1.5 h-1.5 rounded-full ${
                        mark <= sizePercent ? 'bg-[#00C4B4]' : 'bg-[#4B5563]'
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
                  className="w-4 h-4 rounded border-[#374151] bg-[#2a2a2a] text-[#00C4B4] focus:ring-[#00C4B4] focus:ring-offset-0"
                />
                <span className="text-sm text-gray-400">Reduce Only</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={takeProfitStopLoss}
                  onChange={(e) => setTakeProfitStopLoss(e.target.checked)}
                  className="w-4 h-4 rounded border-[#374151] bg-[#2a2a2a] text-[#00C4B4] focus:ring-[#00C4B4] focus:ring-offset-0"
                />
                <span className="text-sm text-gray-400">Take Profit / Stop Loss</span>
              </label>
            </div>

            {/* Show Enable Trading button or Place Order button */}
            {isTradingEnabled === false ? (
              <button
                onClick={handleEnableTrading}
                disabled={isLoading || !sdk}
                className="w-full bg-[#00C4B4] hover:bg-[#00B8A8] disabled:bg-[#4B5563] text-white font-semibold py-3 px-6 rounded-lg transition-all disabled:cursor-not-allowed"
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
                disabled={isLoading || !sdk}
                className={`w-full ${
                  activeTab === 'long'
                    ? 'bg-[#00C4B4] hover:bg-[#00B8A8]'
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
                    ? 'bg-[#064E3B] border border-[#00C4B4]'
                    : status.type === 'error'
                    ? 'bg-[#7F1D1D] border border-[#EF4444]'
                    : 'bg-[#1E3A5F] border border-[#3B82F6]'
                }`}
              >
                <p
                  className={`text-sm ${
                    status.type === 'success'
                      ? 'text-[#00C4B4]'
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
