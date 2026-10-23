# pixmint 設計メモ v1（2026-10-23）

atelier の PIX で描いたドット絵を、**ETH と Base に完全オンチェーンで mint する**ページ。
mederu X とは別プロジェクト。

## 1. データの置き場所

| 置くもの | 場所 | 中身 |
|---|---|---|
| ピクセルデータ（PXM v1） | **チェーンの state**（SSTORE2：データを runtime code に持つ小さなコントラクトを1作品1個） | パレット + ランレングス |
| 作品の性質 | `works[id]`（creator / mintedAt / size / colors） | 32 bytes |
| 画像（SVG） | **どこにも保存しない**。`tokenURI` / `svg(id)` がそのたびに組み立てる | — |

- IPFS もサーバーも使わない。owner を含めて、**データを書き換える・消す関数は無い**
- SSTORE2 のコントラクトは先頭が STOP（0x00）で実行できない。Cancun 以降は SELFDESTRUCT でコードも消せない（EIP-6780）

### 永続性

| | どこまで残るか |
|---|---|
| **ETH** | state は全ノードが保持し続ける。EIP-4444（履歴の期限切れ）で消えるのは古いトランザクション・ログで、**state は対象外**。だからデータはログではなく state に置く |
| **Base** | state に置くのは同じ。ただし「Base とそのノードが続く限り」。Ethereum に送られるデータ（blob）は約18日で消えるので、L1 に作品が永久に残るわけではない |

→ 「本当に永久に」なら ETH、「気軽にたくさん」なら Base。Tezos L1 / Etherlink と同じ構図。

## 2. 保存形式 PXM v1

```
[0] version=1  [1] size(1..129)  [2] n=色数(1..255)
[3..3+3n)  palette RGB×n   ※ palette[0] = 背景（いちばん多い色）
[3+3n..)   runs (len, idx) ×k   行優先・行をまたがない・len>=1・k<=4096
```

- atelierX の `exportSVG` は1マス約12バイト（`M x yh1v1Hxz`）。PXM は**1ラン2バイト**
- 実測: 32×32 のふつうの絵で **281 bytes**（SVG だと 1,485 bytes）
- 色の合成（不透明度・合成モード）は atelierX の exportSVG と同じく、**キャンバスで合成してから色を拾う**前処理を通してからエンコードする

### 上限 MAX_RUNS = 4096 の理由

`tokenURI` はコントラクトが SVG を組むので、読み出しにも gas がかかる（無料の eth_call だが上限がある）。
多くの RPC は eth_call を **5,000万 gas** で打ち切る。

| 絵 | ラン数 | tokenURI の gas |
|---|---|---|
| 32×32 ふつう | 127 | 55万 |
| 128×128 ふつう | 627 | 273万 |
| 64×64 ノイズ64色 | 4,040 | **2,061万** |
| 129×129 ノイズ255色 | 16,527 | **1億940万** ← 表示できない作品になる |

→ 4096 ランで切る。ふつうのドット絵は数百ラン。写真をドット化したような細かい絵だけが引っかかり、
　 その場合はエンコーダが「細かすぎてオンチェーンで描けません」と返す（UI で色数を減らす案内を出す）。

## 3. コスト（実測 gas）

| 絵 | データ | mint の gas |
|---|---|---|
| 8×8 | 42 B | 18.8万 |
| 32×32 ふつう | 281 B | **23.9万** |
| 64×64 ふつう | 673 B | 39.4万 |
| 128×128 ふつう | 1,278 B | 63.4万 |
| 上限ぎりぎり（4,040ラン） | 8,275 B | 336万 |

ETH の手数料 = gas × ガス価格。例: ガス価格 1 gwei なら 32×32 で 0.00024 ETH。
Base は L2 の実行費 + L1 データ費で、同じ絵がおおむね桁違いに安い（テストネットで実測する）。
コントラクトの deploy は約 **370万 gas**（チェーンごとに1回。2026-10-23 に mainnet / Base / Base Sepolia で見積もり、ローカルで実測）。

### Glamsterdam 後の gas（2026-10-23 Sepolia で実測）

Sepolia は 2026-10-06 に次のアップグレード Glamsterdam が入っている。EIP-8037（state を作る gas の値上げ）で、
**1作品ごとに SSTORE2 のコントラクトを作る pixmint の mint は約 4.4 倍**になる。メインネットに入る時期は未確認。

| 絵（scripts/test-mint.mjs の模様） | データ | 今の料金（ローカル） | Glamsterdam（Sepolia） |
|---|---|---|---|
| 8×8・38ラン | 100 B | 24.0万 | 106.0万 |
| 32×32・171ラン | 366 B | 31.1万 | 132.3万 |
| 64×64・339ラン | 702 B | 44.3万 | 190.2万 |
| アプリから MetaMask で mint（#4） | 306 B | — | 110.5万 |
| deploy | 16.0KB | 370万 | **2,568万** |

