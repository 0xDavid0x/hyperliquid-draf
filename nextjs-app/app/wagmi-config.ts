import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { arbitrumSepolia } from 'wagmi/chains';

// Get your WalletConnect Project ID from https://cloud.walletconnect.com
// For now, using a placeholder - you'll need to replace this with your actual project ID
const projectId = 
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
    ? process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
    : '65e3e21f958e2a3c73037447c9934669';

export const config = getDefaultConfig({
  appName: 'Hyperliquid Trading App',
  projectId: projectId,
  chains: [arbitrumSepolia], // Hyperliquid testnet runs on Arbitrum Sepolia
  ssr: true, // If your dApp uses server side rendering (SSR)
});

