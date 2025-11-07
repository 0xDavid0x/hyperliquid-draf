'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useHyperliquid } from '../contexts/HyperliquidContext';

// Query Keys Factory
export const queryKeys = {
  allMids: ['hyperliquid', 'allMids'] as const,
  allAssets: ['hyperliquid', 'allAssets'] as const,
  candleSnapshot: (coin: string, interval: string) =>
    ['hyperliquid', 'candleSnapshot', coin, interval] as const,
  metaAndAssetCtxs: ['hyperliquid', 'metaAndAssetCtxs'] as const,
  assetIndex: (coin: string) => ['hyperliquid', 'assetIndex', coin] as const,
  clearinghouseState: (address: string) => ['hyperliquid', 'clearinghouseState', address] as const,
  spotClearinghouseState: (address: string) => ['hyperliquid', 'spotClearinghouseState', address] as const,
  userOpenOrders: (address: string) => ['hyperliquid', 'userOpenOrders', address] as const,
  userTwapSliceFills: (address: string) => ['hyperliquid', 'userTwapSliceFills', address] as const,
  userFillsByTime: (address: string, startTime: number, endTime: number) =>
    ['hyperliquid', 'userFillsByTime', address, startTime, endTime] as const,
  userFunding: (address: string, startTime: number, endTime: number) => 
    ['hyperliquid', 'userFunding', address, startTime, endTime] as const,
  historicalOrders: (address: string) => ['hyperliquid', 'historicalOrders', address] as const,
  spotMeta: ['hyperliquid', 'spotMeta'] as const,
};

// Get all mids (prices)
export function useAllMids() {
  const { readOnlySdk } = useHyperliquid();

  return useQuery({
    queryKey: queryKeys.allMids,
    queryFn: async () => {
      if (!readOnlySdk) throw new Error('SDK not initialized');
      return await readOnlySdk.info.getAllMids();
    },
    enabled: !!readOnlySdk,
    staleTime: 1000 * 10, // 10 seconds - prices change frequently
    refetchInterval: 1000 * 15, // Refetch every 15 seconds
  });
}

// Get all assets
export function useAllAssets() {
  const { readOnlySdk } = useHyperliquid();

  return useQuery({
    queryKey: queryKeys.allAssets,
    queryFn: async () => {
      if (!readOnlySdk) throw new Error('SDK not initialized');
      return await readOnlySdk.info.getAllAssets();
    },
    enabled: !!readOnlySdk,
    staleTime: 1000 * 60 * 5, // 5 minutes - assets don't change often
  });
}

// Get candle snapshot
export function useCandleSnapshot(
  coin: string,
  interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d',
  enabled: boolean = true
) {
  const { readOnlySdk } = useHyperliquid();

  return useQuery({
    // Query key only includes coin and interval - completely stable
    queryKey: queryKeys.candleSnapshot(coin, interval),
    queryFn: async () => {
      if (!readOnlySdk) throw new Error('SDK not initialized');
      await readOnlySdk.ensureInitialized();
      
      // Calculate time range based on interval
      const now = Date.now();
      let daysBack = 7; // 7 days for 1h interval
      if (interval === '4h') {
        daysBack = 30; // 30 days for 4h interval
      } else if (interval === '1d') {
        daysBack = 90; // 90 days for 1d interval
      }
      
      const startTime = now - (daysBack * 24 * 60 * 60 * 1000);
      const endTime = now;
      
      return await readOnlySdk.info.getCandleSnapshot(coin, interval, startTime, endTime);
    },
    enabled: !!readOnlySdk && enabled && !!coin,
    staleTime: 1000 * 60, // 1 minute - data is fresh for 1 minute
    // Disable all automatic refetching to prevent loops
    refetchInterval: false, // Disable auto-refetch - manual refresh only
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnMount: false, // Don't refetch on mount if data exists
    refetchOnReconnect: false, // Don't refetch on reconnect
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes
  });
}

// Get meta and asset contexts
export function useMetaAndAssetCtxs() {
  const { readOnlySdk } = useHyperliquid();

  return useQuery({
    queryKey: queryKeys.metaAndAssetCtxs,
    queryFn: async () => {
      if (!readOnlySdk) throw new Error('SDK not initialized');
      return await readOnlySdk.info.perpetuals.getMetaAndAssetCtxs();
    },
    enabled: !!readOnlySdk,
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: 1000 * 60, // Refetch every minute
  });
}

// Get asset index
export function useAssetIndex(coin: string, enabled: boolean = true) {
  const { readOnlySdk } = useHyperliquid();

  return useQuery({
    queryKey: queryKeys.assetIndex(coin),
    queryFn: async () => {
      if (!readOnlySdk) throw new Error('SDK not initialized');
      await readOnlySdk.ensureInitialized();
      return await readOnlySdk.symbolConversion.getAssetIndex(coin);
    },
    enabled: !!readOnlySdk && enabled && !!coin,
    staleTime: 1000 * 60 * 10, // 10 minutes - asset indices don't change
  });
}

// Get clearinghouse state (perps)
export function useClearinghouseState(address: string | undefined, enabled: boolean = true) {
  const { readOnlySdk } = useHyperliquid();

  return useQuery({
    queryKey: queryKeys.clearinghouseState(address || ''),
    queryFn: async () => {
      if (!readOnlySdk || !address) throw new Error('SDK not initialized or no address');
      const normalizedAddress = address.toLowerCase();
      return await readOnlySdk.info.perpetuals.getClearinghouseState(normalizedAddress);
    },
    enabled: !!readOnlySdk && enabled && !!address,
    staleTime: 1000 * 10, // 10 seconds - balances change frequently
    refetchInterval: 1000 * 20, // Refetch every 20 seconds
  });
}

