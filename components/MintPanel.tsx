'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { formatEther, formatGwei, parseEventLogs } from 'viem';
import { useAccount, useSwitchChain, useWriteContract } from 'wagmi';
import { Wallet } from './Header';
import { encodePxm, pxmToSvg, validatePxm, PXM_MAX_RUNS } from '../src/pxm';
import { LABEL, PIX_CHAINS, deployment, mintVer, workPath } from '../lib/chains';
import { abiOf, client, estimateMintGas, findSameArt, readNum, svgUrl } from '../lib/contract';
import { OP_CHAINS, TESTNETS, fiat, useEthPrice, useMintCosts } from '../lib/cost';
import { flatten, type PixGrid } from '../lib/pix';
import { countRuns } from '../lib/convert';
import { useI18n } from '../lib/i18n';

const ROYALTIES = [0, 250, 500, 750, 1000];
const TITLE_MAX = 96;
const STAMP_NAME_MAX = 32; // コントラクトの MAX_STAMP_NAME
const MAX_STAMPS = 16; // コントラクトの MAX_STAMPS
const enc = new TextEncoder();
const toHex = (b: Uint8Array) => ('0x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')) as `0x${string}`;

/** 使ったスタンプ（v4。チェーンごとの番号）。Pix がスタンプのボタンで押したものを集める */
export type UsedStamp = { chainId: number; id: bigint; title: string };

