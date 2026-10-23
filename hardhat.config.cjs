// ローカル確認用のチェーン（npx hardhat node）。コントラクトのビルドには使っていない（test/run.mjs が solc-js でやる）
module.exports = { networks: { hardhat: { chainId: 31337, hardfork: 'cancun' } } };
