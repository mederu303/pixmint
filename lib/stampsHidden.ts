// pixmint — Pix のスタンプ一覧に出さないスタンプ（荒らし対策 B。docs/v4-stamps.md）
//   チェーンには残る（誰でも出せて消えない）が、サイトの一覧には出さない。"<chainId>:<id>" で書く
//   例: '84532:12'
export const HIDDEN_STAMPS = new Set<string>([]);
