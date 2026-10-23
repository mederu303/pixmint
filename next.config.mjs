/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  webpack(config, { webpack }) {
    // @wagmi/connectors の入口から Base Account → @coinbase/cdp-sdk → @x402/* と辿るが、
    // @x402 は入っていない（optional）。pixmint は Base Account コネクタを使わないので無視させる。
    // （mederux で WalletConnect を外す原因になったビルドエラーと同じもの）
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^@x402\// }));
    return config;
  },
};
