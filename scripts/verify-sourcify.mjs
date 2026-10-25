// pixmint — コントラクトのソースを Sourcify で公開する（API キー不要。Etherscan / Blockscout も Sourcify の結果を読む）
//
//   node scripts/verify-sourcify.mjs <chainId> <PixMint のアドレス> [deploy の tx ハッシュ] [v4]
//   v4 を付けると contracts/PixMint4.sol（lib/PixMint4.json）
//
// test/run.mjs と同じ設定（solc-js・optimizer 200・evmVersion cancun）でビルドしたものを送る
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import solc from 'solc';

const [chainId, address, txHash, verArg] = process.argv.slice(2);
const v4 = verArg === 'v4';
const FILE = v4 ? 'PixMint4.sol' : 'PixMint.sol';
const NAME = v4 ? 'PixMint4' : 'PixMint';
if (!chainId || !/^0x[0-9a-fA-F]{40}$/.test(address ?? '')) {
  console.error('使い方: node scripts/verify-sourcify.mjs <chainId> 0x<PixMint> [deploy tx]');
  process.exit(1);
}
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sources = { [FILE]: { content: fs.readFileSync(path.join(root, 'contracts', FILE), 'utf8') } };
const input = {
  language: 'Solidity',
  sources,
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
};
// import を解決しながら、使った OpenZeppelin のファイルを sources に足す（Sourcify には全部送る）
const out = JSON.parse(
  solc.compile(JSON.stringify(input), {
    import: (p) => {
      const contents = fs.readFileSync(require.resolve(p), 'utf8');
      sources[p] = { content: contents };
      return { contents };
    },
  }),
);
const errs = (out.errors ?? []).filter((e) => e.severity === 'error');
if (errs.length) throw new Error(errs.map((e) => e.formattedMessage).join('\n'));
const built = '0x' + out.contracts[FILE][NAME].evm.bytecode.object;
const committed = JSON.parse(fs.readFileSync(path.join(root, v4 ? 'lib/PixMint4.json' : 'lib/PixMint.json'))).bytecode;
if (built !== committed) throw new Error('lib/PixMint.json と今のソースのビルド結果が違います（npm test で作り直してから）');

const compilerVersion = solc.version().replace('.Emscripten.clang', '');
const body = { stdJsonInput: input, compilerVersion, contractIdentifier: `${FILE}:${NAME}`, ...(txHash ? { creationTransactionHash: txHash } : {}) };
const API = 'https://sourcify.dev/server';
const res = await fetch(`${API}/v2/verify/${chainId}/${address}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const j = await res.json();
if (!res.ok) {
  console.error(res.status, JSON.stringify(j));
  process.exit(1);
}
console.log(`送信しました（compiler ${compilerVersion}）。確認中…`);
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const s = await (await fetch(`${API}/v2/verify/${j.verificationId}`)).json();
  if (s.isJobCompleted) {
    if (s.error) {
      console.error('失敗:', JSON.stringify(s.error).slice(0, 600));
      process.exit(1);
    }
    console.log(`公開できました: ${s.contract?.match ?? s.contract?.runtimeMatch} → https://repo.sourcify.dev/${chainId}/${address}`);
    process.exit(0);
  }
}
console.log('まだ確認中です。あとで https://sourcify.dev で確かめてください');
