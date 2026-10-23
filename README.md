# pixmint

atelier の PIX で描いたドット絵を、ETH / Base に完全オンチェーンで mint する。pixmint by mederu.art

- `start-pixmint.command` — ダブルクリックでローカル起動（http://localhost:3333）
- `contracts/PixMint.sol` — ERC-721。絵は SSTORE2 で state に、SVG は tokenURI で生成。タイトル・ロイヤリティ・内蔵販売・表示名
- `src/pxm.ts` — 保存形式 PXM v1（エンコード・検証・SVG 化）
- `app/` — 描く → mint / 作品一覧 / 作品ページ（出品・購入）
- `scripts/deploy.mjs` — デプロイ
- `test/run.mjs`（`npm test`）— コントラクトのテスト / `test/e2e.mjs` — ブラウザ通し確認
- `docs/DESIGN.md` — 設計・コスト・永続性・収益 / `docs/HANDOFF.md` — 引き継ぎ（ローカルでの動かし方もここ）
