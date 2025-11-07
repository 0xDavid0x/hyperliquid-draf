'use client';

import { useState, useEffect, useMemo } from 'react';
import { Skeleton, SkeletonText, SkeletonPrice } from './Skeleton';
import { useAllMids, useCandleSnapshot, useMetaAndAssetCtxs, useAssetIndex } from '../hooks/useHyperliquidQueries';

interface PairInfoBarProps {
  selectedCoin: string;
  setSelectedCoin: (coin: string) => void;
}

export function PairInfoBar({ selectedCoin, setSelectedCoin }: PairInfoBarProps) {
  const [fundingCountdown, setFundingCountdown] = useState<string>('');

  // React Query hooks
  const { data: allMids, isLoading: isLoadingMids } = useAllMids();
  const { data: assetIndexData } = useAssetIndex(selectedCoin);
  const { data: metaAndAssetCtxs } = useMetaAndAssetCtxs();

  // Calculate 24h change
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  const coinSymbol = selectedCoin.includes('-PERP') ? selectedCoin : `${selectedCoin}-PERP`;
  const { data: candles, isLoading: isLoadingCandles } = useCandleSnapshot(coinSymbol, '1h', oneDayAgo, now);

  // Calculate current price from allMids
  const currentPrice = useMemo(() => {
    if (!allMids) return null;
    const coinPriceValue = allMids[selectedCoin] || allMids[selectedCoin.replace('-PERP', '')];
    if (!coinPriceValue) return null;
    const price = typeof coinPriceValue === 'number' ? coinPriceValue : parseFloat(String(coinPriceValue));
    return price.toFixed(2);
  }, [allMids, selectedCoin]);

  // Calculate 24h change from candles
  const change24h = useMemo(() => {
    if (!candles || !Array.isArray(candles) || candles.length === 0) return null;
    const sortedCandles = [...candles].sort((a, b) => a.t - b.t);
    const firstPrice = parseFloat(String(sortedCandles[0].c));
    const lastPrice = parseFloat(String(sortedCandles[sortedCandles.length - 1].c));
    if (firstPrice > 0) {
      return ((lastPrice - firstPrice) / firstPrice) * 100;
    }
    return null;
  }, [candles]);

  // Get mark price, index price, and funding rate from asset contexts
  const { markPrice, indexPrice, fundingRate } = useMemo(() => {
    if (!metaAndAssetCtxs || assetIndexData === undefined || assetIndexData === null) {
      return { markPrice: '-', indexPrice: '-', fundingRate: '-' };
    }

    const [meta, assetCtxs] = metaAndAssetCtxs;
    const ctx = assetCtxs?.[assetIndexData];

    if (!ctx) {
      return { markPrice: '-', indexPrice: '-', fundingRate: '-' };
    }

    const mark = ctx.markPx ? parseFloat(ctx.markPx).toFixed(2) : '-';
    const index = ctx.oraclePx ? parseFloat(ctx.oraclePx).toFixed(2) : '-';
    const funding = ctx.funding ? `${(parseFloat(ctx.funding) * 100).toFixed(4)}%` : '-';

    return { markPrice: mark, indexPrice: index, fundingRate: funding };
  }, [metaAndAssetCtxs, assetIndexData]);

  // Calculate funding countdown (next funding in 8 hours)
  useEffect(() => {
    const updateCountdown = () => {
      const nowMs = Date.now();
      const nextFunding = new Date(nowMs);
      nextFunding.setHours(Math.ceil(nextFunding.getHours() / 8) * 8, 0, 0, 0);
      const diff = nextFunding.getTime() - nowMs;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setFundingCountdown(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  const isLoading = isLoadingMids || isLoadingCandles;

  const isPositive = change24h !== null && change24h >= 0;
  const coinDisplay = selectedCoin.replace('-PERP', '-USDC');

  return (
    <div className="fixed top-14 left-0 right-0 h-12 bg-[#0C130F] border-b border-[#1b1b1b] flex items-center justify-start gap-6 px-6 text-sm text-[#c0c0c0] z-40">
      {/* Left - Token icon + Pair name + dropdown + favorite */}
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 bg-[#1b1b1b] rounded-full flex items-center justify-center">
          <span className="text-xs font-bold text-[#c0c0c0]">
            {selectedCoin.charAt(0)}
          </span>
        </div>
        <span className="font-semibold text-[#c0c0c0]">{coinDisplay}</span>
        <button className="text-[#888] hover:text-[#c0c0c0]">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>
      </div>

      {/* Center - Giá hiện tại + Change + Mark + Index + 24h Vol */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          {isLoading || currentPrice === null ? (
            <SkeletonPrice width={60} />
          ) : (
            <span className="font-semibold text-[#c0c0c0]">${currentPrice}</span>
          )}
          {isLoading || change24h === null ? (
            <SkeletonPrice width={50} />
          ) : (
            <span className={`text-xs font-medium ${isPositive ? 'text-[#03c987]' : 'text-[#ff4d4f]'}`}>
              {isPositive ? '+' : ''}{change24h.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-[#888] text-xs">
          {isLoading ? (
            <>
              <SkeletonPrice width={70} />
              <SkeletonPrice width={70} />
            </>
          ) : (
            <>
              <span>Mark: {markPrice ? `$${markPrice}` : '-'}</span>
              <span>Index: {indexPrice}</span>
            </>
          )}
        </div>
      </div>

      {/* Right - Funding rate + Countdown */}
      <div className="flex items-center gap-3 text-xs">
        {isLoading ? (
          <>
            <SkeletonPrice width={70} />
            <SkeletonPrice width={60} />
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[#888]">Funding:</span>
              <span className="text-[#c0c0c0]">{fundingRate}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#888]">in</span>
              <span className="text-[#c0c0c0] font-mono">{fundingCountdown}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

