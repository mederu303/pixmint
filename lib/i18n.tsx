'use client';
// pixmint — 表示言語（EN / JP）。既定は英語。選んだ言語はこのブラウザに残す
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const en = {
  'nav.draw': 'Draw',
  'nav.works': 'Works',
  'nav.help': 'Help',
  'wallet.connect': 'Connect wallet',
  'wallet.connecting': 'Connecting…',
  'wallet.browser': 'Browser extension',
  'wallet.wc': 'WalletConnect (mobile)',
  'wallet.testArtist': 'Test wallet: artist',
  'wallet.testBuyer': 'Test wallet: buyer',
  'wallet.setName': 'Display name',
  'wallet.disconnect': 'Disconnect',
  footer: 'pixmint by mederu.art · every pixel lives on-chain',

  'tool.pen': 'Pen',
  'tool.eraser': 'Eraser',
  'tool.fill': 'Fill',
  'tool.select': 'Select',
  'tool.import': 'Image',
  'tool.importHint': 'Turn an image into pixels (or drop / paste one onto the canvas)',
  'import.title': 'Image → pixels',
  'import.colors': 'Colors',
  'import.dither': 'Dither',
  'import.usePalette': 'Use current palette',
  'import.reduced': 'Reduced to {n} colors so it fits on-chain.',
  'import.note': 'Fitted to {size}×{size}. It is placed as a floating layer: drag or use arrow keys, then Enter.',
  'import.apply': 'Place',
  'import.keepLabel': 'If it is too detailed for on-chain',
  'import.keepBalanced': 'Balanced',
  'import.keepBalancedHint': 'Try several color counts and pick the one that looks closest to the original',
  'import.balanced': 'Picked {n} colors: the closest look that fits on-chain.',
  'import.keepColors': 'Keep colors',
  'import.keepDetail': 'Keep detail',
  'import.keepColorsHint': 'Merge tiny specks into the colors around them; the number of colors stays',
  'import.keepDetailHint': 'Keep every speck and use fewer colors instead',
  'import.simplified': 'Merged tiny specks so it fits on-chain ({n} colors kept).',
  'import.detected': 'Pixel art detected: {w}×{h}. Reading each cell as-is (no blur).',
  'import.shrunk': 'Larger than {size}×{size}, so it is reduced without mixing colors.',
  'import.asPixels': 'Read as pixel art',
  'import.dropBg': 'Background → transparent',
  'import.dropBgHint': 'Cells the same color as the current background become transparent',
  'import.cancel': 'Cancel',
  'tool.picker': 'Picker',
  'tool.undo': 'Undo',
  'tool.clear': 'Clear',
  'editor.color': 'Color',
  'editor.bg': 'Background',
  'editor.bgShort': 'BG',
  'editor.palette': 'Palette',
  'editor.grid': 'Grid',
  'editor.resetPalette': 'Reset',
  'editor.resizeConfirm': 'Changing the grid size clears your drawing. Continue?',
  'editor.oddHint': 'ODD: one more cell (e.g. 33×33) so there is a center pixel. Your drawing stays.',
  'editor.oddCropConfirm': 'Turning ODD off removes the right column and bottom row, which have pixels. Continue?',
  'editor.editHint': 'Color edits update the selected swatch',
  'editor.download': 'Download PNG',
  'editor.downloadHint': '{px}px · for X / social',

  'mint.onchain': 'On-chain image',
  'mint.data': 'Data',
  'mint.colors': 'Colors',
  'mint.runs': 'Runs',
  'mint.tooDetailed': 'Too detailed to render on-chain (over 2,048 runs). Fewer colors, merging similar colors, or larger flat areas will fix it.',
  'mint.nearLimit': 'Close to the on-chain limit (2,048 runs = same-color stretches in a row). Fewer colors or flatter areas keep it mintable.',
  'mint.title': 'Title · permanent',
  'mint.titlePh': 'Untitled → pixmint #id',
  'mint.bytes': '{n}/{max} bytes',
  'mint.royalty': 'Resale royalty · permanent',
  'mint.chain': 'Chain',
  'mint.noChain': 'No contract configured (NEXT_PUBLIC_PIXMINT_* in .env.local)',
  'mint.fee': 'Mint fee',
  'mint.free': 'Free',
  'mint.gas': 'Gas (estimate)',
  'mint.about': '≈ {v} ETH',
  'mint.baseNote': 'Base adds a small L1 data fee',
  'mint.gasUnits': 'Gas × price',
  'mint.live': 'Gas price refreshes every 12 s',
  'mint.compare': 'Cost on each chain (tap to choose)',
  'mint.same': 'This exact image is already minted on {chain}:',
  'mint.sameConfirm': 'This exact image is already minted on {chain} ({ids}). Mint another copy anyway?',
  'mint.colorHint': 'Tip: merging your least-used color {color} ({cells} px) into its nearest color makes the data about {pct}% smaller (≈ cheaper).',
  'mint.testnetFiat': 'testnets: gas measured on the testnet × the current mainnet gas price (Sepolia → Ethereum, Base Sepolia → Base). Sepolia already has the Glamsterdam gas changes, so its gas is higher than Ethereum today',
  'mint.button': 'Mint on {chain}',
  'mint.busy': 'Processing…',
  'mint.confirm': 'Confirm in your wallet…',
  'mint.writing': 'Writing to the chain…',
  'mint.done': 'Minted',
  'mint.opening': 'Minted! Opening your work…',
  'mint.failed': 'Transaction failed',
  'mint.toWork': 'View work',

  'gallery.count': '{n} works',
  'gallery.empty': 'No works yet.',
  'gallery.more': 'Load more',
  'gallery.chains': 'Chains to show',
  'gallery.opensea': 'OpenSea · {chain}',
  'gallery.since': 'Since Oct 2026',
  'gallery.fee': '{pct}% sales fee',
  'gallery.statWorks': 'Works',
  'gallery.statArtists': 'Artists',
  'gallery.statOwners': 'Owners',
  'gallery.statListed': 'Listed',
  'gallery.statFloor': 'Floor',
  'gallery.toggle': 'Show / hide works on this chain',

  'work.by': 'by',
  'work.loading': 'Loading…',
  'work.notFound': 'Work not found',
  'work.noChain': 'This chain is not configured',
  'work.artist': 'Artist',
  'work.owner': 'Owner',
  'work.grid': 'Grid',
  'work.colors': 'Colors',
  'work.royalty': 'Royalty',
  'work.minted': 'Minted',
  'work.storage': 'Storage',
  'work.fullyOnchain': 'Fully on-chain',
  'work.forSale': 'For sale',
  'work.fee': 'mederu fee',
  'work.toArtist': 'To artist',
  'work.toOwner': 'To owner',
  'work.unlist': 'Cancel listing',
  'work.buy': 'Buy',
  'work.listTitle': 'List for sale on pixmint (fee {fee}%)',
  'work.list': 'List',
  'work.notForSale': 'Not for sale',
  'work.note': 'The image lives inside the contract, which also renders the SVG. No IPFS, no server.',

  'banner.testnet': 'TESTNET — pixmint is running on Sepolia and Base Sepolia. Test ETH has no value; works minted here are for trying it out.',

  'me.title': 'Display name',
  'me.desc':
    'Shown instead of your address on works and lists. You can change it any time (your works stay the same). Without one, we show your .eth, then Basename, then the address.',
  'me.connect': 'Connect a wallet to set your display name.',
  'me.current': 'Shown as',
  'me.onChain': 'Name on {chain}',
  'me.ph': 'e.g. medenyan',
  'me.saveChain': 'Chain to save on (each chain keeps its own name)',
  'me.save': 'Save on {chain}',
  'me.badChars': 'Names can\'t contain "." or start with "0x" (so they can\'t be mistaken for an ENS name or address).',
  'name.pixTip': 'pixmint display name — set by the artist, not verified',
};