/** chainId・onChain: ミントするチェーンは Pix（スタンプの一覧）と共有する。切り替えの確認は呼ぶ側（app/page.tsx） */
export function MintPanel({
  grid,
  bg,
  onFit,
  usedStamps = [],
  chainId,
  onChain,
}: {
  grid: PixGrid;
  bg: string;
  onFit?: () => void;
  usedStamps?: UsedStamp[];
  chainId: number;
  onChain: (id: number) => void;
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [royalty, setRoyalty] = useState(500);
  const [mintPrice, setMintPrice] = useState<bigint>(0n);
  const [stampPrice, setStampPrice] = useState<bigint>(0n);
  const ver = mintVer(chainId);
  // スタンプとして出す（v4・8×8 か 16×16 のときだけ選べる）
  const [asStampOn, setAsStamp] = useState(false);
  const canStamp = ver === 4 && (grid.length === 8 || grid.length === 16);
  const asStamp = canStamp && asStampOn;
  // このチェーンで記録するスタンプ（小さい順・重複なし・16 個まで）。ほかのチェーンのスタンプは記録できない
  const stampIds = useMemo(
    () => [...new Set(usedStamps.filter((s) => s.chainId === chainId).map((s) => s.id))].sort((a, b) => (a < b ? -1 : 1)),
    [usedStamps, chainId],
  );
  const otherChainStamps = usedStamps.filter((s) => s.chainId !== chainId);
  const tooManyStamps = stampIds.length > MAX_STAMPS;
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'bad'; text?: string; id?: bigint }>({
    kind: 'idle',
  });

  const { isConnected, address, chainId: walletChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  // 絵 → PXM（チェーンに置くバイト列）。上限超えはここで分かる
  const encoded = useMemo(() => {
    try {
      // スタンプとして出すときは背景色を色 0 に（Pix で押すと色 0 が透明になる）
      const stampMode = asStampOn && mintVer(chainId) === 4 && (grid.length === 8 || grid.length === 16);
      const bytes = encodePxm(flatten(grid, bg), bg, { bgFirst: stampMode });
      return { bytes, info: validatePxm(bytes), svg: pxmToSvg(bytes), error: null as string | null };
    } catch (e) {
      return { bytes: null, info: null, svg: null, error: (e as Error).message };
    }
  }, [grid, bg, asStampOn, chainId]);

  // 上限を超えているときのラン数（encodePxm は上限で止まるので数え直す）
  const overRuns = useMemo(() => (encoded.bytes ? 0 : countRuns(grid, bg)), [encoded.bytes, grid, bg]);

  const titleBytes = enc.encode(title).length;
  const titleBad = titleBytes > (asStamp ? STAMP_NAME_MAX : TITLE_MAX) || /[\u0000-\u001f\u007f]/.test(title) || (asStamp && !title.trim());

  useEffect(() => {
    if (!chainId) return;
    let live = true;
    readNum(chainId, 'mintPrice', mintVer(chainId)).then((p) => live && setMintPrice(p)).catch(() => {});
    if (mintVer(chainId) === 4) readNum(chainId, 'stampPrice', 4).then((p) => live && setStampPrice(p)).catch(() => {});
    return () => {
      live = false;
    };
  }, [chainId]);

  // gas はチェーンに聞く（Glamsterdam のような料金改定に追従するため）。全チェーン分を並べて比べる
  const mintArgs = useMemo(
    () => (encoded.bytes && !titleBad ? ([toHex(encoded.bytes), title.trim(), royalty] as const) : null),
    [encoded.bytes, titleBad, title, royalty],
  );
  // v4 のチェーンでは v4 に送る（スタンプとして・使ったスタンプを付けて）
  const callFor = (id: number) => {
    const v = mintVer(id);
    if (v !== 4 || !mintArgs) return undefined;
    const stamping = asStamp && id === chainId;
    const ids = [...new Set(usedStamps.filter((s) => s.chainId === id).map((s) => s.id))].sort((a, b) => (a < b ? -1 : 1)).slice(0, MAX_STAMPS);
    return {
      address: deployment(id, 4)!.address,
      abi: abiOf(4),
      functionName: stamping ? 'mintStamp' : 'mint',
      args: stamping ? [...mintArgs] : [...mintArgs, ids],
      value: stamping ? stampPrice : mintPrice,
    };
  };
  const payValue = asStamp ? stampPrice : mintPrice;
  const costs = useMintCosts(mintArgs, mintPrice, address, callFor, `${asStamp}|${stampPrice}|${usedStamps.map((s) => `${s.chainId}:${s.id}`).join()}`);
  const price = useEthPrice();
  const cur = costs[chainId];
  // 聞けないときだけ式で概算
  const gas = cur?.gas ?? (encoded.bytes ? BigInt(estimateMintGas(encoded.bytes.length, titleBytes)) : 0n);
  // ここは実際にウォレットで払う額（テストネットならテストネットのガス価格）。下の比べる欄はメインネット換算
  const gasPrice = cur?.ownGasPrice ?? null;
  const fee = cur?.ownTotal != null ? cur.ownTotal - payValue : gasPrice != null ? gas * gasPrice : null;
  // 同じ絵がこのチェーンでもう mint されていないか（絵・チェーンが変わったら 0.8 秒待って調べる。mint の直後にも調べ直す）
  const [same, setSame] = useState<bigint[]>([]);
  const [sameTick, setSameTick] = useState(0);
  useEffect(() => {
    setSame([]);
    if (!encoded.bytes || !encoded.info || !deployment(chainId, mintVer(chainId))) return;
    let live = true;
    const { size, colors } = encoded.info;
    const hex = toHex(encoded.bytes);
    const timer = setTimeout(() => {
      findSameArt(chainId, hex, size, colors, mintVer(chainId))
        .then((ids) => live && setSame(ids))
        .catch(() => {});
    }, 800);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [chainId, encoded.bytes, encoded.info, sameTick]);
  const hint = useMemo(() => colorHint(grid, bg, encoded.bytes?.length ?? 0), [grid, bg, encoded.bytes]);

  async function mint() {
    if (!encoded.bytes) return;
    if (same.length && !window.confirm(t('mint.sameConfirm', { ids: same.map((i) => `#${i}`).join(', '), chain: LABEL[chainId] ?? '' })))
      return;
    const call = callFor(chainId) ?? {
      address: deployment(chainId, 3)!.address,
      abi: abiOf(3),
      functionName: 'mint',
      args: [toHex(encoded.bytes), title.trim(), royalty],
      value: mintPrice,
    };
    try {
      setStatus({ kind: 'busy', text: t('mint.confirm') });
      if (walletChain !== chainId) await switchChainAsync({ chainId });
      const hash = await writeContractAsync({ chainId, ...call });
      setStatus({ kind: 'busy', text: t('mint.writing') });
      const receipt = await client(chainId).waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error(t('mint.failed'));
      const ev = parseEventLogs({ abi: abiOf(ver), logs: receipt.logs, eventName: 'Minted' })[0] as
        | { args: { id: bigint } }
        | undefined;
      setStatus({ kind: 'ok', text: ev ? t('mint.opening') : t('mint.done'), id: ev?.args.id });
      setSameTick((n) => n + 1);
      // 少し見せてから作品ページへ（描いた絵はこのブラウザに残っている）
      if (ev) setTimeout(() => router.push(workPath(chainId, ev.args.id, ver)), 1200);
    } catch (e) {
      const msg = (e as { shortMessage?: string; message: string }).shortMessage ?? (e as Error).message;
      setStatus({ kind: 'bad', text: msg.split('\n')[0] });
    }
  }

  const ready = !!encoded.bytes && !titleBad && !tooManyStamps && !!chainId && status.kind !== 'busy';

  return (
    <div className="mintcol">
      <div className="panel pv">
        <h3>{t('mint.onchain')}</h3>
        <div className="pv-box">
        {encoded.svg ? (
          <img className="preview" src={svgUrl(encoded.svg)} alt="preview" />
        ) : (
          <div className="stack fit" style={{ gap: 10 }}>
            <p className="note bad">{t('mint.tooDetailed')}</p>
            <p className="note">
              {t('mint.runs')}: <b className="bad">{overRuns.toLocaleString()}</b> / {PXM_MAX_RUNS.toLocaleString()}
            </p>
            {onFit && (
              <button onClick={onFit} title={t('mint.fitHint')}>
                {t('mint.fit')}
              </button>
            )}
            <p className="note">{t('mint.fitHint')}</p>
          </div>
        )}
        </div>
        {encoded.info && (
          <div className="meta">
            <span>{t('mint.data')}</span>
            <b>{encoded.bytes!.length.toLocaleString()} bytes</b>
            <span>{t('mint.colors')}</span>
            <b>{encoded.info.colors}</b>
            <span>{t('mint.runs')}</span>
            <b className={encoded.info.runs >= PXM_MAX_RUNS * 0.8 ? 'warn' : undefined}>
              {encoded.info.runs.toLocaleString()} / {PXM_MAX_RUNS.toLocaleString()} (
              {Math.round((encoded.info.runs / PXM_MAX_RUNS) * 100)}%)
            </b>
          </div>
        )}
        {encoded.info && encoded.info.runs >= PXM_MAX_RUNS * 0.8 && <p className="note warn">{t('mint.nearLimit')}</p>}
      </div>

      <div className="panel stack">
        <label className="stack" style={{ gap: 4 }}>
          <span className="note lbl">
            {asStamp ? t('mint.stampName') : t('mint.title')}
            <span className={titleBad ? 'bad' : ''}>{t('mint.bytes', { n: titleBytes, max: asStamp ? STAMP_NAME_MAX : TITLE_MAX })}</span>
          </span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={asStamp ? t('mint.stampNamePh') : t('mint.titlePh')} />
        </label>

        {canStamp && (
          <label className="row stamp-toggle" title={t('mint.asStampHint')}>
            <input type="checkbox" checked={asStampOn} onChange={(e) => setAsStamp(e.target.checked)} />
            <span>{t('mint.asStamp')}</span>
          </label>
        )}
        {asStamp && <p className="note">{t('mint.asStampHint')}</p>}
        {!asStamp && stampIds.length > 0 && (
          <p className={`note ${tooManyStamps ? 'bad' : ''}`}>
            {t('mint.stampsRecorded', { n: stampIds.length, max: MAX_STAMPS })}{' '}
            {usedStamps.filter((s) => s.chainId === chainId).map((s) => s.title).join(' · ')}
          </p>
        )}
        {!asStamp && otherChainStamps.length > 0 && <p className="note warn">{t('mint.stampsOtherChain', { n: otherChainStamps.length })}</p>}

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
                  onClick={() => onChain(p.chain.id)}
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
          <b>{payValue === 0n ? t('mint.free') : `${formatEther(payValue)} ETH`}</b>
          <span>{t('mint.gas')}</span>
          <b>
            {fee != null ? t('mint.about', { v: Number(formatEther(fee)).toPrecision(2) }) : '—'}
            {fee != null && fiat(fee, price, lang) && <span className="dim"> · {fiat(fee, price, lang)}</span>}
          </b>
          <span>{t('mint.gasUnits')}</span>
          <b>
            {gas.toLocaleString()} gas{gasPrice != null && ` × ${Number(formatGwei(gasPrice)).toPrecision(2)} gwei`}
          </b>
        </div>
        {PIX_CHAINS.length > 1 && (
          <div className="compare">
            <span className="note">{t('mint.compare')}</span>
            {PIX_CHAINS.map((p) => {
              const c = costs[p.chain.id];
              return (
                <button
                  key={p.chain.id}
                  className={`cmp ${chainId === p.chain.id ? 'on' : ''}`}
                  onClick={() => onChain(p.chain.id)}
                >
                  <span>{LABEL[p.chain.id]}</span>
                  <b>{c?.total != null ? `${Number(formatEther(c.total)).toPrecision(2)} ETH` : '…'}</b>
                  <span className="dim">{c?.total != null ? fiat(c.total, price, lang) ?? '' : ''}</span>
                </button>
              );
            })}
          </div>
        )}
        {hint && hint.saving >= 0.03 && (
          <p className="note">
            {t('mint.colorHint', { color: hint.color, cells: hint.cells, pct: Math.round(hint.saving * 100) })}{' '}
            <span className="swatch-dot" style={{ background: hint.color }} />
          </p>
        )}
        <p className="note">
          {t('mint.live')}
          {TESTNETS.includes(chainId) && price ? ` · ${t('mint.testnetFiat')}` : ''}
        </p>
        {OP_CHAINS.includes(chainId) ? <p className="note">{t('mint.baseNote')}</p> : null}

        {same.length > 0 && (
          <p className="note warn">
            {t('mint.same', { chain: LABEL[chainId] ?? '' })}{' '}
            {same.slice(0, 5).map((i) => (
              <span key={i.toString()}>
                <Link href={workPath(chainId, i, ver)}>#{i.toString()}</Link>{' '}
              </span>
            ))}
            {same.length > 5 && `+${same.length - 5}`}
          </p>
        )}
        {isConnected ? (
          <button onClick={mint} disabled={!ready}>
            {status.kind === 'busy' ? t('mint.busy') : t(asStamp ? 'mint.stampButton' : 'mint.button', { chain: LABEL[chainId] ?? '' })}
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
                → <Link href={workPath(chainId, status.id, ver)}>{t('mint.toWork')}</Link>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * いちばん使っていない色（背景以外）をいちばん近い色にまとめたら、データが何 % 減るか。
 * mint の gas はほぼデータ量に比例するので、減る割合 ≒ 安くなる割合の目安（固定分があるので実際は少し小さい）
 */
function colorHint(grid: PixGrid, bg: string, bytes: number) {
  if (!bytes) return null;
  const flat = flatten(grid, bg);
  const key = (c: string | null) => (c ?? bg).toLowerCase();
  const count = new Map<string, number>();
  for (const row of flat) for (const c of row) count.set(key(c), (count.get(key(c)) ?? 0) + 1);
  if (count.size < 3) return null;
  const bgKey = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const [color, cells] = [...count.entries()].filter(([c]) => c !== bgKey).sort((a, b) => a[1] - b[1])[0];
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = rgb(color);
  let near = bgKey;
  let best = Infinity;
  for (const c of count.keys()) {
    if (c === color) continue;
    const [r2, g2, b2] = rgb(c);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < best) [best, near] = [d, c];
  }
  try {
    const merged = encodePxm(flat.map((row) => row.map((c) => (key(c) === color ? near : c))), bg);
    return { color, cells, saving: (bytes - merged.length) / bytes };
  } catch {
    return null;
  }
}
