/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // セキュリティヘッダー: 他サイトの iframe に埋め込ませない（mint / 購入ボタンを押させるクリックジャッキング対策）など
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
          { key: 'X-Frame-Options', value: 'DENY' },
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
