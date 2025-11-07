'use client';

import { useState, useEffect } from 'react';
import { useSignTypedData } from 'wagmi';
import { parseSignature, isHex } from 'viem';
import { Hyperliquid, SpotToken } from 'hyperliquid';

interface SendTokensProps {
  walletAddress: string;
}

const TESTNET = true; // Set to true for testnet

// Arbitrum chain IDs for userSignedAction (different from phantomDomain)
const ARBITRUM_CHAIN_ID = TESTNET ? 421614 : 42161;
const ARBITRUM_CHAIN_ID_HEX = TESTNET ? '0x66eee' : '0xa4b1';

type AccountType = 'perps' | 'spot';

export function SendTokens({ walletAddress }: SendTokensProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [sdk, setSdk] = useState<Hyperliquid | null>(null);
  const [accountType, setAccountType] = useState<AccountType>('perps');
  const [destination, setDestination] = useState<string>('0x9777d8503bc6f7f485c8a6f4d3afcbeed548153a');
  const [amount, setAmount] = useState<string>('');
  const [spotTokens, setSpotTokens] = useState<Array<{ name: string; tokenId: string }>>([]);
  const [selectedToken, setSelectedToken] = useState<string>('');
  const [maxAvailable, setMaxAvailable] = useState<string>('Loading...');
  const { signTypedDataAsync } = useSignTypedData();

  // Initialize SDK once
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
  }, [walletAddress]);

  // Load spot tokens and balances when spot account is selected
  useEffect(() => {
    const loadSpotTokens = async () => {
      if (!sdk || accountType !== 'spot') {
        setSpotTokens([]);
        setSelectedToken('');
        return;
      }

      try {
        const spotMeta = await sdk.info.spot.getSpotMeta();
        const tokens = spotMeta.tokens.map((token: SpotToken) => ({
          name: token.name,
          tokenId: token.tokenId,
        }));
        setSpotTokens(tokens);
        if (tokens.length > 0) {
          // Default to USDC if available
          const usdc = tokens.find((t: { name: string; tokenId: string }) => t.name === 'USDC');
          if (usdc) {
            setSelectedToken(`${usdc.name}:${usdc.tokenId}`);
          } else {
            setSelectedToken(`${tokens[0].name}:${tokens[0].tokenId}`);
          }
        }
      } catch (error) {
        console.error('Error fetching spot tokens:', error);
        setStatus({
          type: 'error',
          message: 'Failed to load spot tokens',
        });
      }
    };

    loadSpotTokens();
  }, [sdk, accountType]);

  // Load available balance
  useEffect(() => {
    const loadBalance = async () => {
      if (!sdk || !walletAddress) {
        setMaxAvailable('Loading...');
        return;
      }

      try {
        const normalizedWalletAddress = walletAddress.toLowerCase();

        if (accountType === 'perps') {
          // Get Perps balance (withdrawable USDC)
          const perpsState = await sdk.info.perpetuals.getClearinghouseState(normalizedWalletAddress);
          const withdrawable = parseFloat(perpsState.withdrawable || '0');
          setMaxAvailable(withdrawable.toFixed(4));
        } else {
          // Get Spot balance for selected token
          if (!selectedToken) {
            setMaxAvailable('Select token');
            return;
          }

          const spotState = await sdk.info.spot.getSpotClearinghouseState(normalizedWalletAddress);
          if (spotState && typeof spotState === 'object' && 'balances' in spotState) {
            const balances = (spotState as { balances: Array<{ coin: string; total: string }> }).balances || [];
            const tokenName = selectedToken.split(':')[0];
            const tokenBalance = balances.find((bal: { coin: string; total: string }) => bal.coin === tokenName || bal.coin === `${tokenName}-SPOT`);
            
            if (tokenBalance && tokenBalance.total) {
              const total = parseFloat(tokenBalance.total);
              setMaxAvailable(total.toFixed(4));
            } else {
              setMaxAvailable('0.0000');
            }
          } else {
            setMaxAvailable('0.0000');
          }
        }
      } catch (error) {
        console.error('Error fetching balance:', error);
        setMaxAvailable('N/A');
      }
    };

    loadBalance();
  }, [sdk, walletAddress, accountType, selectedToken]);

  const handleSend = async () => {
    if (!sdk) {
      setStatus({
        type: 'error',
        message: 'SDK not initialized. Please refresh the page.',
      });
      return;
    }

    if (!destination || !amount) {
      setStatus({
        type: 'error',
        message: 'Please fill in all fields.',
      });
      return;
    }

    // Validate destination address
    if (!destination.startsWith('0x') || destination.length !== 42) {
      setStatus({
        type: 'error',
        message: 'Invalid destination address. Must be a valid Ethereum address.',
      });
      return;
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setStatus({
        type: 'error',
        message: 'Please enter a valid amount.',
      });
      return;
    }

    // For spot, validate token selection
    if (accountType === 'spot' && !selectedToken) {
      setStatus({
        type: 'error',
        message: 'Please select a token.',
      });
      return;
    }

    setIsLoading(true);
    setStatus(null);

    try {
      await sdk.ensureInitialized();

      const normalizedDestination = destination.toLowerCase();
      const isMainnet = !TESTNET;
      const time = Date.now();

      if (accountType === 'perps') {
        // USD Transfer (Perps Account)
        const action = {
          type: 'usdSend',
          hyperliquidChain: isMainnet ? 'Mainnet' : 'Testnet',
          signatureChainId: ARBITRUM_CHAIN_ID_HEX,
          destination: normalizedDestination,
          amount: amountNum.toString(),
          time: time,
        };

        // Sign using signUserSignedAction format
        const domain = {
          name: 'HyperliquidSignTransaction',
          version: '1',
          chainId: ARBITRUM_CHAIN_ID,
          verifyingContract: '0x0000000000000000000000000000000000000000' as const,
        };

        const types = {
          'HyperliquidTransaction:UsdSend': [
            { name: 'hyperliquidChain', type: 'string' },
            { name: 'destination', type: 'string' },
            { name: 'amount', type: 'string' },
            { name: 'time', type: 'uint64' },
          ],
        };

        const signature = await signTypedDataAsync({
          domain,
          types,
          primaryType: 'HyperliquidTransaction:UsdSend',
          message: action,
        });

        // Parse signature
        const sigHex = (isHex(signature) ? signature : `0x${signature}`) as `0x${string}`;
        const parsedSig = parseSignature(sigHex);
        const r = parsedSig.r;
        const s = parsedSig.s;
        let v = Number(parsedSig.v);
        if (v === 0 || v === 1) {
          v += 27;
        }

        const payload = {
          action,
          nonce: time,
          signature: { r, s, v },
        };

        console.log('USD Transfer payload:', JSON.stringify(payload, null, 2));

        const response = await fetch(
          TESTNET ? 'https://api.hyperliquid-testnet.xyz/exchange' : 'https://api.hyperliquid.xyz/exchange',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );

        const result = await response.json();
        console.log('USD Transfer response:', result);

        if (!response.ok) {
          throw new Error(result.response || result.message || 'Failed to send USD');
        }

        setStatus({
          type: 'success',
          message: `Successfully sent ${amount} USDC to ${destination.slice(0, 6)}...${destination.slice(-4)}`,
        });
      } else {
        // Spot Transfer
        const action = {
          type: 'spotSend',
          hyperliquidChain: isMainnet ? 'Mainnet' : 'Testnet',
          signatureChainId: ARBITRUM_CHAIN_ID_HEX,
          destination: normalizedDestination,
          token: selectedToken, // Format: "TOKEN_NAME:TOKEN_ADDRESS"
          amount: amountNum.toString(),
          time: time,
        };

        // Sign using signUserSignedAction format for spot
        const domain = {
          name: 'HyperliquidSignTransaction',
          version: '1',
          chainId: ARBITRUM_CHAIN_ID,
          verifyingContract: '0x0000000000000000000000000000000000000000' as const,
        };

        const types = {
          'HyperliquidTransaction:SpotSend': [
            { name: 'hyperliquidChain', type: 'string' },
            { name: 'destination', type: 'string' },
            { name: 'token', type: 'string' },
            { name: 'amount', type: 'string' },
            { name: 'time', type: 'uint64' },
          ],
        };

        const signature = await signTypedDataAsync({
          domain,
          types,
          primaryType: 'HyperliquidTransaction:SpotSend',
          message: action,
        });

        // Parse signature
        const sigHex = (isHex(signature) ? signature : `0x${signature}`) as `0x${string}`;
        const parsedSig = parseSignature(sigHex);
        const r = parsedSig.r;
        const s = parsedSig.s;
        let v = Number(parsedSig.v);
        if (v === 0 || v === 1) {
          v += 27;
        }

        const payload = {
          action,
          nonce: time,
          signature: { r, s, v },
        };

        console.log('Spot Transfer payload:', JSON.stringify(payload, null, 2));

        const response = await fetch(
          TESTNET ? 'https://api.hyperliquid-testnet.xyz/exchange' : 'https://api.hyperliquid.xyz/exchange',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );

        const result = await response.json();
        console.log('Spot Transfer response:', result);

        if (!response.ok) {
          throw new Error(result.response || result.message || 'Failed to send spot tokens');
        }

        const tokenName = selectedToken.split(':')[0];
        setStatus({
          type: 'success',
          message: `Successfully sent ${amount} ${tokenName} to ${destination.slice(0, 6)}...${destination.slice(-4)}`,
        });
      }

      // Clear form on success
      setDestination('');
      setAmount('');
    } catch (error: unknown) {
      console.error('Error sending tokens:', error);
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to send tokens. Please check your balance and try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6">
        <h2 className="text-xl font-bold text-purple-900 dark:text-purple-200 mb-4">
          Send Tokens
        </h2>
        <p className="text-sm text-purple-700 dark:text-purple-300 mb-4">
          Transfer tokens to another account on Hyperliquid L1
        </p>

        {/* Account Type Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Account Type
          </label>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="perps"
                checked={accountType === 'perps'}
                onChange={(e) => setAccountType(e.target.value as AccountType)}
                className="mr-2"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Perps Account (USDC)</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="spot"
                checked={accountType === 'spot'}
                onChange={(e) => setAccountType(e.target.value as AccountType)}
                className="mr-2"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Spot Account</span>
            </label>
          </div>
        </div>

        {/* Spot Token Selection */}
        {accountType === 'spot' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Token
            </label>
            <select
              value={selectedToken}
              onChange={(e) => setSelectedToken(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {spotTokens.length === 0 ? (
                <option value="">Loading tokens...</option>
              ) : (
                spotTokens.map((token) => (
                  <option key={token.tokenId} value={`${token.name}:${token.tokenId}`}>
                    {token.name}
                  </option>
                ))
              )}
            </select>
          </div>
        )}

        {/* Destination Address */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Destination Address
          </label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="0x..."
            disabled={isLoading}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed font-mono text-sm"
          />
        </div>

        {/* Amount */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Amount
            </label>
            {maxAvailable !== 'Loading...' && maxAvailable !== 'N/A' && maxAvailable !== 'Select token' && (
              <button
                type="button"
                onClick={() => setAmount(maxAvailable)}
                className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium underline"
              >
                Max: {maxAvailable} {accountType === 'perps' ? 'USDC' : selectedToken.split(':')[0]}
              </button>
            )}
          </div>
          <input
            type="number"
            step="0.0001"
            min="0.0001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            disabled={isLoading}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {maxAvailable !== 'Loading...' && maxAvailable !== 'N/A' && maxAvailable !== 'Select token' && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Available: {maxAvailable} {accountType === 'perps' ? 'USDC' : selectedToken.split(':')[0]}
            </p>
          )}
        </div>

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={isLoading || !sdk}
          className="w-full bg-[#00C4B4] hover:bg-[#00B8A8] disabled:bg-gray-400 disabled:hover:bg-gray-500 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 disabled:transform-none disabled:cursor-not-allowed"
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
              Sending...
            </span>
          ) : (
            `Send ${accountType === 'perps' ? 'USDC' : 'Token'}`
          )}
        </button>

        {/* Status Message */}
        {status && (
          <div
            className={`mt-4 p-4 rounded-lg ${
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

        {/* Warning */}
        <div className="mt-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
          <p className="text-xs text-yellow-800 dark:text-yellow-200">
            ⚠️ <strong>Warning:</strong> This will send real tokens on Hyperliquid. 
            Make sure the destination address is correct and you have sufficient balance.
          </p>
        </div>
      </div>
    </div>
  );
}