// Get spot clearinghouse state
export function useSpotClearinghouseState(address: string | undefined, enabled: boolean = true) {
  const { readOnlySdk } = useHyperliquid();

  return useQuery({
    queryKey: queryKeys.spotClearinghouseState(address || ''),
    queryFn: async () => {
      if (!readOnlySdk || !address) throw new Error('SDK not initialized or no address');
      const normalizedAddress = address.toLowerCase();
      return await readOnlySdk.info.spot.getSpotClearinghouseState(normalizedAddress);
    },
    enabled: !!readOnlySdk && enabled && !!address,
    staleTime: 1000 * 10, // 10 seconds
    refetchInterval: 1000 * 20, // Refetch every 20 seconds
  });
}

// Get user open orders
export function useUserOpenOrders(address: string | undefined, enabled: boolean = true) {
  const { readOnlySdk } = useHyperliquid();

  return useQuery({
    queryKey: queryKeys.userOpenOrders(address || ''),
    queryFn: async () => {
      if (!readOnlySdk || !address) throw new Error('SDK not initialized or no address');
      const normalizedAddress = address.toLowerCase();
      return await readOnlySdk.info.getUserOpenOrders(normalizedAddress);
    },
    enabled: !!readOnlySdk && enabled && !!address,
    staleTime: 1000 * 5, // 5 seconds - orders change frequently
    refetchInterval: 1000 * 10, // Refetch every 10 seconds
  });
}

// Get user TWAP slice fills
export function useUserTwapSliceFills(address: string | undefined, enabled: boolean = true) {
  const { readOnlySdk } = useHyperliquid();

  return useQuery({
    queryKey: queryKeys.userTwapSliceFills(address || ''),
    queryFn: async () => {
      if (!readOnlySdk || !address) throw new Error('SDK not initialized or no address');
      const normalizedAddress = address.toLowerCase();
      return await readOnlySdk.info.getUserTwapSliceFills(normalizedAddress);
    },
    enabled: !!readOnlySdk && enabled && !!address,
    staleTime: 1000 * 30, // 30 seconds
  });
}

// Get user fills by time
export function useUserFillsByTime(
  address: string | undefined,
  startTime: number,
  endTime: number,
  enabled: boolean = true
) {
  const { readOnlySdk } = useHyperliquid();

  return useQuery({
    queryKey: queryKeys.userFillsByTime(address || '', startTime, endTime),
    queryFn: async () => {
      if (!readOnlySdk || !address) throw new Error('SDK not initialized or no address');
      const normalizedAddress = address.toLowerCase();
      return await readOnlySdk.info.getUserFillsByTime(normalizedAddress, startTime, endTime);
    },
    enabled: !!readOnlySdk && enabled && !!address && startTime > 0 && endTime > 0,
    staleTime: 1000 * 60, // 1 minute - historical data doesn't change
  });
}

// Get user funding
export function useUserFunding(
  address: string | undefined,
  startTime: number,
  endTime: number,
  enabled: boolean = true
) {
  const { readOnlySdk } = useHyperliquid();

  return useQuery({
    queryKey: queryKeys.userFunding(address || '', startTime, endTime),
    queryFn: async () => {
      if (!readOnlySdk || !address) throw new Error('SDK not initialized or no address');
      const normalizedAddress = address.toLowerCase();
      return await readOnlySdk.info.perpetuals.getUserFunding(normalizedAddress, startTime, endTime);
    },
    enabled: !!readOnlySdk && enabled && !!address && startTime > 0 && endTime > 0,
    staleTime: 1000 * 60, // 1 minute
  });
}

// Get historical orders
export function useHistoricalOrders(address: string | undefined, enabled: boolean = true) {
  const { readOnlySdk } = useHyperliquid();

  return useQuery({
    queryKey: queryKeys.historicalOrders(address || ''),
    queryFn: async () => {
      if (!readOnlySdk || !address) throw new Error('SDK not initialized or no address');
      const normalizedAddress = address.toLowerCase();
      return await readOnlySdk.info.getHistoricalOrders(normalizedAddress);
    },
    enabled: !!readOnlySdk && enabled && !!address,
    staleTime: 1000 * 60, // 1 minute - historical data doesn't change often
  });
}

// Get spot meta
export function useSpotMeta(enabled: boolean = true) {
  const { readOnlySdk } = useHyperliquid();

  return useQuery({
    queryKey: queryKeys.spotMeta,
    queryFn: async () => {
      if (!readOnlySdk) throw new Error('SDK not initialized');
      return await readOnlySdk.info.spot.getSpotMeta();
    },
    enabled: !!readOnlySdk && enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes - spot tokens don't change often
  });
}

// Hook to invalidate queries after mutations
export function useInvalidateHyperliquidQueries() {
  const queryClient = useQueryClient();

  const invalidateAllMids = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.allMids });
  };

  const invalidateClearinghouseState = (address: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.clearinghouseState(address) });
  };

  const invalidateSpotClearinghouseState = (address: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.spotClearinghouseState(address) });
  };

  const invalidateUserOpenOrders = (address: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.userOpenOrders(address) });
  };

  const invalidateUserFills = (address: string) => {
    queryClient.invalidateQueries({ 
      queryKey: ['hyperliquid', 'userFillsByTime', address],
      exact: false 
    });
  };

  const invalidateAll = (address?: string) => {
    queryClient.invalidateQueries({ queryKey: ['hyperliquid'] });
    if (address) {
      invalidateClearinghouseState(address);
      invalidateSpotClearinghouseState(address);
      invalidateUserOpenOrders(address);
      invalidateUserFills(address);
    }
  };

  return {
    invalidateAllMids,
    invalidateClearinghouseState,
    invalidateSpotClearinghouseState,
    invalidateUserOpenOrders,
    invalidateUserFills,
    invalidateAll,
  };
}