type Key = keyof typeof en;

const ja: Record<Key, string> = {
  'nav.draw': '描く',
  'nav.works': '作品',
  'nav.help': 'ヘルプ',
  'wallet.connect': 'ウォレット接続',
  'wallet.connecting': '接続中…',
  'wallet.browser': 'ブラウザ拡張',
  'wallet.wc': 'WalletConnect（スマホ）',
  'wallet.testArtist': 'テスト用：作者',
  'wallet.testBuyer': 'テスト用：購入者',
  'wallet.setName': '表示名を設定',
  'wallet.disconnect': '切断',
  footer: 'pixmint by mederu.art · 絵はすべてチェーンの中にあります',

  'tool.pen': 'ペン',
  'tool.eraser': '消しゴム',
  'tool.fill': '塗りつぶし',
  'tool.select': '選択',
  'tool.import': '画像',
  'tool.importHint': '画像をドット絵にする（キャンバスにドロップ・貼り付けでも）',
  'import.title': '画像 → ドット絵',
  'import.colors': '色数',
  'import.dither': 'ディザ',
  'import.usePalette': '今のパレットに寄せる',
  'import.reduced': 'チェーン上に収まるよう {n} 色に減らしました。',
  'import.note': '{size}×{size} に合わせます。浮いた状態で置くので、ドラッグか矢印キーで動かして Enter で確定します。',
  'import.apply': '置く',
  'import.keepLabel': 'チェーン上に収まらないとき',
  'import.keepBalanced': 'バランス',
  'import.keepBalancedHint': '色数をいくつか試して、元の画像にいちばん近く見えるものを選びます',
  'import.balanced': 'チェーン上に収まる中で、元にいちばん近い {n} 色を選びました。',
  'import.keepColors': '色数を優先',
  'import.keepDetail': '細部を優先',
  'import.keepColorsHint': '小さな点を周りの色にまとめます。色数はそのまま',
  'import.keepDetailHint': '点は残して、代わりに色数を減らします',
  'import.simplified': 'チェーン上に収まるよう小さな点をまとめました（{n} 色のまま）。',
  'import.detected': 'ドット絵を見つけました: {w}×{h}。1マスずつそのまま読み取ります（にじみません）。',
  'import.shrunk': '{size}×{size} より大きいので、色を混ぜずに縮めます。',
  'import.asPixels': 'ドット絵として読む',
  'import.dropBg': '背景色 → 透明',
  'import.dropBgHint': '今の背景と同じ色のマスを透明にします',
  'import.cancel': 'やめる',
  'tool.picker': 'スポイト',
  'tool.undo': '戻す',
  'tool.clear': '全消し',
  'editor.color': '色',
  'editor.bg': '背景',
  'editor.bgShort': '背景',
  'editor.palette': 'パレット',
  'editor.grid': 'グリッド',
  'editor.resetPalette': '元に戻す',
  'editor.resizeConfirm': 'サイズを変えると今の絵は消えます。続けますか？',
  'editor.oddHint': 'ODD: 1マス足して（例 33×33）真ん中のマスを作ります。今の絵は残ります。',
  'editor.oddCropConfirm': 'ODD を切ると右端の列と下端の行が消えます（絵があります）。続けますか？',
  'editor.editHint': '色を変えると選んだ枠も変わります',
  'editor.download': 'PNG を保存',
  'editor.downloadHint': '{px}px · X 投稿向け',

  'mint.onchain': 'チェーンに載る絵',
  'mint.data': 'データ',
  'mint.colors': '色数',
  'mint.runs': 'ラン',
  'mint.tooDetailed': '細かすぎてチェーン上で描けません（ラン 2,048 超え）。色数を減らす・似た色をまとめる・同じ色の面を広くすると mint できます。',
  'mint.nearLimit': 'チェーン上の上限（ラン 2,048 = 横に続く同じ色の区間の数）に近づいています。色数を減らすか、同じ色の面を広くすると安心です。',
  'mint.title': 'タイトル（変更不可）',
  'mint.titlePh': '無題なら pixmint #番号',
  'mint.bytes': '{n}/{max} bytes',
  'mint.royalty': '二次販売ロイヤリティ（変更不可）',
  'mint.chain': 'チェーン',
  'mint.noChain': 'コントラクトが設定されていません（.env.local の NEXT_PUBLIC_PIXMINT_*）',
  'mint.fee': 'mint 手数料',
  'mint.free': '無料',
  'mint.gas': 'ガス代（目安）',
  'mint.about': '約 {v} ETH',
  'mint.baseNote': 'Base は L1 データ代が少し上乗せされます',
  'mint.gasUnits': 'ガス量 × 価格',
  'mint.live': 'ガス価格は 12 秒ごとに更新',
  'mint.compare': 'チェーンごとの費用（押すと選べます）',
  'mint.same': 'まったく同じ絵が {chain} でもう mint されています:',
  'mint.sameConfirm': 'まったく同じ絵が {chain} でもう mint されています（{ids}）。それでももう1つ mint しますか？',
  'mint.colorHint': 'ヒント: いちばん少ない色 {color}（{cells} マス）を近い色にまとめると、データが約 {pct}% 減ります（そのぶん安くなる目安）。',
  'mint.testnetFiat': 'テストネットは「テストネットで測った gas 量 × 対応するメインネットの今のガス価格」で出しています（Sepolia → Ethereum・Base Sepolia → Base）。Sepolia は Glamsterdam の値上げが先に入っているので、今の Ethereum より gas 量が多めです',
  'mint.button': '{chain} で mint',
  'mint.busy': '処理中…',
  'mint.confirm': 'ウォレットで確認してください…',
  'mint.writing': 'チェーンに書き込み中…',
  'mint.done': 'mint しました',
  'mint.opening': 'mint しました！作品ページを開きます…',
  'mint.failed': 'トランザクションが失敗しました',
  'mint.toWork': '作品ページへ',

  'gallery.count': '{n} 点',
  'gallery.empty': 'まだ作品がありません。',
  'gallery.more': 'もっと見る',
  'gallery.chains': '表示するチェーン',
  'gallery.opensea': 'OpenSea · {chain}',
  'gallery.since': '2026年10月から',
  'gallery.fee': '販売手数料 {pct}%',
  'gallery.statWorks': '作品',
  'gallery.statArtists': '作者',
  'gallery.statOwners': '持ち主',
  'gallery.statListed': '出品中',
  'gallery.statFloor': '最安値',
  'gallery.toggle': 'このチェーンの作品を表示する／隠す',

  'work.by': 'by',
  'work.loading': '読み込み中…',
  'work.notFound': '作品が見つかりません',
  'work.noChain': 'このチェーンは設定されていません',
  'work.artist': '作者',
  'work.owner': '持ち主',
  'work.grid': 'グリッド',
  'work.colors': '色数',
  'work.royalty': 'ロイヤリティ',
  'work.minted': 'mint',
  'work.storage': '保存',
  'work.fullyOnchain': '完全オンチェーン',
  'work.forSale': '販売中',
  'work.fee': 'mederu 手数料',
  'work.toArtist': '作者へ',
  'work.toOwner': '持ち主へ',
  'work.unlist': '出品をやめる',
  'work.buy': '購入する',
  'work.listTitle': '出品する（pixmint 内で販売。手数料 {fee}%）',
  'work.list': '出品',
  'work.notForSale': '販売していません',
  'work.note': '絵はコントラクトの中にあり、SVG もコントラクトが組み立てます。IPFS やサーバーには依存していません。',

  'banner.testnet': 'テストネット — いまは Sepolia と Base Sepolia で動いています。テスト用の ETH に価値はなく、ここで mint した作品はお試し用です。',

  'me.title': '表示名',
  'me.desc':
    '作品や一覧で、アドレスの代わりにこの名前が出ます。いつでも変えられます（作品そのものは変わりません）。設定していなければ .eth → Basename → アドレスの順で表示します。',
  'me.connect': '表示名を設定するにはウォレットを接続してください。',
  'me.current': 'いまの表示',
  'me.onChain': '{chain} の表示名',
  'me.ph': '例: medenyan',
  'me.saveChain': '保存するチェーン（チェーンごとに別々に保存されます）',
  'me.save': '{chain} に保存',
  'me.badChars': '「.」を含む名前と「0x」で始まる名前は使えません（.eth の名前やアドレスと見分けがつかなくなるため）。',
  'name.pixTip': 'pixmint の表示名（作者が自分で付けた名前・検証なし）',
};

export type Lang = 'en' | 'ja';
const DICT: Record<Lang, Record<Key, string>> = { en, ja };
const KEY = 'pixmint-lang';

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: Key, vars?: Record<string, string | number>) => string;
}

const I18n = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: (k) => en[k] });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  useEffect(() => {
    try {
      const l = localStorage.getItem(KEY);
      if (l === 'ja' || l === 'en') setLangState(l);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {}
  };
  const t = (k: Key, vars?: Record<string, string | number>) =>
    (DICT[lang][k] ?? en[k]).replace(/\{(\w+)\}/g, (_, v) => String(vars?.[v] ?? ''));
  return <I18n.Provider value={{ lang, setLang, t }}>{children}</I18n.Provider>;
}

export const useI18n = () => useContext(I18n);

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang">
      <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>
        EN
      </button>
      <button className={lang === 'ja' ? 'on' : ''} onClick={() => setLang('ja')}>
        JP
      </button>
    </div>
  );
}
