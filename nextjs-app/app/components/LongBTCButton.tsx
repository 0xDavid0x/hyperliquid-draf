'use client';

import { useState, useEffect } from 'react';
import { useSignTypedData } from 'wagmi';
import { encode } from '@msgpack/msgpack';
import { keccak256, toBytes, parseSignature, isHex, recoverTypedDataAddress } from 'viem';
import { Wallet } from 'ethers';

// Import Hyperliquid SDK functions (resolved via webpack alias)
import { 
  Hyperliquid, 
  SpotClearinghouseState,
  // Import SDK signing utilities
} from 'hyperliquid';

interface LongBTCButtonProps {
  walletAddress: string;
}

const TESTNET = true; // Set to true for testnet
const ARBITRUM_CHAIN_ID = TESTNET ? 421614 : 42161;

// IMPORTANT: Hyperliquid uses different chainId for phantomDomain based on mainnet/testnet
// Testnet: 998, Mainnet: 1337
// This is used for EIP-712 signing of L1 actions (updateLeverage, order, etc.)
// The Arbitrum chain ID (42161/421614) is only used for userSignedAction, not for L1 actions
const phantomDomain = {
  name: 'Exchange',
  version: '1',
  chainId: ARBITRUM_CHAIN_ID, // Testnet uses 998, Mainnet uses 1337
  verifyingContract: '0x0000000000000000000000000000000000000000' as const,
} as const;

const agentTypes = {
  Agent: [
    { name: 'source', type: 'string' },
    { name: 'connectionId', type: 'bytes32' },
  ],
} as const;

function normalizeTrailingZeros(obj: unknown): unknown {
  if (typeof obj === 'number') {
    return obj;
  }
  if (typeof obj === 'string') {
    // Remove trailing zeros but keep at least one digit after decimal if present
    if (!obj.includes('.')) return obj;
    const normalized = obj.replace(/\.?0+$/, '');
    return normalized === '-0' ? '0' : normalized;
  }
  if (Array.isArray(obj)) {
    return obj.map(normalizeTrailingZeros);
  }
  if (obj && typeof obj === 'object') {
    // IMPORTANT: Preserve field order for msgpack encoding
    // Use spread operator to preserve insertion order (JavaScript preserves order from ES2015)
    // This matches SDK's approach: const result = { ...obj };
    const normalized = { ...obj } as Record<string, unknown>;
    
    for (const key in normalized) {
      if (Object.prototype.hasOwnProperty.call(normalized, key)) {
        const value = normalized[key];
        // Handle price and size fields (p and s in wire format, limit_px and sz in request format)
        if ((key === 'p' || key === 's' || key === 'sz' || key === 'limit_px' || key === 'trigger_px') && typeof value === 'string') {
          if (!value.includes('.')) {
            normalized[key] = value;
          } else {
            const normalizedStr = value.replace(/\.?0+$/, '');
            normalized[key] = normalizedStr === '-0' ? '0' : normalizedStr;
          }
        } else if (value && typeof value === 'object') {
          // Recursively process nested objects
          normalized[key] = normalizeTrailingZeros(value);
        }
        // For other types (number, boolean, etc.), keep as is
      }
    }
    return normalized;
  }
  return obj;
}

function actionHash(action: unknown, vaultAddress: string | null, nonce: number): string {
  const normalizedAction = normalizeTrailingZeros(action);
  const msgPackBytes = encode(normalizedAction);
  const additionalBytesLength = vaultAddress === null ? 9 : 29;
  const data = new Uint8Array(msgPackBytes.length + additionalBytesLength);
  data.set(msgPackBytes);
  const view = new DataView(data.buffer);
  view.setBigUint64(msgPackBytes.length, BigInt(nonce), false);
  if (vaultAddress === null) {
    view.setUint8(msgPackBytes.length + 8, 0);
  } else {
    view.setUint8(msgPackBytes.length + 8, 1);
    const addressBytes = toBytes(vaultAddress);
    data.set(addressBytes, msgPackBytes.length + 9);
  }
  return keccak256(data);
}

