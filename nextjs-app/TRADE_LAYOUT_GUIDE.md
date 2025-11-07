# 🧭 Hyperliquid Trade Layout Specification (Next.js / React)

> **Mục tiêu:** Tái tạo layout giao diện trading (Perpetuals) giống `https://app.hyperliquid-testnet.xyz/trade/BTC-PERP` bằng **Next.js + TailwindCSS**.

---

## 🧩 Tổng thể cấu trúc

Cấu trúc React Component:

```
<TradePage>
  <Header />
  <PairInfoBar />
  <MainLayout>
    <Sidebar />
    <ChartArea />
    <RightPanel />
  </MainLayout>
</TradePage>
```

---

## 1️⃣ HEADER (thanh trên cùng)

**Chiều cao:** 56px  
**Nền:** `#0a0c0d`  
**Border:** `1px solid #1b1b1b`  
**Vị trí:** Fixed top, z-index cao

**Chia 3 phần:**

| Vị trí | Nội dung |
|--------|-----------|
| Trái | Logo + menu (`Swap`, `Perpetuals`, `LaunchPad`, `Rewards`, `More ▼`) |
| Giữa | Cặp hiện tại + Giá + Change + Mark + Index + 24h Volume |
| Phải | Dropdown chain (VD: `BSC ▼`) + `Connect Wallet` + icon ⚙️ |

**Tailwind gợi ý:**

```jsx
<header className="fixed top-0 left-0 w-full h-14 bg-[#0a0c0d] border-b border-[#1b1b1b] flex items-center justify-between px-6 z-50">
  {/* Left - Menu */}
  {/* Center - Info */}
  {/* Right - Wallet */}
</header>
```

---

## 2️⃣ PAIR INFO BAR (thanh thông tin cặp token)

**Ngay dưới header**, chiều cao ~48px.

| Vị trí | Nội dung | Ví dụ |
|--------|-----------|--------|
| Trái | Token icon + Pair name + dropdown + favorite | `BTC-PERP ▼ ☆` |
| Giữa | Giá hiện tại + Change + Mark + Index + 24h Vol | `$143,409.4  -0.97%  Mark:132.43K` |
| Phải | Funding rate + Countdown | `0.0010% in 05:34:42` |

**Tailwind:**

```jsx
<div className="h-12 bg-[#0e1012] border-b border-[#1b1b1b] flex items-center justify-between px-6 text-sm">
  {/* ...left/mid/right sections... */}
</div>
```

---

## 3️⃣ MAIN LAYOUT (phần chính)

**Bố cục 3 cột ngang:**

```
| Sidebar |   Chart + Tabs   |   Right Panel  |
```

**Chiều cao:** `calc(100vh - 104px)` (trừ header + info bar).

**Tailwind:**

```jsx
<main className="flex h-[calc(100vh-104px)] bg-[#0e1012] text-gray-300">
  <Sidebar />
  <MainArea />
  <RightPanel />
</main>
```

---

### 🔹 Sidebar trái

- Width: `80px`
- Background: `#101213`
- Hiển thị danh sách token + %change

```jsx
<div className="w-[80px] bg-[#101213] flex flex-col items-center py-2">
  {/* Token list */}
</div>
```

---

### 🔹 Khu trung tâm (Chart + Tabs)

- Chia dọc 2 phần:
  - **Chart** (candlestick chart, khung thời gian, volume)
  - **Tabs**: Positions / Orders / History / Account

```jsx
<div className="flex flex-col flex-1 border-x border-[#1b1b1b]">
  <div className="flex-1 border-b border-[#1b1b1b]">Chart here</div>
  <div className="h-[35%] p-3">Tabs here</div>
</div>
```

---

### 🔹 Right Panel

- Width: `340px`
- Chia dọc 3 phần: Orderbook, Trade form, My Asset

```jsx
<div className="w-[340px] flex flex-col border-l border-[#1b1b1b]">
  <div className="flex-1 p-3">Orderbook</div>
  <div className="flex-1 p-3">Trade Form</div>
  <div className="p-3 border-t border-[#1b1b1b]">My Asset</div>
</div>
```

---

## 🎨 4️⃣ Màu sắc & Font

| Thành phần | Màu | Ghi chú |
|-------------|------|----------|
| Nền tổng | `#0e1012` | tối nhẹ |
| Border | `#1b1b1b` | mảnh |
| Text chính | `#c0c0c0` | |
| Text phụ | `#888` | |
| Buy (xanh) | `#03c987` | |
| Sell (đỏ) | `#ff4d4f` | |
| Font | `Inter`, `Space Grotesk`, `Roboto Mono` | |

---

## 🧱 5️⃣ Component Tree (Next.js)

```
components/
 ┣ Header.tsx
 ┣ PairInfoBar.tsx
 ┣ Sidebar.tsx
 ┣ ChartSection.tsx
 ┣ TabsSection.tsx
 ┣ RightPanel/
 ┃ ┣ OrderBook.tsx
 ┃ ┣ TradeForm.tsx
 ┃ ┗ MyAsset.tsx
 ┗ TradePage.tsx
```

---

## ⚡ 6️⃣ Gợi ý API (Hyperliquid Testnet)

**REST:**
- `POST https://api.hyperliquid-testnet.xyz/info`
  ```json
  { "type": "l2Book", "coin": "BTC-PERP" }
  ```

**WebSocket:**
- `wss://api.hyperliquid-testnet.xyz/ws`
  ```json
  { "method": "subscribe", "subscription": { "type": "trades", "coin": "BTC-PERP" } }
  ```

---

## ✅ Kết luận

File này hướng dẫn layout chuẩn cho team Frontend khi dựng trang trade.  
Áp dụng cho Next.js + TailwindCSS + React Components.

---

> **Version:** v1.0 — 2025-11-07  
> **Author:** ChatGPT (Design Spec for Hyperliquid-style FE)
