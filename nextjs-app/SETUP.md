# Setup Guide - Next.js App với Hyperliquid SDK độc lập

## Tổng quan

Next.js app này đã được tách thành một dự án độc lập, không phụ thuộc vào package `hyperliquid` từ npm. Tất cả code SDK đã được copy vào thư mục `src/` trong nextjs-app.

## Cấu trúc thư mục

```
nextjs-app/
├── src/                    # Hyperliquid SDK (độc lập)
│   ├── index.ts           # Entry point chính
│   ├── rest/              # REST API clients
│   ├── websocket/         # WebSocket clients
│   ├── types/             # TypeScript types và constants
│   │   └── constants.ts   # JUMPMEME_CODE và các constants khác
│   └── utils/             # Utilities
├── app/                   # Next.js app
│   ├── components/        # React components
│   ├── contexts/          # React contexts
│   └── hooks/             # Custom hooks
└── package.json
```

## Dependencies

Các dependencies cần thiết đã được thêm vào `package.json`:
- `ethers`: ^6.13.0 - Ethereum library
- `axios`: ^1.7.2 - HTTP client
- `ws`: ^8.18.2 - WebSocket client (cho Node.js)
- `@msgpack/msgpack`: ^3.0.0-beta2 - MessagePack encoding

## Cài đặt

```bash
cd nextjs-app
npm install
# hoặc
yarn install
```

## Import từ SDK

Tất cả imports từ SDK nên sử dụng path alias `@/src`:

```typescript
// ✅ Đúng
import { Hyperliquid } from '@/src';
import { SpotToken, JUMPMEME_CODE } from '@/src';

// ❌ Sai - không còn hoạt động
import { Hyperliquid } from 'hyperliquid';
```

## Constants

Tất cả constants đã được export từ `@/src`:

```typescript
import { JUMPMEME_CODE, SDK_CODE } from '@/src';

// JUMPMEME_CODE = 'JUMPMEME'
// SDK_CODE không còn tồn tại (đã được thay thế bằng JUMPMEME_CODE)
```

## Cấu hình TypeScript

Path alias đã được cấu hình trong `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"],
      "@/src/*": ["./src/*"]
    }
  }
}
```

## Cập nhật từ root src/

Nếu có thay đổi trong root `src/`, bạn cần copy lại vào `nextjs-app/src/`:

```bash
# Từ root directory
cp -r src/* nextjs-app/src/
```

## Build và Run

```bash
# Development
npm run dev

# Production build
npm run build
npm start
```

## Lưu ý

1. **Không phụ thuộc vào package `hyperliquid`**: App này không sử dụng package từ npm nữa, tất cả code đều nằm trong `src/`.

2. **JUMPMEME_CODE**: Constant `JUMPMEME_CODE` đã được thay thế cho `SDK_CODE` (PLACEHOLDER) và được sử dụng làm default referral code.

3. **Auto-referral**: SDK sẽ tự động set referral code `JUMPMEME` cho user chưa có referral khi họ đặt order lần đầu (trừ khi `disableAutoReferral: true`).

4. **Browser compatibility**: Một số modules Node.js (như `ws`, `fs`) sẽ không hoạt động trong browser. Next.js config đã được setup để handle điều này.

## Troubleshooting

### Lỗi import không tìm thấy module

Đảm bảo bạn đang sử dụng path alias `@/src` thay vì `hyperliquid`:

```typescript
// ❌ Lỗi
import { Hyperliquid } from 'hyperliquid';

// ✅ Đúng
import { Hyperliquid } from '@/src';
```

### Lỗi TypeScript không nhận diện path alias

Kiểm tra `tsconfig.json` có đúng path alias không và restart TypeScript server trong IDE.

### Lỗi build Next.js

Xóa `.next` folder và rebuild:

```bash
rm -rf .next
npm run build
```