function constructPhantomAgent(hash: string, isMainnet: boolean) {
  // SDK's constructPhantomAgent simply returns: { source: isMainnet ? 'a' : 'b', connectionId: hash }
  // hash is already a hex string from keccak256 (with 0x prefix), so we use it directly
  // No need to validate or format - SDK doesn't do that
  return { 
    source: isMainnet ? 'a' : 'b', 
    connectionId: hash as `0x${string}` // keccak256 returns hex string with 0x prefix
  };
}

// HyperliquidSignTransaction domain for approveAgent (uses Arbitrum chainId)
const approveAgentDomain = {
  name: 'HyperliquidSignTransaction',
  version: '1',
  chainId: ARBITRUM_CHAIN_ID, // Arbitrum chain ID (421614 for testnet, 42161 for mainnet)
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

// Get agent info from localStorage
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

// Save agent info to localStorage
function saveAgentToStorage(walletAddress: string, agentInfo: { privateKey: string; userAddress: string }): void {
  if (typeof window === 'undefined') return;
  const key = `hyperliquid_agent_${walletAddress}`;
  localStorage.setItem(key, JSON.stringify(agentInfo));
}

// Generate a new agent wallet
function generateAgentWallet(): { privateKey: string; address: string } {
  const wallet = Wallet.createRandom();
  return {
    privateKey: wallet.privateKey,
    address: wallet.address,
  };
}

export function LongBTCButton({ walletAddress }: LongBTCButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [sdk, setSdk] = useState<Hyperliquid | null>(null);
  const [btcPrice, setBtcPrice] = useState<string>('Loading...');
  const [orderSize, setOrderSize] = useState<string>('0.0005');
  const [leverage, setLeverage] = useState<number>(20);
  const [orderTab, setOrderTab] = useState<'market' | 'limit'>('market');
  const [limitOrderType, setLimitOrderType] = useState<'Gtc' | 'Ioc' | 'Alo'>('Gtc');
  const [limitPrice, setLimitPrice] = useState<string>('');
  const [lastNonce, setLastNonce] = useState<number>(0);
  const [perpsBalance, setPerpsBalance] = useState<string>('Loading...');
  const [spotBalance, setSpotBalance] = useState<string>('Loading...');
  const [accountValue, setAccountValue] = useState<string>('Loading...');
  const [isTradingEnabled, setIsTradingEnabled] = useState<boolean | null>(null);
  const { signTypedDataAsync } = useSignTypedData();

  // Generate unique nonce (similar to SDK's generateUniqueNonce)
  // IMPORTANT: Nonce must be an integer (no decimal places)
  const generateUniqueNonce = (): number => {
    const timestamp = Math.floor(Date.now()); // Ensure integer
    if (timestamp <= lastNonce) {
      const newNonce = lastNonce + 1;
      setLastNonce(newNonce);
      return newNonce;
    }
    setLastNonce(timestamp);
    return timestamp;
  };

  // Check localStorage immediately when component mounts or walletAddress changes
  useEffect(() => {
    if (walletAddress) {
      const agentInfo = getAgentFromStorage(walletAddress);
      if (!agentInfo) {
        // No agent in localStorage - trading is not enabled, show "Enable Trading" button
        console.log('No agent found in localStorage, trading is not enabled');
        setIsTradingEnabled(false);
      } else {
        console.log('Agent found in localStorage:', agentInfo);
        // Don't set to true yet, wait for account state check
      }
    }
  }, [walletAddress]);

  useEffect(() => {
    // Initialize Hyperliquid SDK (without private key - for info only)
    const initializeSDK = async () => {
      try {
        const hyperliquid = new Hyperliquid({
          testnet: TESTNET,
          enableWs: false, // Disable WS for now
          walletAddress: walletAddress,
        });

        await hyperliquid.connect();
        await hyperliquid.ensureInitialized();
        setSdk(hyperliquid);

        const normalizedWalletAddress = walletAddress.toLowerCase();

        // Get BTC price
        try {
          const allMids = await hyperliquid.info.getAllMids();
          // getAllMids returns an object: { "BTC-PERP": 50000, "ETH-PERP": 3000, ... }
          const btcPriceValue = allMids['BTC-PERP'] || allMids['BTC'];
          if (btcPriceValue) {
            setBtcPrice(`$${typeof btcPriceValue === 'number' ? (btcPriceValue as number).toFixed(2) : (parseFloat(String(btcPriceValue)) as number).toFixed(2)}`);
          }
        } catch (error) {
          console.error('Error fetching BTC price:', error);
          setBtcPrice('N/A');
        }

        // Check if agent is approved in localStorage
        const agentInfo = getAgentFromStorage(walletAddress);

        // Get Perps balance and account value - also check if trading is enabled
        // IMPORTANT: getClearinghouseState requires MASTER ACCOUNT address, not API wallet (agent wallet) address
        // API wallets are only for signing transactions, NOT for querying account data
        // If walletAddress is an API wallet, this will return empty/error even if trading is enabled
        // To query account data, you must use the master account or sub-account address
        try {
          const perpsState = await hyperliquid.info.perpetuals.getClearinghouseState(normalizedWalletAddress);
          console.log('Perps state:', perpsState);
          const withdrawable = parseFloat(perpsState.withdrawable || '0');
          const accountVal = parseFloat(perpsState.marginSummary?.accountValue || '0');
          setPerpsBalance(`$${withdrawable.toFixed(2)}`);
          setAccountValue(`$${accountVal.toFixed(2)}`);
          // If we can get clearinghouse state with data, trading is enabled
          // But only if agent is also approved in localStorage
          if (agentInfo) {
            setIsTradingEnabled(true);
          } else {
            // Agent not approved, even if account exists, need to approve agent first
            setIsTradingEnabled(false);
          }
        } catch (error: unknown) {
          console.error('Error fetching perps balance:', error);
          // If error is "User does not exist" or similar, could mean:
          // 1. Trading is not enabled (master account doesn't exist yet)
          // 2. walletAddress is an API wallet (agent wallet) - cannot query account data
          const errorMessage = (error as Error)?.message || (error as { response?: string })?.response || '';
          if (errorMessage.includes('does not exist') || errorMessage.includes('not found')) {
            // If no agent in localStorage, definitely not enabled
            if (!agentInfo) {
              setIsTradingEnabled(false);
            } else {
              // Has agent but account doesn't exist - might need to enable trading
              setIsTradingEnabled(false);
            }
          } else {
            // Other errors might mean trading is enabled but no balance
            // But still need agent approved
            if (agentInfo) {
              setIsTradingEnabled(true);
            } else {
              setIsTradingEnabled(false);
            }
          }
          setPerpsBalance('N/A');
          setAccountValue('N/A');
        }

        // Get Spot balance
        try {
          const spotState = await hyperliquid.info.spot.getSpotClearinghouseState(normalizedWalletAddress);
          // SpotClearinghouseState structure: { balances: [{ coin: string, hold: string, total: string }] }
          if (spotState && typeof spotState === 'object' && 'balances' in spotState) {
              const balances = (spotState as SpotClearinghouseState).balances || [];
            if (Array.isArray(balances) && balances.length > 0) {
              // Get USDC balance (usually the main currency)
              const usdcBalance = balances.find((bal: SpotClearinghouseState['balances'][number]) => 
                bal.coin === 'USDC' || bal.coin === 'USDC-SPOT'
              );
              
              if (usdcBalance && usdcBalance.total) {
                const total = parseFloat(usdcBalance.total);
                setSpotBalance(`$${total.toFixed(2)}`);
              } else {
                // If no USDC, show total count of tokens or first token
                const firstBalance = balances[0];
                if (firstBalance && firstBalance.total) {
                  setSpotBalance(`${firstBalance.coin}: ${parseFloat(firstBalance.total).toFixed(4)}`);
                } else {
                  setSpotBalance('$0.00');
                }
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
        // Cleanup will be handled by SDK's own lifecycle
      };
    }, [walletAddress]);

  const handleEnableTrading = async () => {
    // NOTE: This function ONLY enables trading (noop + approve agent)
    // It does NOT place any orders or call handleLongBTC
    // After enabling, the UI will show the "Long BTC 20x" button instead of "Enable Trading"
    // User must click "Long BTC 20x" button separately to place an order
    
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
      console.log('This function only enables trading, does NOT place orders');
      
      // Check if agent is already approved in localStorage
      let agentInfo = getAgentFromStorage(walletAddress);
      console.log("🚀 ~ handleEnableTrading ~ agentInfo:", agentInfo)
      
      // Step 1: Approve agent FIRST if not already approved
      if (!agentInfo) {
        console.log('Step 1: No agent found in localStorage, approving agent...');
        
        // Generate new agent wallet
        const agentWallet = generateAgentWallet();
        const agentAddress = agentWallet.address;
        
        // Create approve agent message
        const approveNonce = generateUniqueNonce();
        // For EIP-712 signing, nonce needs to be bigint for uint64 type
        // But we'll convert to number when sending to API
        const approveAgentMessage = {
          hyperliquidChain: TESTNET ? 'Testnet' : 'Mainnet',
          signatureChainId: `0x${ARBITRUM_CHAIN_ID.toString(16)}`, // Arbitrum chain ID in hex
          agentAddress, // Ensure proper type
          agentName: '',
          nonce: BigInt(approveNonce), // BigInt for EIP-712 uint64 type
          type: 'approveAgent',
        };
        
        console.log('Approve Agent message:', {
          hyperliquidChain: approveAgentMessage.hyperliquidChain,
          signatureChainId: approveAgentMessage.signatureChainId,
          agentAddress: approveAgentMessage.agentAddress,
          agentName: approveAgentMessage.agentName,
          nonce: approveNonce, // Log as number for readability
          type: approveAgentMessage.type,
        });
        
        // Sign approve agent message
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
        
        // Parse signature
        const approveSigHex = (isHex(approveSignature) ? approveSignature : `0x${approveSignature}`) as `0x${string}`;
        const parsedApproveSig = parseSignature(approveSigHex);
        const approveR = parsedApproveSig.r;
        const approveS = parsedApproveSig.s;
        let approveV = Number(parsedApproveSig.v);
        if (approveV === 0 || approveV === 1) {
          approveV += 27;
        }
        
        // Build approve agent payload
        // Convert BigInt nonce to number for API payload
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
        
        // Send approve agent request
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
        
        // Save agent info to localStorage
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
      console.log('Trading is now enabled. User can click "Long BTC 20x" button to place orders.');
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
    // Adjust leverage only, without placing order
    if (!walletAddress) {
      setStatus({
        type: 'error',
        message: 'Wallet address is required.',
      });
      return;
    }

    // Get agent info from localStorage (contains privateKey)
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
      // Create SDK instance with privateKey from localStorage
      const tradingSdk = new Hyperliquid({
        privateKey: agentInfo.privateKey,
        testnet: TESTNET,
        walletAddress: agentInfo.userAddress,
        enableWs: false,
      });

      await tradingSdk.connect();
      await tradingSdk.ensureInitialized();
      
      const coinSymbol = 'BTC-PERP';
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

  const handleLongBTC = async () => {
    // NOTE: This function places a Long BTC order using privateKey from localStorage
    // Uses SDK's placeOrder method directly (no manual signing needed)
    
    console.log('=== PLACE LONG BTC ORDER START ===');
    
    if (!walletAddress) {
      setStatus({
        type: 'error',
        message: 'Wallet address is required.',
      });
      return;
    }

    // Get agent info from localStorage (contains privateKey)
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
      console.log('=== PLACE LONG BTC ORDER START ===');
      console.log('agentInfo', agentInfo);
      // Create SDK instance with privateKey from localStorage
      // Use userAddress from agentInfo (master wallet address)
      const tradingSdk = new Hyperliquid({
        privateKey: agentInfo.privateKey,
        testnet: TESTNET,
        walletAddress: agentInfo.userAddress, // Master wallet address
        enableWs: false,
      });

      await tradingSdk.connect();
      await tradingSdk.ensureInitialized();
      
      // Get current BTC price
      const allMids = await tradingSdk.info.getAllMids();
      const btcPriceValue = allMids['BTC-PERP'] || allMids['BTC'];
      
      if (!btcPriceValue) {
        throw new Error('Could not fetch BTC price');
      }

      const currentPrice = typeof btcPriceValue === 'number' ? btcPriceValue : parseFloat(String(btcPriceValue));
      
      // Get metadata to find tick size for proper price rounding
      const [meta] = await tradingSdk.info.perpetuals.getMetaAndAssetCtxs();
      
      // Verify we're using perpetual market, not spot
      const coinSymbol = 'BTC-PERP'; // Must end with -PERP for perpetual
      console.log(`Placing order on perpetual market: ${coinSymbol}`);
      
      const assetIndex = await tradingSdk.symbolConversion.getAssetIndex(coinSymbol);
      if (assetIndex === undefined) {
        throw new Error(`Could not find asset index for ${coinSymbol}. Make sure it's a perpetual market.`);
      }
      
      console.log(`Asset index for ${coinSymbol}: ${assetIndex}`);
      
      // Find the asset in universe
      const asset = meta.universe[assetIndex];
      if (!asset) {
        throw new Error(`Could not find ${coinSymbol} in perpetual metadata`);
      }
      
      console.log(`Asset found in perpetual universe: ${asset.name}, maxLeverage: ${asset.maxLeverage}`);
      
      // For BTC-PERP, tick size is typically 1.0 (prices are whole numbers)
      // But let's check the current price format to determine tick size
      // If price has decimals, tick size might be 0.1 or 0.01
      // For safety, we'll use 1.0 as tick size (most common for BTC)
      const tickSize = 1.0; // BTC-PERP tick size is 1.0
      
      // Only calculate default limit price if needed (for limit orders without price)
      if (orderTab === 'limit' && (!limitPrice || parseFloat(limitPrice) <= 0)) {
        const rawLimitPrice = currentPrice * 0.99; // 1% below market for safety
        const defaultLimitPrice = Math.round(rawLimitPrice / tickSize) * tickSize; // Round to nearest tick
        setLimitPrice(String(defaultLimitPrice));
        console.log(`Current price: ${currentPrice}, Default limit: ${defaultLimitPrice} (tick size: ${tickSize})`);
      }
      
      // Step 1: Ensure user exists by calling noop action (same as limit order)
      // This prevents "user does not exist" error
      console.log('Ensuring user exists (noop action)...');
      try {
        await tradingSdk.exchange.noop();
        console.log('User exists confirmed');
      } catch (noopError) {
        console.warn('Noop action failed (user may already exist):', noopError);
        // Continue anyway as user might already exist
      }

      // Step 2: Set leverage using SDK (only works for perpetuals)
      console.log(`Setting leverage to ${leverage}x on perpetual market...`);
      await tradingSdk.exchange.updateLeverage(coinSymbol, 'isolated', leverage);
      console.log(`Leverage set to ${leverage}x successfully`);

      // Step 3: Validate order size
      const sizeNum = parseFloat(orderSize);
      if (isNaN(sizeNum) || sizeNum <= 0) {
        throw new Error('Please enter a valid order size');
      }

      // Step 4: Place order
      // IMPORTANT: coin must be 'BTC-PERP' (with -PERP suffix) for perpetual market
      // If it's just 'BTC', it might be interpreted as spot market
      console.log(`Placing LONG perpetual order on ${coinSymbol}...`);
      
      // Prepare order parameters - both market and limit use the same structure
      let finalLimitPrice: number;
      
      if (orderTab === 'market') {
        // Market order: Use FrontendMarket with aggressive price (slippage) to ensure match
        // For buy orders, use price slightly higher than market to ensure immediate match
        console.log('Placing MARKET order (FrontendMarket)...');
        // Add 0.5% slippage for buy orders to ensure match
        const slippageMultiplier = 1.005; // 0.5% above market price
        finalLimitPrice = currentPrice * slippageMultiplier;
        finalLimitPrice = Math.round(finalLimitPrice / tickSize) * tickSize;
        console.log(`Market order price: ${finalLimitPrice} (current: ${currentPrice}, slippage: +0.5%)`);
      } else {
        // Limit order: Use selected TIF (GTC, IOC, or ALO)
        console.log(`Placing LIMIT order (${limitOrderType})...`);
        if (limitPrice && parseFloat(limitPrice) > 0) {
          finalLimitPrice = parseFloat(limitPrice);
          finalLimitPrice = Math.round(finalLimitPrice / tickSize) * tickSize;
        } else {
          const rawLimitPrice = currentPrice * 0.99;
          finalLimitPrice = Math.round(rawLimitPrice / tickSize) * tickSize;
        }
      }
      
      // Both market and limit orders use the same placeOrder method
      // FrontendMarket is a special TIF type that SDK supports but may not be in TypeScript types
      const tifValue = orderTab === 'market' ? 'FrontendMarket' : limitOrderType;
      const orderParams = {
        coin: coinSymbol,
        is_buy: true,
        sz: sizeNum,
        limit_px: finalLimitPrice,
        order_type: { 
          limit: { 
            tif: tifValue
          } 
        },
        reduce_only: false,
      };
      
      console.log('Order params:', JSON.stringify(orderParams, null, 2));
      // Type assertion needed because FrontendMarket is not in TypeScript Tif type but SDK supports it
      const orderResult = await tradingSdk.exchange.placeOrder(orderParams as Parameters<typeof tradingSdk.exchange.placeOrder>[0]);
      
      console.log('Order response:', orderResult);

      if (orderResult.status === 'err') {
        const errorMsg = orderResult.response || 'Failed to place order';
        // Check if it's the "User does not exist" error
        if (errorMsg.includes('does not exist')) {
          throw new Error('Trading failed. Please check your balance and try again.');
        }
        throw new Error(errorMsg);
      }

      setStatus({
        type: 'success',
        message: `Order placed successfully! Status: ${JSON.stringify(orderResult.status)}`,
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

  return (
    <div className="w-full space-y-4">

      {/* Available to Trade */}
      <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
            Available to Trade:
          </span>
          <span className="text-lg font-bold text-indigo-900 dark:text-indigo-200">
            {perpsBalance}
          </span>
        </div>
      </div>

      {/* BTC Price */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
            BTC Price:
          </span>
          <span className="text-lg font-bold text-blue-900 dark:text-blue-200">
            {btcPrice}
          </span>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Leverage (x)
        </label>
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
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder="20"
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleAdjustLeverage}
            disabled={isLoading || !sdk || isTradingEnabled === false}
            className="flex-1 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-2 px-4 rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 disabled:transform-none disabled:cursor-not-allowed text-sm"
          >
            {isLoading ? 'Adjusting...' : 'Adjust Leverage'}
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Current leverage: {leverage}x
        </p>
      </div>

      {/* Order Type Tabs */}
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-1">
        <div className="flex space-x-1">
          <button
            onClick={() => setOrderTab('market')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              orderTab === 'market'
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Market
          </button>
          <button
            onClick={() => setOrderTab('limit')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              orderTab === 'limit'
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Limit
          </button>
        </div>
      </div>

      {/* Limit Order Type Selection (only show for Limit tab) */}
      {orderTab === 'limit' && (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Time in Force
          </label>
          <div className="flex space-x-3">
            <button
              onClick={() => setLimitOrderType('Gtc')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                limitOrderType === 'Gtc'
                  ? 'bg-green-500 text-white shadow-md'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              GTC
            </button>
            <button
              onClick={() => setLimitOrderType('Ioc')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                limitOrderType === 'Ioc'
                  ? 'bg-green-500 text-white shadow-md'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              IOC
            </button>
            <button
              onClick={() => setLimitOrderType('Alo')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                limitOrderType === 'Alo'
                  ? 'bg-green-500 text-white shadow-md'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              ALO
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {limitOrderType === 'Gtc' && 'Good Till Cancel - Order stays active until filled or cancelled'}
            {limitOrderType === 'Ioc' && 'Immediate Or Cancel - Order executes immediately or is cancelled'}
            {limitOrderType === 'Alo' && 'Allow Liquidation Only - Order only fills if it would liquidate'}
          </p>
        </div>
      )}

      {/* Limit Price Input (only show for Limit tab) */}
      {orderTab === 'limit' && (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Limit Price (USDC)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            disabled={isLoading}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Enter limit price"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => {
                const currentPriceNum = parseFloat(String(btcPrice).replace(/[^0-9.]/g, ''));
                if (!isNaN(currentPriceNum)) {
                  setLimitPrice(String(Math.round(currentPriceNum * 0.99))); // 1% below market
                }
              }}
              className="text-xs px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              -1%
            </button>
            <button
              onClick={() => {
                const currentPriceNum = parseFloat(String(btcPrice).replace(/[^0-9.]/g, ''));
                if (!isNaN(currentPriceNum)) {
                  setLimitPrice(String(Math.round(currentPriceNum)));
                }
              }}
              className="text-xs px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Market
            </button>
            <button
              onClick={() => {
                const currentPriceNum = parseFloat(String(btcPrice).replace(/[^0-9.]/g, ''));
                if (!isNaN(currentPriceNum)) {
                  setLimitPrice(String(Math.round(currentPriceNum * 1.01))); // 1% above market
                }
              }}
              className="text-xs px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              +1%
            </button>
          </div>
        </div>
      )}

      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Order Size (BTC)
        </label>
        <input
          type="number"
          step="0.0001"
          min="0.0001"
          value={orderSize}
          onChange={(e) => setOrderSize(e.target.value)}
          disabled={isLoading}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder="0.0005"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Current size: {orderSize} BTC
        </p>
      </div>

      {/* Show Enable Trading button only if we know trading is not enabled */}
      {/* If isTradingEnabled is null, we don't know (could be API wallet), so show Long button */}
      {isTradingEnabled === false ? (
        <button
          onClick={handleEnableTrading}
          disabled={isLoading || !sdk}
          className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-4 px-6 rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 disabled:transform-none disabled:cursor-not-allowed"
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
          onClick={handleLongBTC}
          disabled={isLoading || !sdk}
          className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-4 px-6 rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 disabled:transform-none disabled:cursor-not-allowed"
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
              ? 'Long BTC Market (FrontendMarket)' 
              : `Long BTC Limit (${limitOrderType})`
          )}
        </button>
      )}

      {status && (
        <div
          className={`p-4 rounded-lg ${
            status.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              : status.type === 'error'
              ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
              : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
          }`}
        >
          <p
            className={`text-sm ${
              status.type === 'success'
                ? 'text-green-800 dark:text-green-200'
                : status.type === 'error'
                ? 'text-red-800 dark:text-red-200'
                : 'text-blue-800 dark:text-blue-200'
            }`}
          >
            {status.message}
          </p>
        </div>
      )}

      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
        <p className="text-xs text-yellow-800 dark:text-yellow-200">
          ⚠️ <strong>Warning:</strong> This will place a real order on Hyperliquid mainnet. 
          Make sure you have sufficient balance and understand the risks of leveraged trading.
        </p>
      </div>
    </div>
  );
}

