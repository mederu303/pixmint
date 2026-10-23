'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatEther, formatGwei, parseEventLogs } from 'viem';
import { useAccount, useSwitchChain, useWriteContract } from 'wagmi';
import { Wallet } from './Header';
import { encodePxm, pxmToSvg, validatePxm, PXM_MAX_RUNS } from '../src/pxm';
import { LABEL, PIX_CHAINS, pixChain } from '../lib/chains';
import { PIXMINT_ABI, client, estimateMintGas, readNum, svgUrl } from '../lib/contract';
import { flatten, type PixGrid } from '../lib/pix';
import { useI18n } from '../lib/i18n';

const ROYALTIES = [0, 250, 500, 750, 1000];
const TITLE_MAX = 96;
const enc = new TextEncoder();
const toHex = (b: Uint8Array) => ('0x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')) as `0x${string}`;

export function MintPanel({ grid, bg }: { grid: PixGrid; bg: string }) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [royalty, setRoyalty] = useState(500);
  const [chainId, setChainId] = useState<number>(PIX_CHAINS[0]?.chain.id ?? 0);
  const [gasPrice, setGasPrice] = useState<bigint | null>(null);
  const [mintPrice, setMintPrice] = useState<bigint>(0n);
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'bad'; text?: string; id?: bigint }>({
    kind: 'idle',
  });

  const { isConnected, address, chainId: walletChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  // 絵 → PXM（チェーンに置くバイト列）。上限超えはここで分かる
  const encoded = useMemo(() => {
    try {
      const bytes = encodePxm(flatten(grid, bg), bg);
      return { bytes, info: validatePxm(bytes), svg: pxmToSvg(bytes), error: null as string | null };
    } catch (e) {
      return { bytes: null, info: null, svg: null, error: (e as Error).message };
    }
  }, [grid, bg]);

  const titleBytes = enc.encode(title).length;
  const titleBad = titleBytes > TITLE_MAX || /[\u0000-\u001f\u007f]/.test(title);

  useEffect(() => {
    if (!chainId) return;
    let live = true;
    setGasPrice(null);
    // ガス価格はブロックごとに動くので 12 秒ごとに取り直す
    const poll = () => client(chainId).getGasPrice().then((g) => live && setGasPrice(g)).catch(() => {});
    poll();
    const timer = setInterval(poll, 12_000);
    readNum(chainId, 'mintPrice').then((p) => live && setMintPrice(p)).catch(() => {});
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [chainId]);

  // gas はチェーンに聞く（Glamsterdam のような料金改定に追従するため）。聞けないときだけ式で概算
  const [chainGas, setChainGas] = useState<bigint | null>(null);
  useEffect(() => {
    setChainGas(null);
    const p = pixChain(chainId);
    if (!p || !encoded.bytes || titleBad) return;
    let live = true;
    const bytes = encoded.bytes;
    const timer = setTimeout(() => {
      client(chainId)
        .estimateContractGas({
          address: p.address,
          abi: PIXMINT_ABI,
          functionName: 'mint',
          args: [toHex(bytes), title.trim(), royalty],
          value: mintPrice,
          account: address ?? '0x000000000000000000000000000000000000dEaD',
        })
        .then((g) => live && setChainGas(g))
        .catch(() => {});
    }, 500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [chainId, encoded.bytes, title, titleBad, royalty, mintPrice, address]);
  const gas = chainGas ?? (encoded.bytes ? BigInt(estimateMintGas(encoded.bytes.length, titleBytes)) : 0n);
  const fee = gasPrice != null ? gas * gasPrice : null;

  async function mint() {
    if (!encoded.bytes) return;
    const p = pixChain(chainId)!;
    try {
      setStatus({ kind: 'busy', text: t('mint.confirm') });
      if (walletChain !== chainId) await switchChainAsync({ chainId });
      const hash = await writeContractAsync({
        chainId,
        address: p.address,
        abi: PIXMINT_ABI,
        functionName: 'mint',
        args: [toHex(encoded.bytes), title.trim(), royalty],
        value: mintPrice,
      });
      setStatus({ kind: 'busy', text: t('mint.writing') });
      const receipt = await client(chainId).waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error(t('mint.failed'));
      const ev = parseEventLogs({ abi: PIXMINT_ABI, logs: receipt.logs, eventName: 'Minted' })[0] as
        | { args: { id: bigint } }
        | undefined;
      setStatus({ kind: 'ok', text: t('mint.done'), id: ev?.args.id });
    } catch (e) {
      const msg = (e as { shortMessage?: string; message: string }).shortMessage ?? (e as Error).message;
      setStatus({ kind: 'bad', text: msg.split('\n')[0] });
    }
  }

  const ready = !!encoded.bytes && !titleBad && !!chainId && status.kind !== 'busy';

  return (
    <div className="mintcol">
      <div className="panel pv">
        <h3>{t('mint.onchain')}</h3>
        <div className="pv-box">
        {encoded.svg ? (
          <img className="preview" src={svgUrl(encoded.svg)} alt="preview" />
        ) : (
          <p className="note bad">{t('mint.tooDetailed')}</p>
        )}
        </div>
        {encoded.info && (
          <div className="meta">
            <span>{t('mint.data')}</span>
            <b>{encoded.bytes!.length.toLocaleString()} bytes</b>
            <span>{t('mint.colors')}</span>
            <b>{encoded.info.colors}</b>
            <span>{t('mint.runs')}</span>
            <b>
              {encoded.info.runs.toLocaleString()} / {PXM_MAX_RUNS.toLocaleString()} (
              {Math.round((encoded.info.runs / PXM_MAX_RUNS) * 100)}%)
            </b>
          </div>
        )}
      </div>

      <div className="panel stack">
        <label className="stack" style={{ gap: 4 }}>
          <span className="note lbl">
            {t('mint.title')}
            <span className={titleBad ? 'bad' : ''}>{t('mint.bytes', { n: titleBytes, max: TITLE_MAX })}</span>
          </span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('mint.titlePh')} />
        </label>

        <div className="stack" style={{ gap: 4 }}>
          <span className="note">{t('mint.royalty')}</span>
          <div className="chips">
            {ROYALTIES.map((b) => (
              <button key={b} className={`tool ${royalty === b ? 'on' : ''}`} onClick={() => setRoyalty(b)}>
                {b / 100}%
              </button>
            ))}
          </div>
        </div>

        <div className="stack" style={{ gap: 4 }}>
          <span className="note">{t('mint.chain')}</span>
          {PIX_CHAINS.length ? (
            <div className="chips">
              {PIX_CHAINS.map((p) => (
                <button
                  key={p.chain.id}
                  className={`tool ${chainId === p.chain.id ? 'on' : ''}`}
                  onClick={() => setChainId(p.chain.id)}
                >
                  {LABEL[p.chain.id]}
                </button>
              ))}
            </div>
          ) : (
            <p className="note bad">{t('mint.noChain')}</p>
          )}
        </div>

        <div className="meta">
          <span>{t('mint.fee')}</span>
          <b>{mintPrice === 0n ? t('mint.free') : `${formatEther(mintPrice)} ETH`}</b>
          <span>{t('mint.gas')}</span>
          <b>{fee != null ? t('mint.about', { v: Number(formatEther(fee)).toPrecision(2) }) : '—'}</b>
          <span>{t('mint.gasUnits')}</span>
          <b>
            {gas.toLocaleString()} gas{gasPrice != null && ` × ${Number(formatGwei(gasPrice)).toPrecision(2)} gwei`}
          </b>
        </div>
        <p className="note">{t('mint.live')}</p>
        {chainId === 8453 || chainId === 84532 ? (
          <p className="note">{t('mint.baseNote')}</p>
        ) : null}

        {isConnected ? (
          <button onClick={mint} disabled={!ready}>
            {status.kind === 'busy' ? t('mint.busy') : t('mint.button', { chain: LABEL[chainId] ?? '' })}
          </button>
        ) : (
          <Wallet />
        )}
        {status.text && (
          <p className={`note ${status.kind === 'ok' ? 'ok' : status.kind === 'bad' ? 'bad' : ''}`}>
            {status.text}
            {status.id != null && (
              <>
                {' '}
                → <Link href={`/${chainId}/${status.id}`}>{t('mint.toWork')}</Link>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
