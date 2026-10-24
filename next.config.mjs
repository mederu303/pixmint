import fs from 'node:fs';
import { execSync } from 'node:child_process';

// クレジット画面に出すバージョンとビルド番号（Vercel では push したコミット、手元では git の今のコミット）
const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let build = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7);
if (!build) {
  try {
    build = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    build = 'dev';
  }
}

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_VERSION: pkg.version, NEXT_PUBLIC_BUILD: build },
  // セキュリティヘッダー: 他サイトの iframe に埋め込ませない（mint / 購入ボタンを押させるクリックジャッキング対策）など
  async headers() {
    return [
      {
        // /l/embed/ 以外は埋め込み禁止
        source: '/((?!l/embed/).*)',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // X のプレイヤーカード（ツイートの中で作品を見せる）だけは X からの埋め込みを許す。
        // このページは見るだけ（mint・購入のボタンを置かない）なので、クリックジャッキングの心配は無い
        source: '/l/embed/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors https://x.com https://*.x.com https://twitter.com https://*.twitter.com; base-uri 'self'; object-src 'none'; form-action 'self'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  webpack(config, { webpack }) {
    // @wagmi/connectors の入口から Base Account → @coinbase/cdp-sdk → @x402/* と辿るが、
    // @x402 は入っていない（optional）。pixmint は Base Account コネクタを使わないので無視させる。
    // （mederux で WalletConnect を外す原因になったビルドエラーと同じもの）
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^@x402\// }));
    return config;
  },
};
