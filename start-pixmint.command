#!/bin/bash
# pixmint ローカル起動（ダブルクリックで実行）
#   ローカルのテスト用チェーンを立てて、コントラクトを置き、アプリを開く。
#   チェーンはメモリ上なので、閉じるたびに作品は消える（本物のお金は一切動かない）。
#   ウォレットは画面右上のメニュー「テスト用：作者／購入者」を使えば MetaMask の設定は要らない。
cd "$(dirname "$0")"
echo "=== pixmint (local) ==="

# 前回の残りを止める
pkill -f "$(pwd)/node_modules/.bin/next" 2>/dev/null
lsof -ti:8545 | xargs kill 2>/dev/null
lsof -ti:3333 | xargs kill 2>/dev/null
sleep 1
rm -rf .next

echo "--- npm install ---"
npm install --no-audit --no-fund || { echo "npm install に失敗しました"; read -r; exit 1; }

echo "--- コントラクトのビルドとテスト ---"
npm test || { echo "コントラクトのテストに失敗しました"; read -r; exit 1; }

echo "--- ローカルチェーン起動 (port 8545) ---"
npx hardhat node > .hardhat.log 2>&1 &
HH=$!
trap 'kill $HH 2>/dev/null' EXIT
for i in $(seq 1 40); do
  curl -s -X POST -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' http://127.0.0.1:8545 >/dev/null && break
  sleep 1
done

echo "--- コントラクトを置く ---"
# hardhat の既定アカウント #0（テスト用。公開されている鍵なので本物のチェーンでは絶対に使わない）
ADDR=$(RPC_URL=http://127.0.0.1:8545 \
  PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  node scripts/deploy.mjs | grep -o 'NEXT_PUBLIC_PIXMINT_31337=0x[0-9a-fA-F]*' | cut -d= -f2)
if [ -z "$ADDR" ]; then echo "デプロイに失敗しました（.hardhat.log を見てください）"; read -r; exit 1; fi
echo "PixMint: $ADDR"

# .env.local の 31337 行だけ差し替える（他の行は残す）
touch .env.local
grep -v '^NEXT_PUBLIC_PIXMINT_31337=' .env.local > .env.local.tmp
echo "NEXT_PUBLIC_PIXMINT_31337=$ADDR" >> .env.local.tmp
# WalletConnect は .env.local に NEXT_PUBLIC_WC_PROJECT_ID を自分で入れたときだけ出る（docs/HANDOFF.md）
mv .env.local.tmp .env.local

(
  for i in $(seq 1 90); do
    sleep 1
    if curl -s -o /dev/null http://localhost:3333; then open http://localhost:3333; exit 0; fi
  done
) &

echo "--- dev server 起動 http://localhost:3333 (Ctrl+C で停止) ---"
npm run dev