- `tokenURI` の読み出し（無料の eth_call）は Sepolia で 32×32 が 74万・64×64 が 141万。大きくは変わらない
- アプリの「GAS (ESTIMATE)」は `estimateContractGas` でチェーンに聞く（式 `estimateMintGas` は聞けないときの予備）
- ガス価格が同じなら、Glamsterdam 後は ETH での mint が今の約 4 倍の値段。Base に同じ改定が入るかは OP Stack 次第（未確認）

## 4. コントラクト API（`contracts/PixMint.sol`）

| 関数 | 説明 |
|---|---|
| `mint(bytes pxm, string title, uint16 royaltyBps) payable` | 検証 → 保存 → mint。creator = 送信者。`msg.value == mintPrice`（初期値 0） |
| `data(id)` / `svg(id)` / `title(id)` | 生データ / SVG / タイトル（空なら `pixmint #id`） |
| `tokenURI(id)` | name = タイトル、description と attributes に **"pixmint by mederu.art"**、external_url = `siteURL/<chainid>/<id>`（例: `https://pixmint.mederu.art/1/5` = ETH・`/8453/5` = Base） |
| `contractURI()` | コレクション情報（OpenSea などが読む）。ここにも pixmint by mederu.art |
| `royaltyInfo(id, price)` | ERC-2981。**作者に royaltyBps** だけを申告 |
| `list(id, price)` / `unlist(id)` / `buy(id) payable` | **pixmint 内の販売**。譲渡されると出品は自動で消える |
| `claim()` | 送金に失敗して預かった分の引き出し |
| owner: `setMintPrice` / `setFeeBps`（上限5%）/ `setMintOpen` / `setSiteURL` / `withdraw` | **作品データには触れない**。withdraw は mederu の取り分だけ |

- 壊れたデータ・制御文字入りタイトル・10% 超のロイヤリティは mint の時点で revert
- タイトルとロイヤリティは mint 後に変更できない
- コントラクト本体は 16.0KB（上限 24KB）。deploy 約 370万 gas（Glamsterdam 後は約 2,570万）
- ETH / Base とも**同じバイトコード**を deploy する

## 5. 収益とロイヤリティ（2026-10-23 決定）

### 前提: OpenSea のロイヤリティは任意
2025 年の OS2 以降、OpenSea のクリエイター手数料は**買い手任せ**。強制できるのは ERC721-C
（転送に制限をかける規格）を使ったときだけで、pixmint では採らない。
→ **外部マーケットからの収益は当てにしない。mederu の収益は pixmint 内の販売で取る。**

### 仕組み
| | mederu | 作者 | 売り手 |
|---|---|---|---|
| **mint** | mintPrice（初期値 0 = ガス代だけ） | — | — |
| **pixmint 内で一次販売**（作者が売る） | 手数料 **2.5%** | — | 97.5% |
| **pixmint 内で二次販売** | 手数料 **2.5%** | ロイヤリティ **0〜10%（作者が mint 時に選ぶ）** | 残り |
| **OpenSea など外部** | なし | ERC-2981 で作者分を申告（払うかは買い手次第） | — |

- mederu 手数料は owner が変えられるが、**コントラクトに 5% の上限を固定**（作者・コレクターへの約束）
- ERC-2981 は受取人を1つしか持てないので、外部には作者分だけを申告する。
  mederu 分も外部で取りたければ分配用コントラクトが要るが、任意払いなので見合わない

### 実測 gas
| 操作 | gas |
|---|---|
| mint（32×32・タイトル付き） | 25.9万 |
| list | 4.6万 |
| buy | 9.6万 |

## 6. 表示と販売の場所
- **OpenSea**: ERC-721 + オンチェーン tokenURI なので、ETH・Base とも何もしなくても表示・売買できるはず。
  ⚠️ OpenSea は 2025-07 にテストネット対応をやめた（testnets.opensea.io は終了）ので、テストネットでは確かめられない。
  Sepolia で tokenURI（name・image の SVG・attributes・external_url）と contractURI・royaltyInfo が正しいことは確認済み（2026-10-23）。
  OpenSea での表示はメインネットに置いてから確認する
- **pixmint の一覧ページ**: `Minted` / `Listed` / `Sold` イベントを読んで一覧を作り、その場で `buy` できる。
  ここで売れたものだけ mederu 手数料と作者ロイヤリティが確実に入る

## 7. 残りの決めごと
1. 同じ絵の二重 mint を禁止するか（データのハッシュで一意にできる）
2. 作者ロイヤリティの選択肢（UI では 0 / 2.5 / 5 / 7.5 / 10% のプリセットなど）
3. ~~siteURL~~ → **`https://pixmint.mederu.art`**（2026-10-23 決定。mederu.art 本体は Tezos で mederu X 移行時に整理するため、サブドメインで独立させる。Tezos の PIX と紛れないよう pix. ではなく pixmint.）
