// pixmint — サイトでの表示の管理（コピー対策など。docs/moderation.md）
//
// コントラクトには作品を消す・ウォレットを止める機能が無い（誰も作品を消せない、という約束）。
// なのでここで止められるのは「pixmint のサイトでの見せ方」まで:
//   ・隠す作品: MINTED・スタンプの一覧に出さない。作品ページは注意を出し、購入・出品のボタンを出さない
//   ・止めるウォレット: その作者の作品を全部隠す。サイトからのミント・購入・出品を止める
// コントラクトを直接呼ばれればミントや売買はできる。変えたらデプロイすると反映される。
// 完全に同じ絵のコピーは、ここに書かなくても自動で見つけて印を付ける（lib/contract.ts の findOriginal）

/** 隠す作品。"<chainId>:<版>:<番号>" で書く（例: Base の v4 #4 → '8453:4:4'） */
export const HIDDEN_WORKS = new Map<string, string>([
  // [キー, 理由（作品ページに出す）]
  ['8453:4:4', 'copy of Base #2 "Stormy Day" by @neuromancer'],
]);

/** 止めるウォレット（小文字で書く）。値は理由（記録用） */
export const BLOCKED_WALLETS = new Map<string, string>([
  ['0x404826e8819430b457c95765aaa807e9abc75e4f', '2026-10-26 copy-minted Base v4 #2 as #4'],
]);

export const workKey = (w: { chainId: number; ver: number; id: bigint }) => `${w.chainId}:${w.ver}:${w.id}`;
export const isBlocked = (address?: string | null) => !!address && BLOCKED_WALLETS.has(address.toLowerCase());
/** サイトで隠す作品か（一覧に出さない・売買のボタンを出さない） */
export const isHidden = (w: { chainId: number; ver: number; id: bigint; creator: string }) => HIDDEN_WORKS.has(workKey(w)) || isBlocked(w.creator);
