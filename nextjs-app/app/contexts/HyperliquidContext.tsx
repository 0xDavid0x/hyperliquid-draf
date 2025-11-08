'use client';

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Hyperliquid } from '@/src';

const TESTNET = true;

interface HyperliquidContextType {
  readOnlySdk: Hyperliquid | null;
  getTradingSdk: (privateKey: string, walletAddress: string) => Promise<Hyperliquid>;
  isLoading: boolean;
  error: string | null;
}

const HyperliquidContext = createContext<HyperliquidContextType | undefined>(undefined);

interface HyperliquidProviderProps {
  children: ReactNode;
  walletAddress?: string;
}

export function HyperliquidProvider({ children, walletAddress }: HyperliquidProviderProps) {
  const [readOnlySdk, setReadOnlySdk] = useState<Hyperliquid | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Cache trading SDK instances by privateKey
  const tradingSdkCache = useRef<Map<string, Hyperliquid>>(new Map());
  const tradingSdkInitializing = useRef<Set<string>>(new Set());

  // Initialize read-only SDK
  useEffect(() => {
    if (!walletAddress) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const initializeReadOnlySdk = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const sdk = new Hyperliquid({
          testnet: TESTNET,
          enableWs: true,
          walletAddress: walletAddress,
          disableAssetMapRefresh: true,
        });

        await sdk.connect();
        await sdk.ensureInitialized();

        if (isMounted) {
          setReadOnlySdk(sdk);
        }
      } catch (err) {
        console.error('Error initializing read-only SDK:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize SDK');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializeReadOnlySdk();

    return () => {
      isMounted = false;
      // Cleanup read-only SDK on unmount
      if (readOnlySdk) {
        // SDK cleanup is handled internally
      }
    };
  }, [walletAddress]);

  // Get or create trading SDK for a specific privateKey
  const getTradingSdk = async (privateKey: string, walletAddress: string): Promise<Hyperliquid> => {
    const cacheKey = `${privateKey}:${walletAddress}`;

    // Return cached SDK if exists
    if (tradingSdkCache.current.has(cacheKey)) {
      const cachedSdk = tradingSdkCache.current.get(cacheKey)!;
      // Verify SDK is still initialized
      try {
        await cachedSdk.ensureInitialized();
        return cachedSdk;
      } catch {
        // If initialization fails, remove from cache and create new
        tradingSdkCache.current.delete(cacheKey);
      }
    }

    // Check if already initializing
    if (tradingSdkInitializing.current.has(cacheKey)) {
      // Wait for existing initialization
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (tradingSdkCache.current.has(cacheKey)) {
            clearInterval(checkInterval);
            resolve(tradingSdkCache.current.get(cacheKey)!);
          } else if (!tradingSdkInitializing.current.has(cacheKey)) {
            clearInterval(checkInterval);
            reject(new Error('Failed to initialize trading SDK'));
          }
        }, 100);

        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error('Trading SDK initialization timeout'));
        }, 5000);
      });
    }

    // Create new trading SDK
    tradingSdkInitializing.current.add(cacheKey);

    try {
      const tradingSdk = new Hyperliquid({
        privateKey: privateKey,
        testnet: TESTNET,
        walletAddress: walletAddress,
        enableWs: false,
        disableAssetMapRefresh: true,
      });

      await tradingSdk.connect();
      await tradingSdk.ensureInitialized();

      tradingSdkCache.current.set(cacheKey, tradingSdk);
      return tradingSdk;
    } catch (err) {
      console.error('Error creating trading SDK:', err);
      throw err;
    } finally {
      tradingSdkInitializing.current.delete(cacheKey);
    }
  };

  // Cleanup trading SDKs on unmount
  useEffect(() => {
    return () => {
      tradingSdkCache.current.clear();
      tradingSdkInitializing.current.clear();
    };
  }, []);

  return (
    <HyperliquidContext.Provider
      value={{
        readOnlySdk,
        getTradingSdk,
        isLoading,
        error,
      }}
    >
      {children}
    </HyperliquidContext.Provider>
  );
}

export function useHyperliquid() {
  const context = useContext(HyperliquidContext);
  if (context === undefined) {
    throw new Error('useHyperliquid must be used within a HyperliquidProvider');
  }
  return context;
}


