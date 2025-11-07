'use client';

import { useMemo } from 'react';
import { SkeletonBox, SkeletonCircle, SkeletonText } from './Skeleton';
import { useAllAssets, useAllMids } from '../hooks/useHyperliquidQueries';

interface TokenSidebarProps {
  selectedCoin: string;
  setSelectedCoin: (coin: string) => void;
  sdk: any; // Keep for compatibility, but we use React Query now
}

export function TokenSidebar({ selectedCoin, setSelectedCoin }: TokenSidebarProps) {
  const { data: allAssets, isLoading: isLoadingAssets } = useAllAssets();
  const { data: allMids, isLoading: isLoadingMids } = useAllMids();

  const tokens = useMemo(() => {
    if (!allAssets || !allMids) return [];
    const perpCoinNames = allAssets.perp || [];
    return perpCoinNames.slice(0, 10).map((name: string) => {
      const coin = name.includes('-PERP') ? name : `${name}-PERP`;
      return {
        name: coin,
        change: 0, // Simplified - would need 24h data
      };
    });
  }, [allAssets, allMids]);

  const isLoading = isLoadingAssets || isLoadingMids;

  return (
    <div className="w-[80px] h-full bg-[#0C130F] flex flex-col items-center py-2 border-r border-[#1b1b1b] overflow-y-auto flex-shrink-0 scrollbar-thin">
      {isLoading ? (
        Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="w-full px-2 py-3 flex flex-col items-center gap-2">
            <SkeletonCircle size={32} />
            <SkeletonText width={40} height={12} />
            <SkeletonText width={30} height={10} />
          </div>
        ))
      ) : tokens.length > 0 ? (
        tokens.map((token) => {
          const isSelected = selectedCoin === token.name;
          const coinDisplay = token.name.replace('-PERP', '');
          const isPositive = token.change >= 0;

          return (
            <button
              key={token.name}
              onClick={() => setSelectedCoin(token.name)}
              className={`w-full px-2 py-3 flex flex-col items-center gap-1 hover:bg-[#1b1b1b] transition-colors ${
                isSelected ? 'bg-[#1b1b1b] border-l-2 border-[#03c987]' : ''
              }`}
            >
              <div className="w-8 h-8 bg-[#1b1b1b] rounded-full flex items-center justify-center">
                <span className="text-xs font-bold text-[#c0c0c0]">
                  {coinDisplay.charAt(0)}
                </span>
              </div>
              <span className={`text-xs font-medium ${isSelected ? 'text-[#c0c0c0]' : 'text-[#888]'}`}>
                {coinDisplay}
              </span>
              <span className={`text-xs ${isPositive ? 'text-[#03c987]' : 'text-[#ff4d4f]'}`}>
                {isPositive ? '+' : ''}{token.change.toFixed(2)}%
              </span>
            </button>
          );
        })
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-[#888] text-xs">
          <p>No tokens</p>
        </div>
      )}
    </div>
  );
}

