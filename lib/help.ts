// pixmint — ヘルプページの中身（EN / JP）。数値はコントラクトの値と揃えること
//   mederu 手数料 2.5%（上限 5%・コントラクトに固定）/ ロイヤリティ 0〜10% / ラン上限 2,048 / タイトル 96 bytes / 表示名 48 bytes

export interface HelpItem {
  q: string;
  a: string[]; // 段落。先頭が "- " の行は箇条書き、"| " で始まる行は表の行（| で区切る）
}
export interface HelpSection {
  id: string;
  title: string;
  lead?: string;
  items: HelpItem[];
}

export const HELP: Record<'en' | 'ja', HelpSection[]> = {
  en: [
    {
      id: 'onchain',
      title: 'Truly fully on-chain',
      lead: 'Your pixels live inside the blockchain itself — not on IPFS, not on our server.',
      items: [
        {
          q: 'What does "fully on-chain" mean here?',
          a: [
            'When you mint, the pixel data is written into the chain\'s state (the same place balances live). The image itself is never stored anywhere: every time a wallet or marketplace asks for it, the pixmint contract rebuilds the SVG from that data on the spot.',
            '- No IPFS, no pinning service, no image server.',
            '- Even if pixmint.mederu.art disappears, the work can be read and rendered straight from the contract (data(id) / svg(id) / tokenURI(id)).',
            '- Nobody — including mederu — can change or delete a work after it is minted. There is no function for it in the contract.',
          ],
        },
        {
          q: 'Isn\'t most "on-chain" NFT art already like this?',
          a: [
            'Often not. Many "on-chain" works only store a short IPFS link on-chain; the actual image (or the JSON that holds it) sits on IPFS and disappears if nobody keeps pinning it.',
            'pixmint stores the pixels themselves. Storing raw SVG would be expensive, so pixmint uses a compact format: a small palette plus runs of same-colored pixels. A typical 32×32 piece is about 300 bytes instead of ~1,500 bytes of SVG.',
          ],
        },
        {
          q: 'How permanent is it — Ethereum vs Base?',
          a: [
            '| Chain | Lasts as long as… | Cost |',
            '| Ethereum | Ethereum exists. Contract state is kept by every full node. | Higher gas |',
            '| Base | Base and its nodes keep running. Base is an L2; its data posted to Ethereum is not kept forever. | Much cheaper |',
            'Choose Ethereum for the pieces you want to last the longest; choose Base to mint freely and often.',
          ],
        },
        {
          q: 'Why does it say "Too detailed to render on-chain"?',
          a: [
            'A work can have up to 2,048 runs (a run = consecutive pixels of the same color in a row). Beyond that, rendering the image would cost more gas than a single transaction allows, so other contracts could not read it.',
            'Normal pixel art uses a few hundred runs. If you hit the limit, use fewer colors or merge similar shades.',
          ],
        },
      ],
    },
    {
      id: 'money',
      title: 'Royalties & where the money goes',
      items: [
        {
          q: 'How much does minting cost?',
          a: ['Minting is free — you only pay the network gas. The panel on the Pix page shows the cost on each chain before you mint.'],
        },
        {
          q: 'How are sales on pixmint split?',
          a: [
            'When a work is sold through pixmint (a work page → Buy), the contract splits the payment automatically:',
            '| Sale | mederu fee | Artist royalty | Seller receives |',
            '| First sale (artist sells) | 2.5% | — | 97.5% |',
            '| Resale (collector sells) | 2.5% | 0–10% (set at mint) | the rest |',
            'Example: a resale at 1 ETH with a 5% royalty → 0.025 ETH to mederu, 0.05 ETH to the artist, 0.925 ETH to the seller.',
            'The mederu fee can never exceed 5% — that cap is fixed in the contract.',
          ],
        },
        {
          q: 'What about OpenSea and other marketplaces?',
          a: [
            'pixmint works are standard ERC-721 tokens, so they can be shown and traded elsewhere. The artist royalty is declared to marketplaces (ERC-2981), but most marketplaces now leave paying it up to the buyer.',
            'Royalties are only guaranteed when the work is sold on pixmint. mederu takes no fee on sales elsewhere.',
          ],
        },
        {
          q: 'Can I change my royalty or title later?',
          a: ['No. Title and royalty are written at mint and are permanent, like the image itself. Your display name, however, can be changed any time.'],
        },
      ],
    },
    {
      id: 'mint',
      title: 'How to mint',
      items: [
        {
          q: 'Steps',
          a: [
            '- Connect a wallet (top right). Browser extensions such as MetaMask, Rabby or Phantom work.',
            '- Draw your piece on the Pix page. The "On-chain image" preview shows exactly what will be stored.',
            '- Add a title (optional, up to 96 bytes — about 32 Japanese characters). Untitled works are named "pixmint #id".',
            '- Choose the resale royalty (0 / 2.5 / 5 / 7.5 / 10%).',
            '- Choose the chain (Ethereum or Base) and press Mint. Confirm in your wallet.',
            '- When it finishes, open the work page. From there you can list it for sale.',
          ],
        },
        {
          q: 'How do I sell or cancel a listing?',
          a: [
            'Open your work page, enter a price in ETH and press List. To stop selling, press Cancel listing. If the work is transferred, its listing is cancelled automatically.',
          ],
        },
        {
          q: 'How do I set my display name?',
          a: [
            'Wallet menu (top right) → Display name. It replaces your address on works and lists, and appears as "Artist" on marketplaces. Without one, pixmint shows your .eth name, then your Basename, then your address. Names are saved per chain.',
          ],
        },
      ],
    },
    {
      id: 'draw',
      title: 'Using Pix (the drawing page)',
      items: [
        {
          q: 'Tools',
          a: [
            '| Tool | What it does |',
            '| Pen | Paints the current color. Dragging fills the gaps between cells. |',
            '| Eraser | Clears cells to the background color. |',
            '| Fill | Fills the connected area of the same color. |',
            '| Picker | Picks a color from the canvas, then switches back to Pen. |',
            '| Select | Drag a box to select. Drag inside it to move; copy, cut and paste with ⌘C / ⌘X / ⌘V. |',
            '| Stamp | Stamps a pixel-art picture. See "Stamps" below. |',
            '| Undo / Redo | Steps back and forward (up to 50 steps). |',
            '| Image | Turns a PNG, JPEG or SVG into pixels (you can also drop or paste one onto the canvas). |',
            '| Clear | Clears the whole canvas with a bang (can be undone). |',
          ],
        },
        {
          q: 'Colors & palettes',
          a: [
            '- Click a swatch to use it. The big chip and hex field show the current color.',
            '- Change the color (chip or hex) while a swatch is selected, and the swatch changes too — build your own palette. ↺ resets that palette.',
            '- BG sets the background color. Erased and unpainted cells use it.',
            '- 7 palettes of 30 colors: neon, earth, gameboy, kawaii, kidcore, holo, vaporwave.',
          ],
        },
        {
          q: 'Grid size',
          a: [
            '- 8, 16, 32, 48, 64, 96 or 128 cells square. Changing the size clears the canvas (you will be asked first).',
            '- ODD adds one cell (9×9 up to 129×129) so there is a true center pixel, shown by a faint cross. Your drawing stays when you switch.',
            '- For detailed illustrations, 96×96 is often the sweet spot.',
          ],
        },
        {
          q: 'Stamps',
          a: [
            '- Choose Stamp (T), pick one of the 12 original pixel stamps, and click the canvas. A faint preview shows where it lands.',
            '- R rotates 90°, F flips left-right, and 1× / 2× sets the size.',
            '- Parts of each stamp take your current color, so you can tint them. Outlines and small details keep their own colors.',
          ],
        },
        {
          q: 'Sound',
          a: ['Stamps, fill, undo, redo and clear make little sounds. Turn them on or off with the Sound button at the bottom of the left column; the choice is remembered in this browser.'],
        },
        {
          q: 'Download PNG',
          a: [
            'The button at the bottom of the left column (or the S key) saves a PNG scaled to about 2048px with crisp pixels (no blur) — ready to post on X and other social media. It is just a picture of your drawing; it does not mint anything.',
          ],
        },
        {
          q: 'Is my drawing saved?',
          a: ['Your work in progress and edited palettes are kept in this browser. Clearing site data or using another browser starts fresh. Only minting stores it permanently.'],
        },
      ],
    },
    {
      id: 'keys',
      title: 'Keyboard shortcuts',
      items: [
        {
          q: 'Shortcuts',
          a: [
            '| Key | Action |',
            '| B | Pen |',
            '| E | Eraser |',
            '| G | Fill |',
            '| I | Picker |',
            '| M | Select (drag a box; drag inside it to move) |',
            '| ⌘C / ⌘X / ⌘V | Copy / cut / paste the selection |',
            '| ⌘A | Select all |',
            '| Arrow keys | Move the selection by one cell |',
            '| Enter / Esc | Place / cancel the moved or pasted pixels |',
            '| Delete | Erase the selection |',
            '| T | Stamp (R rotate · F flip) |',
            '| S | Save PNG |',
            '| ⌘Z / Ctrl+Z | Undo |',
            '| ⇧⌘Z / Ctrl+Y | Redo |',
            'Shortcuts are ignored while typing in a text field.',
          ],
        },
        {
          q: 'Turning an image into pixels',
          a: [
            'Drop an image (PNG, JPEG, GIF, WebP or SVG) onto the canvas, paste one with ⌘V, or use the Image button. It is fitted to the current grid size.',
            'Choose the number of colors, dithering, or "use current palette", then Place. It floats so you can move it before pressing Enter.',
            'Enlarged pixel art (such as a pixmint PNG) is detected and read cell by cell, so it stays sharp. The background color becomes transparent.',
            'If the result would be too detailed to render on-chain (over 2,048 runs), pixmint fixes it for you. "Balanced" (the default) tries several color counts and picks the one that looks closest to the original; "Keep colors" merges tiny specks into the colors around them; "Keep detail" uses fewer colors instead. For detailed illustrations, 96×96 is often the sweet spot.',
          ],
        },
      ],
    },
  ],

  ja: [
    {
      id: 'onchain',
      title: '本当のフルオンチェーン',
      lead: 'ドット絵はブロックチェーンそのものの中にあります。IPFS にも、私たちのサーバーにも置いていません。',
      items: [
        {
          q: '「フルオンチェーン」とはどういう意味？',
          a: [
            'mint すると、ピクセルのデータがチェーンの「状態（state）」——残高などと同じ場所——に書き込まれます。画像そのものはどこにも保存しません。ウォレットやマーケットが作品を表示しようとするたびに、pixmint のコントラクトがそのデータから SVG をその場で組み立てます。',
            '- IPFS もピン留めサービスも画像サーバーも使いません。',
            '- pixmint.mederu.art が無くなっても、作品はコントラクトから直接読み出して描けます（data(id) / svg(id) / tokenURI(id)）。',
            '- mint した作品は、mederu を含め誰も変更・削除できません。そのための関数がコントラクトにありません。',
          ],
        },
        {
          q: '「オンチェーン」をうたう NFT はみんなこうでは？',
          a: [
            '多くはそうではありません。チェーン上には IPFS への短いリンクしか無く、実際の画像（や画像を含む JSON）は IPFS 上にあって、誰もピン留めしなくなれば消えてしまう作りがよくあります。',
            'pixmint はピクセルそのものを置きます。SVG をそのまま置くと高くつくので、小さなパレット＋「同じ色が横に続く区間（ラン）」という詰めた形式で保存しています。ふつうの 32×32 の作品なら、SVG で約 1,500 bytes のところ約 300 bytes です。',
          ],
        },
        {
          q: 'どれくらい永く残る？ Ethereum と Base の違い',
          a: [
            '| チェーン | 残る条件 | 手数料 |',
            '| Ethereum | Ethereum が続く限り。コントラクトの状態は全ノードが保持します。 | 高め |',
            '| Base | Base とそのノードが動き続ける限り。Base は L2 で、Ethereum に送るデータは永久には保存されません。 | ずっと安い |',
            'いちばん永く残したい作品は Ethereum、気軽にたくさん mint するなら Base がおすすめです。',
          ],
        },
        {
          q: '「細かすぎてチェーン上で描けません」と出る',
          a: [
            '1作品のランは 2,048 までです（ラン＝横に同じ色が続く区間）。それを超えると画像を組み立てる計算が1トランザクションの gas 上限を超え、ほかのコントラクトから読めなくなります。',
            'ふつうのドット絵は数百ランです。上限に当たったら、色数を減らすか近い色をまとめてください。',
          ],
        },
      ],
    },
    {
      id: 'money',
      title: 'ロイヤリティとお金の流れ',
      items: [
        {
          q: 'mint にいくらかかる？',
          a: ['mint は無料です。かかるのはネットワークのガス代だけ。PIX（描くページ）の右の欄に、チェーンごとの費用が mint 前に出ます。'],
        },
        {
          q: 'pixmint での売上はどう分けられる？',
          a: [
            'pixmint で売れたとき（作品ページ →「購入する」）、コントラクトが自動で分配します。',
            '| 販売 | mederu 手数料 | 作者ロイヤリティ | 売り手の受け取り |',
            '| 一次販売（作者が売る） | 2.5% | — | 97.5% |',
            '| 二次販売（コレクターが売る） | 2.5% | 0〜10%（mint 時に設定） | 残り |',
            '例: ロイヤリティ 5% の作品が 1 ETH で二次販売 → mederu 0.025 ETH・作者 0.05 ETH・売り手 0.925 ETH。',
            'mederu の手数料は 5% を超えられません。この上限はコントラクトに固定されています。',
          ],
        },
        {
          q: 'OpenSea などでは？',
          a: [
            'pixmint の作品は標準の ERC-721 なので、他のマーケットでも表示・売買できます。作者ロイヤリティはマーケットに申告していますが（ERC-2981）、いまは多くのマーケットで支払いが買い手任せになっています。',
            'ロイヤリティが確実に支払われるのは pixmint で売れたときだけです。他のマーケットでの売買から mederu は手数料を取りません。',
          ],
        },
        {
          q: 'ロイヤリティやタイトルはあとで変えられる？',
          a: ['変えられません。タイトルとロイヤリティは mint 時に書き込まれ、絵と同じく永久です。表示名はいつでも変えられます。'],
        },
      ],
    },
    {
      id: 'mint',
      title: 'mint の仕方',
      items: [
        {
          q: '手順',
          a: [
            '- 右上でウォレットを接続します。MetaMask・Rabby・Phantom などのブラウザ拡張が使えます。',
            '- PIX（描くページ）で絵を描きます。右の「チェーンに載る絵」が、実際に保存される絵そのものです。',
            '- タイトルを入れます（任意・96 bytes まで＝日本語で約32文字）。無題なら「pixmint #番号」になります。',
            '- 二次販売のロイヤリティを選びます（0 / 2.5 / 5 / 7.5 / 10%）。',
            '- チェーン（Ethereum か Base）を選んで mint を押し、ウォレットで確認します。',
            '- 終わったら作品ページへ。そこから出品できます。',
          ],
        },
        {
          q: '出品するには？ やめるには？',
          a: ['作品ページで価格（ETH）を入れて「出品」。やめるときは「出品をやめる」。作品を譲渡すると出品は自動で取り消されます。'],
        },
        {
          q: '表示名を設定するには？',
          a: [
            '右上のウォレットメニュー →「表示名を設定」。作品や一覧でアドレスの代わりに表示され、マーケットでも「Artist」として出ます。設定していなければ .eth → Basename → アドレスの順で表示します。表示名はチェーンごとに保存されます。',
          ],
        },
      ],
    },
    {
      id: 'draw',
      title: 'PIX（描くページ）の使い方',
      items: [
        {
          q: '道具',
          a: [
            '| 道具 | できること |',
            '| ペン | いまの色で塗ります。ドラッグしてもマスが途切れません。 |',
            '| 消しゴム | マスを消して背景色に戻します。 |',
            '| 塗りつぶし | つながった同じ色の範囲を塗ります。 |',
            '| スポイト | キャンバスの色を拾って、ペンに戻ります。 |',
            '| 選択 | 四角くドラッグして選びます。中をドラッグすると動かせます。⌘C / ⌘X / ⌘V でコピー・切り取り・貼り付け。 |',
            '| スタンプ | ドット絵のスタンプを押します（下の「スタンプ」）。 |',
            '| 戻す / やり直す | 1つ前に戻る・戻したものをやり直す（50回まで）。 |',
            '| 画像 | PNG・JPEG・SVG をドット絵にします（キャンバスへのドロップ・貼り付けでも）。 |',
            '| 全消し | キャンバスを全部消します。どかーん（戻せます）。 |',
          ],
        },
        {
          q: '色とパレット',
          a: [
            '- パレットの色をクリックで選択。大きなチップと16進コードがいまの色です。',
            '- パレットの色を選んだまま色（チップか16進コード）を変えると、その枠の色も変わります。自分のパレットが作れます。↺ でそのパレットを元に戻せます。',
            '- 「背景」で背景色を設定。消したマスや塗っていないマスはこの色になります。',
            '- パレットは30色×7種類: neon / earth / gameboy / kawaii / kidcore / holo / vaporwave。',
          ],
        },
        {
          q: 'グリッドサイズ',
          a: [
            '- 8・16・32・48・64・96・128 マス。サイズを変えるとキャンバスは消えます（先に確認が出ます）。',
            '- ODD を押すと1マス足して（9×9〜129×129）、ちょうど真ん中のマスができます。真ん中はうっすらした十字で示します。切り替えても絵は残ります。',
            '- 細かいイラストは 96×96 がちょうどよいことが多いです。',
          ],
        },
        {
          q: 'スタンプ',
          a: [
            '- 「スタンプ」（T）を選び、12種類のオリジナルのドット絵から1つ選んで、キャンバスをクリックします。押す位置に薄く下見が出ます。',
            '- R で 90° 回す、F で左右反転、1× / 2× で大きさを変えます。',
            '- スタンプの一部は今の色に染まります。輪郭や細かい部分は、もとの色のままです。',
          ],
        },
        {
          q: '音',
          a: ['スタンプ・塗りつぶし・戻す・やり直す・全消しで小さな音が鳴ります。左の列の一番下にある「音」のボタンでオン・オフでき、このブラウザに覚えておきます。'],
        },
        {
          q: 'PNG を保存',
          a: [
            '左の列の一番下のボタン（または S キー）で、約2048pxに拡大した PNG を保存します。ドットはぼけません。X などにそのまま投稿できます。ただの画像の保存で、mint はされません。',
          ],
        },
        {
          q: '描きかけは保存される？',
          a: ['描きかけの絵と編集したパレットは、このブラウザに残ります。サイトのデータを消したり別のブラウザで開いたりすると最初からです。永久に残すのは mint だけです。'],
        },
      ],
    },
    {
      id: 'keys',
      title: 'ショートカット',
      items: [
        {
          q: 'キー一覧',
          a: [
            '| キー | 操作 |',
            '| B | ペン |',
            '| E | 消しゴム |',
            '| G | 塗りつぶし |',
            '| I | スポイト |',
            '| M | 選択（四角くドラッグ。中をドラッグすると動かせる） |',
            '| ⌘C / ⌘X / ⌘V | 選んだ範囲のコピー / 切り取り / 貼り付け |',
            '| ⌘A | すべて選択 |',
            '| 矢印キー | 選んだ範囲を1マス動かす |',
            '| Enter / Esc | 動かした・貼り付けた絵を確定 / 取り消し |',
            '| Delete | 選んだ範囲を消す |',
            '| T | スタンプ（R 回す · F 反転） |',
            '| S | PNG を保存 |',
            '| ⌘Z / Ctrl+Z | 戻す |',
            '| ⇧⌘Z / Ctrl+Y | やり直す |',
            '文字を入力している間は効きません。',
          ],
        },
        {
          q: '画像をドット絵にする',
          a: [
            'キャンバスに画像（PNG・JPEG・GIF・WebP・SVG）をドロップするか、⌘V で貼り付けるか、「画像」ボタンで選びます。今のグリッドのサイズに合わせます。',
            '色数・ディザ・「今のパレットに寄せる」を選んで「置く」を押します。浮いた状態で置かれるので、動かしてから Enter で確定します。',
            '拡大したドット絵（pixmint の PNG など）は自動で見分けて、1マスずつ読み取るのでにじみません。背景と同じ色は透明にします。',
            '細かすぎてチェーン上で描けない（ラン 2,048 超え）ときは、自動で収めます。「バランス」（既定）は色数をいくつか試して元にいちばん近いものを選び、「色数を優先」は小さな点を周りの色にまとめ、「細部を優先」は代わりに色数を減らします。細かいイラストは 96×96 がちょうどよいことが多いです。',
          ],
        },
      ],
    },
  ],
};
