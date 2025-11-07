'use client';

import { useState, useEffect } from 'react';
import { useSignTypedData } from 'wagmi';
import { parseSignature, isHex } from 'viem';
import { SpotToken } from 'hyperliquid';
import { useHyperliquid } from '../contexts/HyperliquidContext';
import { SkeletonBalance, SkeletonText } from './Skeleton';
import { useSpotMeta, useClearinghouseState, useSpotClearinghouseState } from '../hooks/useHyperliquidQueries';

interface SendTokensProps {
  walletAddress: string;
}

const TESTNET = true; // Set to true for testnet

// Arbitrum chain IDs for userSignedAction (different from phantomDomain)
const ARBITRUM_CHAIN_ID = TESTNET ? 421614 : 42161;
const ARBITRUM_CHAIN_ID_HEX = TESTNET ? '0x66eee' : '0xa4b1';

type AccountType = 'perps' | 'spot';

export function SendTokens({ walletAddress }: SendTokensProps) {
  const { readOnlySdk } = useHyperliquid();
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [accountType, setAccountType] = useState<AccountType>('perps');
  const [destination, setDestination] = useState<string>('0x9777d8503bc6f7f485c8a6f4d3afcbeed548153a');
  const [amount, setAmount] = useState<string>('');
  const [selectedToken, setSelectedToken] = useState<string>('');
  const { signTypedDataAsync } = useSignTypedData();

  // React Query hooks
  const { data: spotMeta, isLoading: isLoadingSpotMeta } = useSpotMeta(accountType === 'spot');
  const { data: perpsState, isLoading: isLoadingPerpsBalance } = useClearinghouseState(
    walletAddress, 
    accountType === 'perps'
  );
  const { data: spotState, isLoading: isLoadingSpotBalance } = useSpotClearinghouseState(
    walletAddress,
    accountType === 'spot' && !!selectedToken
  );

  // Extract spot tokens from spotMeta
  const spotTokens = spotMeta?.tokens?.map((token: SpotToken) => ({
    name: token.name,
    tokenId: token.tokenId,
  })) || [];

  // Set default selected token when spot tokens are loaded
  useEffect(() => {
    if (accountType === 'spot' && spotTokens.length > 0 && !selectedToken) {
      const usdc = spotTokens.find((t: { name: string; tokenId: string }) => t.name === 'USDC');
      if (usdc) {
        setSelectedToken(`${usdc.name}:${usdc.tokenId}`);
      } else {
        setSelectedToken(`${spotTokens[0].name}:${spotTokens[0].tokenId}`);
      }
    } else if (accountType !== 'spot') {
      setSelectedToken('');
    }
  }, [accountType, spotTokens, selectedToken]);

  // Calculate max available balance
  const maxAvailable = (() => {
    if (accountType === 'perps') {
      if (isLoadingPerpsBalance) return null;
      if (!perpsState) return 'N/A';
      const withdrawable = parseFloat(perpsState.withdrawable || '0');
      return withdrawable.toFixed(4);
    } else {
      if (isLoadingSpotBalance) return null;
      if (!selectedToken) return 'Select token';
      if (!spotState || typeof spotState !== 'object' || !('balances' in spotState)) {
        return '0.0000';
      }
      const balances = (spotState as { balances: Array<{ coin: string; total: string }> }).balances || [];
      const tokenName = selectedToken.split(':')[0];
      const tokenBalance = balances.find((bal: { coin: string; total: string }) => 
        bal.coin === tokenName || bal.coin === `${tokenName}-SPOT`
      );
      if (tokenBalance && tokenBalance.total) {
        return parseFloat(tokenBalance.total).toFixed(4);
      }
      return '0.0000';
    }
  })();

  const isLoadingBalance = accountType === 'perps' ? isLoadingPerpsBalance : isLoadingSpotBalance;

  const handleSend = async () => {
    if (!readOnlySdk) {
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
      await readOnlySdk.ensureInitialized();

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
      <div className="space-y-4">
        <p className="text-sm text-[#888] mb-4">
          Transfer tokens to another account on Hyperliquid L1
        </p>

        {/* Account Type Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-[#c0c0c0] mb-2">
            Account Type
          </label>
          <div className="flex gap-3">
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                value="perps"
                checked={accountType === 'perps'}
                onChange={(e) => setAccountType(e.target.value as AccountType)}
                className="mr-2 w-4 h-4 text-[#03c987] focus:ring-[#03c987] focus:ring-offset-0 bg-[#1b1b1b] border-[#1b1b1b]"
              />
              <span className="text-sm text-[#c0c0c0]">Perps Account (USDC)</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                value="spot"
                checked={accountType === 'spot'}
                onChange={(e) => setAccountType(e.target.value as AccountType)}
                className="mr-2 w-4 h-4 text-[#03c987] focus:ring-[#03c987] focus:ring-offset-0 bg-[#1b1b1b] border-[#1b1b1b]"
              />
              <span className="text-sm text-[#c0c0c0]">Spot Account</span>
            </label>
          </div>
        </div>

        {/* Spot Token Selection */}
        {accountType === 'spot' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-[#c0c0c0] mb-2">
              Token
            </label>
            <select
              value={selectedToken}
              onChange={(e) => setSelectedToken(e.target.value)}
              className="w-full px-4 py-2 border border-[#1b1b1b] rounded-lg bg-[#1b1b1b] text-[#c0c0c0] focus:ring-2 focus:ring-[#03c987] focus:border-[#03c987] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={spotTokens.length === 0}
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
          <label className="block text-sm font-medium text-[#c0c0c0] mb-2">
            Destination Address
          </label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="0x..."
            disabled={isLoading}
            className="w-full px-4 py-2 border border-[#1b1b1b] rounded-lg bg-[#1b1b1b] text-[#c0c0c0] focus:ring-2 focus:ring-[#03c987] focus:border-[#03c987] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed font-mono text-sm placeholder-[#888]"
          />
        </div>

        {/* Amount */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-[#c0c0c0]">
              Amount
            </label>
            {!isLoadingBalance && maxAvailable !== null && maxAvailable !== 'N/A' && maxAvailable !== 'Select token' && (
              <button
                type="button"
                onClick={() => setAmount(maxAvailable)}
                className="text-xs text-[#03c987] hover:text-[#02b877] font-medium underline transition-colors"
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
            className="w-full px-4 py-2 border border-[#1b1b1b] rounded-lg bg-[#1b1b1b] text-[#c0c0c0] focus:ring-2 focus:ring-[#03c987] focus:border-[#03c987] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed placeholder-[#888]"
          />
          {isLoadingBalance ? (
            <div className="mt-1">
              <SkeletonText width={120} height={12} />
            </div>
          ) : maxAvailable !== null && maxAvailable !== 'N/A' && maxAvailable !== 'Select token' ? (
            <p className="text-xs text-[#888] mt-1">
              Available: {maxAvailable} {accountType === 'perps' ? 'USDC' : selectedToken.split(':')[0]}
            </p>
          ) : null}
        </div>

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={isLoading || !readOnlySdk}
          className="w-full bg-[#03c987] hover:bg-[#02b877] disabled:bg-[#1b1b1b] disabled:hover:bg-[#1b1b1b] text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
                ? 'bg-[#064E3B]/30 border border-[#03c987]/50'
                : status.type === 'error'
                ? 'bg-red-900/30 border border-red-500/50'
                : 'bg-blue-900/30 border border-blue-500/50'
            }`}
          >
            <p
              className={`text-sm ${
                status.type === 'success'
                  ? 'text-[#03c987]'
                  : status.type === 'error'
                  ? 'text-[#ff4d4f]'
                  : 'text-blue-400'
              }`}
            >
              {status.message}
            </p>
          </div>
        )}

        {/* Warning */}
        <div className="mt-4 bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-3">
          <p className="text-xs text-yellow-400">
            ⚠️ <strong>Warning:</strong> This will send real tokens on Hyperliquid. 
            Make sure the destination address is correct and you have sufficient balance.
          </p>
        </div>
      </div>
    </div>
  );
}

