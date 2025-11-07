# Hyperliquid Trading App - Next.js 16

A Next.js 16 application with Tailwind CSS, RainbowKit wallet connection, and Hyperliquid SDK integration for trading BTC with 20x leverage.

## Features

- ✅ Next.js 16 with App Router
- ✅ Tailwind CSS for styling
- ✅ RainbowKit for wallet connection
- ✅ Wagmi for Ethereum interactions
- ✅ Hyperliquid SDK integration
- ✅ Long BTC with 20x leverage functionality

## Setup

### 1. Install Dependencies

```bash
cd nextjs-app
npm install
```

**Note**: If you encounter issues installing the local `hyperliquid` package, you can install it from npm instead:

```bash
npm install hyperliquid
```

Then update the import in `app/components/LongBTCButton.tsx` to:
```typescript
import { Hyperliquid } from 'hyperliquid';
```

### 2. Configure WalletConnect

1. Go to [WalletConnect Cloud](https://cloud.walletconnect.com)
2. Create a new project or use an existing one
3. Copy your Project ID
4. Create a `.env.local` file in the `nextjs-app` directory:

```bash
cd nextjs-app
touch .env.local
```

5. Add your WalletConnect Project ID to `.env.local`:

```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Connect Wallet**: Click the "Connect Wallet" button and select your preferred wallet
2. **View BTC Price**: The current BTC price will be displayed once connected
3. **Long BTC**: Click the "Long BTC 20x" button to place a long order with 20x leverage

## Important Notes

⚠️ **Warning**: This application places real orders on Hyperliquid mainnet. 

- Make sure you have sufficient balance in your wallet
- The default order size is 0.001 BTC (adjust in `app/components/LongBTCButton.tsx`)
- Orders are placed with a limit price 1% below current market price for safety
- Leverage is automatically set to 20x for BTC-PERP
- Always test on testnet first by setting `TESTNET = true` in `app/components/LongBTCButton.tsx`
- Make sure your wallet is connected to Arbitrum network (Hyperliquid runs on Arbitrum)

## Configuration

To modify the trading parameters, edit `app/components/LongBTCButton.tsx`:

- `testnet`: Set to `true` for testnet trading
- `sz`: Order size in BTC
- `limit_px`: Limit price (currently 1% below market)
- `leverage`: Leverage amount (currently 20x)

## Project Structure

```
nextjs-app/
├── app/
│   ├── components/
│   │   └── LongBTCButton.tsx    # Trading component
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Main page
│   ├── providers.tsx             # RainbowKit/Wagmi providers
│   ├── wagmi-config.ts           # Wagmi configuration
│   └── globals.css               # Global styles
├── package.json
├── tsconfig.json
├── next.config.js
└── tailwind.config.ts
```

## Troubleshooting

### Wallet Connection Issues
- Make sure you have a WalletConnect Project ID in `.env.local`
- Check that your wallet extension is installed and unlocked

### SDK Initialization Errors
- Ensure you're connected to Arbitrum network (Hyperliquid runs on Arbitrum)
- Check browser console for detailed error messages

### Order Placement Failures
- Verify you have sufficient balance
- Check that you're on the correct network (Arbitrum)
- Review the error message in the status display

## License

MIT
