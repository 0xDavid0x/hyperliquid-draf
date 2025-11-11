# Tài Liệu Kỹ Thuật - Hyperliquid Trading Platform

## Mục Lục
1. [Trading (Giao Dịch)](#1-trading-giao-dịch)
2. [Orderbook (Sổ Lệnh)](#2-orderbook-sổ-lệnh)
3. [Chart (Biểu Đồ)](#3-chart-biểu-đồ)
4. [Position (Vị Thế)](#4-position-vị-thế)
5. [Order (Lệnh)](#5-order-lệnh)
6. [Realized PnL (Lợi Nhuận Thực Tế)](#6-realized-pnl-lợi-nhuận-thực-tế)

---

## 1. Trading (Giao Dịch)

### 1.1. Flow Tổng Quan

```
User Input → Enable Trading → Place Order → Order Execution → Update Balance
```

### 1.2. Chi Tiết Flow

#### Bước 1: Enable Trading (Kích Hoạt Giao Dịch)
**File:** `Trading.tsx` (dòng 137-268)

**Luồng:**
1. Kiểm tra agent trong localStorage
2. Nếu chưa có agent:
   - Tạo agent wallet mới (private key + address)
   - Tạo nonce duy nhất: `timestamp` hoặc `lastNonce + 1`
   - Ký message approve agent với EIP-712 signature
   - Gửi request đến API `/exchange` với payload:
     ```json
     {
       "action": {
         "type": "approveAgent",
         "agentAddress": "0x...",
         "hyperliquidChain": "Testnet/Mainnet",
         "nonce": 1234567890
       },
       "signature": { "r": "...", "s": "...", "v": 27/28 },
       "nonce": 1234567890
     }
     ```
3. Lưu agent info vào localStorage: `hyperliquid_agent_{walletAddress}`

**Công thức:**
- Nonce generation: `Math.max(timestamp, lastNonce + 1)`
- Signature v: `parsedSig.v === 0 || parsedSig.v === 1 ? parsedSig.v + 27 : parsedSig.v`

#### Bước 2: Place Order (Đặt Lệnh)
**File:** `Trading.tsx` (dòng 320-490)

**Luồng:**
1. Lấy agent từ localStorage
2. Khởi tạo trading SDK với private key
3. Lấy giá hiện tại từ `getAllMids()` (React Query cache)
4. Lấy metadata từ `getMetaAndAssetCtxs()`
5. Tính toán size:
   - Nếu sizeUnit = 'USDC': `sizeInCoin = orderSize / currentPrice`
   - Nếu sizeUnit = coin: `sizeInCoin = orderSize`
   - Làm tròn theo `szDecimals`: `sizeNum = Math.round(sizeNum * 10^szDecimals) / 10^szDecimals`
6. Tính toán giá limit:
   - Market order: 
     - Buy: `limitPrice = currentPrice * 1.005` (slippage +0.5%)
     - Sell: `limitPrice = currentPrice * 0.995` (slippage -0.5%)
   - Limit order: Sử dụng giá người dùng nhập hoặc mặc định
   - Làm tròn theo tickSize: `finalPrice = Math.round(price / tickSize) * tickSize`
7. Cập nhật leverage: `updateLeverage(coin, 'isolated', leverage)`
8. Đặt lệnh:
   ```typescript
   {
     coin: "BTC-PERP",
     is_buy: true/false,
     sz: sizeNum,
     limit_px: finalLimitPrice,
     order_type: { limit: { tif: "FrontendMarket" | "Gtc" | "Ioc" | "Alo" } },
     reduce_only: false
   }
   ```

**Công thức:**
- Size conversion (USDC → Coin): `sizeInCoin = usdcAmount / currentPrice`
- Size conversion (Coin → USDC): `usdcAmount = coinAmount * currentPrice`
- Size từ phần trăm balance: 
  - `sizeInUsd = (balance * percent) / 100`
  - `sizeInCoin = sizeInUsd / currentPrice`
- Market order price với slippage:
  - Buy: `price = currentPrice * (1 + slippagePercent)`
  - Sell: `price = currentPrice * (1 - slippagePercent)`
- Size rounding: `roundedSize = Math.round(size * 10^decimals) / 10^decimals`
- Price rounding: `roundedPrice = Math.round(price / tickSize) * tickSize`

#### Bước 3: Order Execution
**File:** `exchange.ts` (dòng 161-228)

**Luồng:**
1. Convert order request thành order wire format
2. Get asset index từ symbol
3. Tạo action với nonce duy nhất
4. Ký action với private key
5. Gửi payload đến `/exchange` endpoint
6. Nhận response và invalidate React Query cache

**Công thức:**
- Nonce generation: `timestamp` hoặc `lastNonce + 1` nếu cùng millisecond
- Order wire format: `{ a: assetIndex, b: isBuy, s: size, r: reduceOnly, p: price, ... }`

---

## 2. Orderbook (Sổ Lệnh)

### 2.1. Flow Tổng Quan

```
WebSocket Connection → Subscribe to L2Book → Receive Updates → Calculate Spread → Display
```

### 2.2. Chi Tiết Flow

**File:** `RightPanel.tsx` (dòng 42-148)

#### Bước 1: WebSocket Subscription
1. Kiểm tra SDK và coin symbol
2. Convert coin format: `BTC-USDC` → `BTC-PERP`
3. Unsubscribe từ coin cũ (nếu có)
4. Subscribe đến L2Book và Trades cho coin mới:
   ```typescript
   await sdk.subscriptions.subscribeToL2Book(coinSymbol, callback)
   await sdk.subscriptions.subscribeToTrades(coinSymbol, callback)
   ```

#### Bước 2: Nhận Dữ Liệu Orderbook
**Format dữ liệu:**
```typescript
{
  coin: "BTC-PERP",
  levels: [
    [ // Bids (mua) - giá từ cao xuống thấp
      { px: "50000", sz: "1.5", n: 3 },
      { px: "49999", sz: "2.0", n: 5 }
    ],
    [ // Asks (bán) - giá từ thấp lên cao
      { px: "50001", sz: "1.2", n: 2 },
      { px: "50002", sz: "2.5", n: 4 }
    ]
  ]
}
```

#### Bước 3: Tính Toán Spread
**File:** `RightPanel.tsx` (dòng 93-106)

**Công thức:**
```typescript
bestBid = parseFloat(levels[0][0].px)  // Giá bid cao nhất
bestAsk = parseFloat(levels[1][0].px)  // Giá ask thấp nhất
spread = bestAsk - bestBid
spreadPercent = (spread / bestBid) * 100
midPrice = (bestBid + bestAsk) / 2
```

**Ví dụ:**
- Best Bid: $50,000
- Best Ask: $50,010
- Spread: $10
- Spread %: (10 / 50000) * 100 = 0.02%

#### Bước 4: Hiển Thị với Depth Visualization
**File:** `RightPanel.tsx` (dòng 283-347)

**Công thức tính độ rộng thanh depth:**
```typescript
// Cho mỗi level
totalSize = sum(sizes từ đầu đến level hiện tại)
maxSize = sum(tất cả sizes trong 15 levels đầu)
widthPercent = (totalSize / maxSize) * 100
```

**Ví dụ:**
- Level 1: size = 1.5, cumulative = 1.5, max = 10.0 → width = 15%
- Level 2: size = 2.0, cumulative = 3.5, max = 10.0 → width = 35%
- Level 3: size = 1.5, cumulative = 5.0, max = 10.0 → width = 50%

---

## 3. Chart (Biểu Đồ)

### 3.1. Flow Tổng Quan

```
Select Coin/Interval → Fetch Candle Data → Format Data → Render Chart → Add Indicators
```

### 3.2. Chi Tiết Flow

**File:** `Chart.tsx`

#### Bước 1: Fetch Candle Data
**File:** `useHyperliquidQueries.ts` (dòng 58-95)

**Luồng:**
1. Tính toán time range dựa trên interval:
   - `1h`: 7 ngày trước
   - `4h`: 30 ngày trước
   - `1d`: 90 ngày trước
2. Gọi API: `getCandleSnapshot(coin, interval, startTime, endTime)`

**Công thức:**
```typescript
now = Date.now()
daysBack = interval === '1h' ? 7 : interval === '4h' ? 30 : 90
startTime = now - (daysBack * 24 * 60 * 60 * 1000)
endTime = now
```

#### Bước 2: Format Data cho Lightweight Charts
**File:** `Chart.tsx` (dòng 262-321)

**Format candle data:**
```typescript
{
  time: Math.floor(candle.t / 1000), // Convert ms to seconds
  open: parseFloat(candle.o),
  high: parseFloat(candle.h),
  low: parseFloat(candle.l),
  close: parseFloat(candle.c)
}
```

**Format volume data:**
```typescript
{
  time: Math.floor(candle.t / 1000),
  value: parseFloat(candle.v),
  color: close >= open ? '#03c98780' : '#ff4d4f80' // Green if up, red if down
}
```

#### Bước 3: Moving Average Calculation
**File:** `Chart.tsx` (dòng 179-211)

**Công thức MA:**
```typescript
// Simple Moving Average (SMA)
for (i = period - 1; i < candles.length; i++) {
  sum = 0
  for (j = i - period + 1; j <= i; j++) {
    sum += candles[j].close
  }
  maValue = sum / period
  maData.push({ time: candles[i].time, value: maValue })
}
```

**Ví dụ MA20:**
- Tính trung bình của 20 nến gần nhất
- Chỉ tính từ nến thứ 20 trở đi
- Công thức: `MA20 = (Close[0] + Close[-1] + ... + Close[-19]) / 20`

#### Bước 4: Zoom Controls
**File:** `Chart.tsx` (dòng 231-260)

**Công thức zoom:**
```typescript
// Zoom in: giảm range 30%
newRange = currentRange * 0.7

// Zoom out: tăng range 30%
newRange = currentRange * 1.3

// Reset: fit all data
timeScale.fitContent()
```

---

## 4. Position (Vị Thế)

### 4.1. Flow Tổng Quan

```
Fetch Clearinghouse State → Parse Positions → Calculate PnL/ROE → Display → Close Position
```

### 4.2. Chi Tiết Flow

**File:** `TabsSection.tsx`

#### Bước 1: Fetch Position Data
**File:** `useHyperliquidQueries.ts` (dòng 130-144)

**API Call:**
```typescript
getClearinghouseState(walletAddress)
```

**Response structure:**
```typescript
{
  assetPositions: [
    {
      position: {
        coin: "BTC-PERP",
        szi: "1.5",           // Size (positive = long, negative = short)
        entryPx: "50000",     // Entry price
        unrealizedPnl: "150", // Unrealized PnL
        leverage: { value: 20 },
        marginUsed: "3750"    // Margin used
      }
    }
  ]
}
```

#### Bước 2: Tính Toán PnL và ROE
**File:** `TabsSection.tsx` (dòng 137-159)

**Công thức Unrealized PnL:**
```
Unrealized PnL = (Current Price - Entry Price) * Position Size * Direction
```

**Chi tiết:**
- Long position (size > 0): `PnL = (currentPrice - entryPrice) * size`
- Short position (size < 0): `PnL = (entryPrice - currentPrice) * abs(size)`

**Công thức ROE (Return on Equity):**
```typescript
ROE = (Unrealized PnL / Margin Used) * 100
```

**Ví dụ:**
- Entry Price: $50,000
- Current Price: $50,100
- Size: 1.5 BTC (long)
- Margin Used: $3,750
- Unrealized PnL: (50,100 - 50,000) * 1.5 = $150
- ROE: (150 / 3750) * 100 = 4%

#### Bước 3: Close Position
**File:** `TabsSection.tsx` (dòng 287-356)

**Market Close:**
```typescript
// Sử dụng custom.marketClose với slippage 5%
await tradingSdk.custom.marketClose(coin, closeSize, undefined, 0.05)
```

**Limit Close:**
```typescript
// Đặt lệnh limit với reduce_only = true
await tradingSdk.exchange.placeOrder({
  coin: coin,
  is_buy: positionSize < 0, // Buy nếu short, Sell nếu long
  sz: Math.abs(positionSize),
  limit_px: currentPrice,
  order_type: { limit: { tif: 'Gtc' } },
  reduce_only: true
})
```

**Công thức xác định hướng đóng:**
- Long position (size > 0): Cần bán → `is_buy = false`
- Short position (size < 0): Cần mua → `is_buy = true`

---

## 5. Order (Lệnh)

### 5.1. Flow Tổng Quan

```
Place Order → Order Status → Open Orders → Order History → Cancel Order
```

### 5.2. Chi Tiết Flow

#### Bước 1: Order Types
**File:** `Trading.tsx` (dòng 71-73, 445)

**Các loại lệnh:**
1. **Market Order** (`FrontendMarket`):
   - Thực hiện ngay với giá thị trường
   - Có slippage protection (+0.5% buy, -0.5% sell)

2. **Limit Order**:
   - `Gtc` (Good Till Cancel): Lệnh có hiệu lực đến khi hủy
   - `Ioc` (Immediate Or Cancel): Thực hiện ngay hoặc hủy
   - `Alo` (Add Liquidity Only): Chỉ thêm thanh khoản (maker)

#### Bước 2: Fetch Open Orders
**File:** `useHyperliquidQueries.ts` (dòng 164-178)

**API Call:**
```typescript
getUserOpenOrders(walletAddress)
```

**Response:**
```typescript
[
  {
    coin: "BTC-PERP",
    side: "B" | "A",  // B = Buy, A = Sell
    sz: "1.5",
    limitPx: "50000",
    orderType: "Limit Gtc",
    oid: 12345,
    timestamp: 1234567890
  }
]
```

#### Bước 3: Order History
**File:** `useHyperliquidQueries.ts` (dòng 239-252)

**API Call:**
```typescript
getHistoricalOrders(walletAddress)
```

**Response:**
```typescript
[
  {
    order: {
      coin: "BTC-PERP",
      side: "B",
      sz: "1.5",
      limitPx: "50000"
    },
    status: "filled" | "cancelled" | "rejected",
    statusTimestamp: 1234567890,
    oid: 12345
  }
]
```

#### Bước 4: Cancel Order
**File:** `exchange.ts` (dòng 230-264)

**Công thức:**
```typescript
// Cancel by OID
await tradingSdk.exchange.cancelOrder({
  coin: "BTC-PERP",
  oid: 12345
})

// Cancel by CLOID (Client Order ID)
await tradingSdk.exchange.cancelOrderByCloid("BTC-PERP", "cloid-string")
```

---

## 6. Realized PnL (Lợi Nhuận Thực Tế)

### 6.1. Flow Tổng Quan

```
Trade Execution → Calculate Closed PnL → Aggregate Realized PnL → Display in History
```

### 6.2. Chi Tiết Flow

#### Bước 1: Fetch Trade History
**File:** `useHyperliquidQueries.ts` (dòng 197-215)

**API Call:**
```typescript
getUserFillsByTime(walletAddress, startTime, endTime)
```

**Response:**
```typescript
[
  {
    coin: "BTC-PERP",
    side: "B" | "A",
    px: "50000",      // Execution price
    sz: "1.5",        // Size
    time: 1234567890,
    closedPnl: "150", // Realized PnL từ trade này
    oid: 12345,
    hash: "0x..."
  }
]
```

#### Bước 2: Tính Toán Realized PnL
**File:** `TabsSection.tsx` (dòng 746-747)

**Công thức:**
```
Realized PnL = Sum of all closedPnl from filled trades
```

**Chi tiết:**
- `closedPnl` được tính bởi Hyperliquid khi position được đóng một phần hoặc toàn bộ
- Mỗi fill có thể có `closedPnl` nếu nó đóng một phần position
- Tổng realized PnL = tổng tất cả `closedPnl` từ các trades đã thực hiện

**Ví dụ:**
1. Mở long 1.5 BTC @ $50,000
2. Đóng 0.5 BTC @ $50,200 → `closedPnl = (50,200 - 50,000) * 0.5 = $100`
3. Đóng 1.0 BTC @ $50,100 → `closedPnl = (50,100 - 50,000) * 1.0 = $100`
4. **Total Realized PnL = $200**

#### Bước 3: Funding History
**File:** `useHyperliquidQueries.ts` (dòng 218-236)

**API Call:**
```typescript
getUserFunding(walletAddress, startTime, endTime)
```

**Response:**
```typescript
[
  {
    delta: {
      coin: "BTC-PERP",
      usdc: "-2.5"  // Funding payment (negative = paid, positive = received)
    },
    time: 1234567890,
    hash: "0x..."
  }
]
```

**Công thức:**
```
Total Realized PnL = Sum(closedPnl from trades) + Sum(funding payments)
```

**Ví dụ:**
- Trade PnL: $200
- Funding payments: -$10 (đã trả)
- **Net Realized PnL = $200 - $10 = $190**

#### Bước 4: Hiển Thị trong Trade History
**File:** `TabsSection.tsx` (dòng 720-757)

**Format:**
- Màu xanh (#03c987) nếu `closedPnl >= 0`
- Màu đỏ (#ff4d4f) nếu `closedPnl < 0`
- Hiển thị: `+$150` hoặc `-$50`

---

## Tổng Kết Các Công Thức Chính

### Trading
- Size conversion: `coinSize = usdcSize / price`
- Market order price: `price = currentPrice * (1 ± slippage)`
- Size rounding: `rounded = Math.round(size * 10^decimals) / 10^decimals`

### Orderbook
- Spread: `spread = bestAsk - bestBid`
- Spread %: `spreadPercent = (spread / bestBid) * 100`
- Mid price: `midPrice = (bestBid + bestAsk) / 2`

### Position
- Unrealized PnL (Long): `PnL = (currentPrice - entryPrice) * size`
- Unrealized PnL (Short): `PnL = (entryPrice - currentPrice) * abs(size)`
- ROE: `ROE = (unrealizedPnl / marginUsed) * 100`

### Realized PnL
- Total Realized: `Sum(closedPnl from all fills)`
- Net Realized: `Sum(closedPnl) + Sum(funding)`

### Chart
- MA calculation: `MA = Sum(close prices) / period`
- Time range: `startTime = now - (daysBack * 24 * 60 * 60 * 1000)`

---

## Lưu Ý Kỹ Thuật

1. **Nonce Generation**: Luôn đảm bảo nonce tăng dần, sử dụng timestamp hoặc counter
2. **Price Rounding**: Tất cả giá phải được làm tròn theo `tickSize`
3. **Size Precision**: Size phải tuân theo `szDecimals` của asset
4. **WebSocket Reconnection**: Tự động reconnect khi mất kết nối
5. **React Query Caching**: Sử dụng staleTime và refetchInterval hợp lý để giảm API calls
6. **Error Handling**: Luôn xử lý lỗi và hiển thị thông báo rõ ràng cho người dùng

