# pixmint 引き継ぎ（2026-10-23）

新しい会話はまずこれと `DESIGN.md` を読む。

## 何か
atelier の PIX で描いたドット絵を ETH / Base に**完全オンチェーン**で mint するページ。
mederu X とは別プロジェクト。置き場所は `~/antigravity/pixmint`（独立。git はまだ）。

## できていること
| | ファイル | 状態 |
|---|---|---|
| 保存形式 PXM v1 のエンコーダ・検証・SVG 化 | `src/pxm.ts` | ✅ |
| コントラクト（ERC-721 + SSTORE2 + オンチェーン SVG + タイトル + ERC-2981 + 内蔵販売） | `contracts/PixMint.sol` | ✅ |
| コントラクトのテスト | `test/run.mjs`（`npm test`） | ✅ SVG 一致 9ケース・不正データ8種・販売の分配など |
| ABI + bytecode（アプリとデプロイ用・コミットする） | `lib/PixMint.json` | `npm test` で再生成 |
| **アプリ（Next 15 + wagmi 2 + viem 2）** | `app/` `components/` `lib/` | ✅ 試作 |
| └ 描く → mint | `app/page.tsx` `components/Editor.tsx` `components/MintPanel.tsx` | 左に道具（B/E/G/I・⌘Z）・パレット7種×30色（neon・earth・gameboy・kawaii・kidcore・holo・vaporwave。色を変えると選んだ枠も変わる・変えたパレットだけブラウザに保存・↺で戻す）・8〜128 |
| └ 作品一覧 | `app/gallery/page.tsx` | totalMinted から新しい順に直接読む（getLogs は公開 RPC の範囲制限があるので使わない） |
| └ 作品ページ（出品・購入・内訳） | `app/[chainId]/[id]/page.tsx` | URL はコントラクトの external_url と同じ形 |
| └ 名前表示（**pixmint 表示名 → .eth → Basename** → 短縮アドレス） | `lib/names.ts` `components/Name.tsx` | ✅ 2026-10-23 実チェーンで確認: vitalik.eth・jesse.base.eth・base.base.eth（Base 側だけの primary name は L2Resolver で逆引き＋正引きで照合） |
| └ 表示名の設定 | `app/me/page.tsx`（右上メニュー →「表示名を設定」） | ✅ チェーンごとに保存。tokenURI に Artist 属性で出る |
| └ UI（英語が既定・右上で EN/JP。mederu 系のサイバー調・ロゴは Silkscreen） | `lib/i18n.tsx` `app/globals.css` `app/layout.tsx` | ✅ 文言は lib/i18n.tsx に集約 |
| └ ヘルプ（FAQ） | `app/help/page.tsx` `lib/help.ts` | ✅ フルオンチェーンの説明・お金の流れ・mint の仕方・描き方・ショートカット（EN/JP）。**数値（手数料・上限）を変えたら lib/help.ts も直す** |
| └ ODD モード（サイズ +1 = 9〜129。真ん中のマスができる・中心に十字ガイド・切り替えても絵は残る） | `app/page.tsx` `lib/pix.ts` regrid | ✅ 2026-10-23 |
| └ PNG 保存（約2048px・ぼかしなし） | `lib/pix.ts` exportPng | ✅ 左の列の一番下 |
| └ ウォレット選択 | `components/Header.tsx` `app/providers.tsx` | ブラウザ拡張 / WalletConnect / ローカル用テストウォレット |
| デプロイ | `scripts/deploy.mjs`（`npm run deploy`） | ✅ ローカルで確認 |
| ブラウザ通し確認 | `test/e2e.mjs` | ✅ テスト用ウォレットで 描く→mint→出品→別アカウントで購入→作者に 0.4875 ETH→表示名→一覧・tokenURI |

### ローカルで動かす
**`start-pixmint.command` をダブルクリック** → http://localhost:3333 が開く（atelierX の 3000 と別）。
ローカルのテスト用チェーン（hardhat node）を立て、コントラクトを置き、`.env.local` を書いて `npm run dev` まで自動。
チェーンはメモリ上なので閉じると作品は消える。

ウォレットは右上のメニューから:
- **テスト用：作者／購入者** — ローカルのときだけ出る。MetaMask の設定不要（hardhat の既定アカウント #1・#2）
- **ブラウザ拡張** — MetaMask・Rabby など（EIP-6963 で見つかればその名前で出る）
- **WalletConnect（スマホ）** — `.env.local` に `NEXT_PUBLIC_WC_PROJECT_ID` を入れたときだけ出る（start スクリプトは入れない）。
  ⚠️ 2026-10-23: mederu 共通の ID（ec3b…dbe）で試すと QR もウォレット一覧も空だった＝Reown が接続を拒否している。
  pixmint 用に Reown（cloud.reown.com）でプロジェクトを作り、許可ドメインに `localhost` と `pixmint.mederu.art` を入れた ID を使う

手でやる場合:
```
npm install && npm test
npm run chain            # 別ターミナル
RPC_URL=http://127.0.0.1:8545 PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 npm run deploy
npm run dev              # http://localhost:3333
```

## PIX の元
`~/antigravity/mederux/packages/atelier/src/lib/pix/`（core / render / palettes / store / PixContext）。
**読むだけ**。pixmint 側にはエディタの必要部分をコピーして持つ予定。
エンコードの前に、exportSVG と同じ「キャンバスで合成 → 色を拾う」前処理を通すこと。

## テストネット（2026-10-23）
| | アドレス | deploy tx |
|---|---|---|
| Sepolia (11155111) | `0x2bcdf0a8b81022b6ef0273f10764d7065f800a03` | `0x690d654d…41d3` |
| Base Sepolia (84532) | `0x14c3b1972ecb84069399786893dbb1c949ae49b1` | `0xb470a667…cc56` |

- 上は **v3**（2026-10-23）: v2 のセキュリティ修正（表示名の制限・UTF-8 の検証・Ownable2Step）＋ **MAX_RUNS 2,048**
- 使わない: v2（Sepolia `0x8725…a5d0`・Base Sepolia `0xb370…a3e0`）、v1（両チェーン `0xc8c4…7dd8`）

- owner / deployer: `0xC9DE84e5249C318D96DDBFF2f63ded08ED480C08`（鍵は `.env.deploy`。git に入らない）
- デプロイ: `npm run deploy -- sepolia` / `base-sepolia`（メインネットは `ALLOW_MAINNET=1` が要る）。事前確認は `node scripts/check-deploy.mjs`
- ガス代の実測は `DESIGN.md` §3（Sepolia は Glamsterdam 入りで mint 約 4.4 倍）
- OpenSea はテストネット対応終了（2025-07）。Rarible testnet もインデックスされず。表示はメインネットで確認する

## 本番サイト（2026-10-23）
- **https://pixmint.mederu.art** = Vercel `mederu303-9891s-projects/pixmint` の production。DNS はお名前.com（01-04.dnsv.jp）に `A pixmint 76.76.21.21`
- production の環境変数はまだ空（コントラクト無し＝「チェーンなし」の画面）。メインネットに置いたら `NEXT_PUBLIC_PIXMINT_1` / `_8453` を production に入れて `vercel deploy --prod`
- テストネット用のアドレスは preview だけに入れている（本番に混ぜない）

## アイデア（2026-10-23・順番に少しずつ）
1. ガス代表示 — ✅ 2026-10-23（`lib/cost.ts`）: ガス価格 12 秒ごと・「gas × gwei」・ランの使用率・
   **チェーン横並びの比較**（Base は L1 データ費を GasPriceOracle の上限で足す）・**円/ドル換算**（Chainlink ETH/USD・JPY/USD、60 秒ごと）・
   **色をまとめるヒント**（いちばん少ない色を近い色にまとめるとデータが何 % 減るか。3% 以上のときだけ出す）
2. 画像 → ドット変換 ✅ 2026-10-23（`lib/convert.ts` `components/ImportDialog.tsx`）: ドロップ・⌘V・「画像」ボタン。median cut／パレットに寄せる・Floyd–Steinberg・ラン 4,096 に収まるまで自動で色数を下げる。浮かせて置く
   ＋ 選択ツール ✅（M。ドラッグで範囲・中をドラッグで移動・⌘C/⌘X/⌘V・⌘A・矢印・Enter/Esc・Delete）。⌘V は paste イベントが来ない環境ではページ内のコピーを貼る
3. キャンバス共有・共同制作（basepaint.xyz 参考）。共作者と分配をコントラクトに持たせるなら v3 でメインネット前に決める

## 次（</> = Claude Code でやる）
1. Foundry に載せ替えるか判断（今のテストで十分なら不要）
2. **Sepolia と Base Sepolia に deploy**（`npm run deploy`）→ `.env.local` にアドレス → 実際に mint
   - gas（特に Base の L1 データ費）を実測
   - OpenSea テストネット等で `tokenURI` が表示されるか確認
3. ブラウザで Basename / ENS の名前が出るか確認（vitalik.eth のアドレスで作品を作るなど）
4. WalletConnect をスマホで試す（Reown の許可ドメイン）
5. `DESIGN.md` §7 の残りの決めごと（二重 mint・ロイヤリティのプリセット)
6. 未テスト: 受け取りを拒むコントラクト宛ての送金 → `pending` / `claim()` の経路。Foundry で足す

## 決定済み（2026-10-23）
- mint は無料（ガス代だけ）。mederu の収益は pixmint 内の販売手数料 2.5%（上限 5% をコントラクトに固定）
- 作者ロイヤリティは mint 時に 0〜10% を作者が選ぶ。OpenSea には ERC-2981 で作者分だけ申告（OS2 以降は任意払い）
- タイトルは作品ごと・作者が付ける・変更不可
- tokenURI / contractURI / 定数 PLATFORM に "pixmint by mederu.art"
- 表示名はコントラクトの `setName`（48 bytes・変更可・チェーンごと）。名前の表示順は 表示名 → .eth → Basename（長いので後）
- サイトは **pixmint.mederu.art**（サブドメイン）。作品 URL は `/<chainid>/<id>`。siteURL は owner が後から変更できる

## 注意
- コントラクトに**データを変更・削除する関数を足さない**（「永久に残る」の約束が崩れる）
- MAX_RUNS を上げると `tokenURI` が RPC の上限（5,000万 gas）に当たる作品が出る
