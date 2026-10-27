'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixCanvas, StampThumb, Swatches, ToolIcon, stampOrigin, type StampMods } from '../components/Editor';
import { STAMPS, flip as flipG, rotate as rotateG, scale as scaleG, stampGrid } from '../lib/stamps';
import { setSound, sfx, soundOn } from '../lib/sound';
import { ImportDialog } from '../components/ImportDialog';
import { fitGrid, loadImage, type LoadedImage } from '../lib/convert';
import { MintPanel, type UsedStamp } from '../components/MintPanel';
import { LABEL, PIX4_CHAINS } from '../lib/chains';
import { requestMintChain, setMintChainGuard, useMintChain } from '../lib/mintChain';
import { readStamps, short, type StampView } from '../lib/contract';
import { HIDDEN_STAMPS } from '../lib/stampsHidden';
import { isHidden } from '../lib/moderation';
import { pxmToGrid } from '../src/pxm';
import { useI18n } from '../lib/i18n';
import { isDark, ALL_SIZES, DEFAULT_BG, DEFAULT_COLOR, GRID_SIZES, PALETTES, baseSize, isOdd, regrid, wouldCrop, exportPng, exportScale, newGrid, clearRect, cutOut, stamp, type PixFloat, type PixGrid, type PixRect, type PixTool } from '../lib/pix';

const SAVE_KEY = 'pixmint-doc-v1';
const PAL_KEY = 'pixmint-palettes-v1';
const TOOLS: { id: PixTool; key: string }[] = [
  { id: 'pen', key: 'B' },
  { id: 'eraser', key: 'E' },
  { id: 'fill', key: 'G' },
  { id: 'picker', key: 'I' },
  { id: 'select', key: 'M' },
  { id: 'stamp', key: 'T' }, // S は PNG 保存
  { id: 'box', key: 'U' },
  { id: 'oval', key: 'O' },
];
const HEX = /^#[0-9a-f]{6}$/i;

const clonePalettes = () => Object.fromEntries(Object.entries(PALETTES).map(([k, v]) => [k, [...v]]));

export default function Studio() {
  const { t } = useI18n();
  const [grid, setGrid] = useState<PixGrid>(() => newGrid(16));
  const [bg, setBg] = useState(DEFAULT_BG);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [hexIn, setHexIn] = useState(DEFAULT_COLOR);
  const [tool, setTool] = useState<PixTool>('pen');
  const [palette, setPalette] = useState('neon');
  // パレットは編集できる（色を変えると選んでいる枠の色も変わる）。編集分はこのブラウザに残す
  const [palettes, setPalettes] = useState<Record<string, string[]>>(clonePalettes);
  const [swatch, setSwatch] = useState<number | null>(null);
  const history = useRef<PixGrid[]>([]);
  const future = useRef<PixGrid[]>([]); // やり直し用（戻したもの）。新しく描いたら消える
  // 選択・コピー＆ペースト。floating は確定前の絵（動かせる）。clip はこのページの中のクリップボード
  const [sel, setSel] = useState<PixRect | null>(null);
  const [floating, setFloating] = useState<PixFloat | null>(null);
  const clip = useRef<PixGrid | null>(null);
  const pasteFallback = useRef(0);
  // スタンプ: 種類・向き（0〜3 = 90° ずつ）・左右反転・大きさ
  const [stampId, setStampId] = useState(STAMPS[0].id);
  const [stampRot, setStampRot] = useState(0);
  const [stampFlip, setStampFlip] = useState(false);
  const [stampScale, setStampScale] = useState(1);
  // みんなのスタンプ（v4 のチェーンから読む。新しい順）と、この絵で押したもの（mint のときに記録する）
  const [community, setCommunity] = useState<(StampView & { grid: PixGrid })[]>([]);
  const [usedStamps, setUsedStamps] = useState<UsedStamp[]>([]);
  useEffect(() => {
    let live = true;
    for (const p of PIX4_CHAINS)
      readStamps(p.chain.id)
        .then((list) => {
          if (!live) return;
          const mine = list
            // 隠したスタンプ・隠した作品・止めたウォレットのスタンプは出さない（lib/stampsHidden.ts・lib/moderation.ts）
            .filter((x) => !HIDDEN_STAMPS.has(`${x.chainId}:${x.id}`) && !isHidden({ chainId: x.chainId, ver: 4, id: x.id, creator: x.creator }))
            .map((x) => ({ ...x, grid: pxmToGrid(Uint8Array.from((x.data.slice(2).match(/../g) ?? []).map((b) => parseInt(b, 16)))) }));
          setCommunity((cs) => [...cs.filter((c) => c.chainId !== p.chain.id), ...mine].sort((a, b) => b.mintedAt - a.mintedAt));
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const stampKey = (x: StampView) => `c:${x.chainId}:${x.id}`;
  // ミントするチェーン（lib/mintChain.ts。ウォレットのメニューからも変えられる）。
  // スタンプの番号はチェーンごとに別なので、先に決めて、一覧もそのチェーンのスタンプだけにする
  const mintChain = useMintChain();
  // 切り替える前に: ほかのチェーンのスタンプを使っていたら、記録されなくなることを確かめる
  useEffect(() => {
    setMintChainGuard((id) => {
      const lost = usedStamps.filter((x) => x.chainId !== id);
      if (lost.length && !window.confirm(t('stamp.switchChain', { n: lost.length, chain: LABEL[id] ?? '' }))) return false;
      setUsedStamps((us) => us.filter((x) => x.chainId === id));
      setStampId((cur) => (cur.startsWith('c:') && !cur.startsWith(`c:${id}:`) ? STAMPS[0].id : cur));
      return true;
    });
    return () => setMintChainGuard(null);
  }, [usedStamps, t]);
  const changeChain = (id: number) => requestMintChain(id);
  const chainStamps = community.filter((x) => x.chainId === mintChain);
  const [sound, setSoundState] = useState(true);
  const [shapeFill, setShapeFill] = useState(false); // 四角・楕円を塗りつぶすか
  useEffect(() => setSoundState(soundOn()), []);
  // 画像 → ドット絵の確認画面
  const [importing, setImporting] = useState<LoadedImage | null>(null);
  const [dropping, setDropping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [, bump] = useState(0);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
      if (s && Array.isArray(s.grid) && ALL_SIZES.includes(s.grid.length)) {
        setGrid(s.grid);
        if (s.bg) setBg(s.bg);
        if (s.color) setColor(s.color);
        if (s.palette && PALETTES[s.palette]) setPalette(s.palette);
        if (Array.isArray(s.stamps)) setUsedStamps(s.stamps.map((x: { chainId: number; id: string; title: string }) => ({ ...x, id: BigInt(x.id) })));
      }
      // 自分で色を変えたパレットだけ戻す。色数が既定と違うもの（パレット自体が更新された）は既定を使う
      const p = JSON.parse(localStorage.getItem(PAL_KEY) ?? 'null');
      if (p && typeof p === 'object') {
        const next = clonePalettes();
        for (const k of Object.keys(next))
          if (Array.isArray(p[k]) && p[k].length === next[k].length && p[k].every((c: string) => HEX.test(c))) next[k] = p[k];
        setPalettes(next);
      }
    } catch {}
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      const stamps = usedStamps.map((x) => ({ ...x, id: x.id.toString() }));
      localStorage.setItem(SAVE_KEY, JSON.stringify({ grid, bg, color, palette, stamps }));
      const edited = Object.fromEntries(Object.entries(palettes).filter(([k, v]) => v.join() !== PALETTES[k]?.join()));
      localStorage.setItem(PAL_KEY, JSON.stringify(edited));
    } catch {}
  }, [grid, bg, color, palette, palettes, usedStamps]);
  useEffect(() => setHexIn(color), [color]);

  /** 色を変える。パレットの枠を選んでいれば、その枠の色も一緒に変える */
  const editColor = (c: string) => {
    setColor(c);
    if (swatch == null) return;
    setPalettes((ps) => ({ ...ps, [palette]: ps[palette].map((x, i) => (i === swatch ? c : x)) }));
  };

  const pickSwatch = (i: number) => {
    setSwatch(i);
    setColor(palettes[palette][i]);
    if (tool === 'eraser' || tool === 'picker') setTool('pen');
  };

  const beginStroke = useCallback(() => {
    history.current.push(grid);
    future.current = [];
    if (history.current.length > 50) history.current.shift();
    bump((n) => n + 1);
  }, [grid]);

  const undo = () => {
    // 浮いている絵は、持ち上げた／貼り付けた時点の履歴に戻すと消える
    setFloating(null);
    const prev = history.current.pop();
    if (prev) {
      future.current.push(grid);
      sfx.undo();
      setGrid(prev);
    }
    bump((n) => n + 1);
  };

  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    setFloating(null);
    history.current.push(grid);
    sfx.redo();
    setGrid(next);
    bump((n) => n + 1);
  };

  const odd = isOdd(grid.length);
  const resize = (base: number) => {
    const size = odd ? base + 1 : base;
    if (size === grid.length) return;
    if (grid.some((r) => r.some(Boolean)) && !window.confirm(t('editor.resizeConfirm'))) return;
    history.current = [];
    future.current = [];
    setGrid(newGrid(size));
    setUsedStamps([]);
  };
  // ODD の切り替えは絵を残す（1列・1行を足す／削る）。削る側に絵があるときだけ確認する
  const toggleOdd = () => {
    const size = odd ? grid.length - 1 : grid.length + 1;
    if (wouldCrop(grid, size) && !window.confirm(t('editor.oddCropConfirm'))) return;
    beginStroke();
    setGrid(regrid(grid, size));
  };

  const clear = () => {
    sfx.boom();
    beginStroke();
    setFloating(null);
    setSel(null);
    setGrid(newGrid(grid.length));
    setUsedStamps([]); // 全部消したら、記録するスタンプも空に
  };

  // ── 選択・コピー＆ペースト ──
  // 確定したら選択も外す（続けてドラッグしたときに、置いた絵ごと動いてしまわないように）
  const commit = useCallback(() => {
    if (!floating) return;
    setGrid((g) => stamp(g, floating));
    setSel(null);
    setFloating(null);
  }, [floating]);
  const lift = () => {
    if (!sel) return;
    beginStroke();
    setFloating({ ...sel, cells: cutOut(grid, sel) });
    setGrid(clearRect(grid, sel));
    setSel(null);
  };
  const copy = () => {
    if (floating) clip.current = floating.cells.map((r) => [...r]);
    else if (sel) clip.current = cutOut(grid, sel);
  };
  const remove = () => {
    if (floating) {
      setFloating(null); // 持ち上げた時点で元の場所は消えている
    } else if (sel) {
      beginStroke();
      setGrid(clearRect(grid, sel));
    }
  };
  const place = (cells: PixGrid) => {
    if (floating) commit();
    beginStroke();
    const n = grid.length, h = cells.length, w = cells[0]?.length ?? 0;
    // 選択範囲があればその左上、無ければ真ん中に置く
    const r = sel ? sel.r : Math.floor((n - h) / 2), c = sel ? sel.c : Math.floor((n - w) / 2);
    setFloating({ r, c, h, w, cells });
    setSel(null);
    setTool('select');
  };
  const nudge = (dr: number, dc: number) => {
    if (floating) setFloating({ ...floating, r: floating.r + dr, c: floating.c + dc });
    else if (sel) lift();
  };
  // 選択ツールから離れたら確定する
  useEffect(() => {
    if (tool !== 'select') commit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // スタンプ（今の色・向き・大きさを反映）
  // みんなのスタンプは元の色のまま押す（公式は一部が今の色になる）
  const pickedCommunity = community.find((x) => stampKey(x) === stampId);
  const stampG = useMemo(() => {
    const def = STAMPS.find((x) => x.id === stampId) ?? STAMPS[0];
    let g = pickedCommunity ? pickedCommunity.grid : stampGrid(def, color);
    for (let i = 0; i < stampRot; i++) g = rotateG(g);
    if (stampFlip) g = flipG(g);
    return scaleG(g, stampScale);
  }, [stampId, stampRot, stampFlip, stampScale, color, pickedCommunity]);
  // Ctrl を押しながら = 左右反転、Shift を押しながら = 2 倍（その 1 回だけ。ボタンの設定に重ねる）
  const stampFor = useCallback(
    (m: StampMods) => {
      let g = stampG;
      if (m.flip) g = flipG(g);
      if (m.big) g = scaleG(g, 2);
      return g;
    },
    [stampG],
  );
  const lastStampSound = useRef(0);
  const doStamp = (r: number, c: number, continuing: boolean, m: StampMods) => {
    if (!continuing) beginStroke(); // ドラッグで続けて押した分は、戻すとき 1 回にまとめる
    const sg = stampFor(m);
    const [r0, c0] = stampOrigin([r, c], sg);
    setGrid((g) => {
      let out = stamp(g, { r: r0, c: c0, h: sg.length, w: sg[0].length, cells: sg });
      // Option を押しながら: 左右対称の位置に、反転したスタンプをもう 1 つ
      if (m.sym) {
        const mg = flipG(sg);
        out = stamp(out, { r: r0, c: g.length - c0 - sg[0].length, h: mg.length, w: mg[0].length, cells: mg });
      }
      return out;
    });
    // みんなのスタンプを押したら、mint のときに記録する分に入れる
    if (pickedCommunity && !usedStamps.some((x) => x.chainId === pickedCommunity.chainId && x.id === pickedCommunity.id))
      setUsedStamps((us) => [...us, { chainId: pickedCommunity.chainId, id: pickedCommunity.id, title: pickedCommunity.title }]);
    // 続けて押すときは音を間引く（うるさくならないように）
    const now = performance.now();
    if (!continuing || now - lastStampSound.current > 120) {
      sfx.stamp();
      lastStampSound.current = now;
    }
  };

  const openImage = async (file: Blob | null | undefined) => {
    if (!file || !(file.type.startsWith('image/') || (file instanceof File && /\.svg$/i.test(file.name)))) return;
    try {
      setImporting(await loadImage(file));
    } catch {}
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (importing) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if ((mod && k === 'z' && e.shiftKey) || (mod && k === 'y')) {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && k === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (!mod && k === 's') {
        e.preventDefault();
        download();
        return;
      }
      if (mod && (k === 'c' || k === 'x') && (sel || floating)) {
        e.preventDefault();
        copy();
        if (k === 'x') remove();
        return;
      }
      if (mod && k === 'v') {
        // 本来は paste イベントで受ける（画像も読める）。paste が来ない環境のために、少し待って来なければページ内のコピーを貼る
        pasteFallback.current = window.setTimeout(() => {
          pasteFallback.current = 0;
          if (clip.current) place(clip.current.map((r) => [...r]));
        }, 80);
        return;
      }
      if (mod && k === 'a') {
        e.preventDefault();
        commit();
        setTool('select');
        setSel({ r: 0, c: 0, h: grid.length, w: grid.length });
        return;
      }
      if ((k === 'delete' || k === 'backspace') && (sel || floating)) {
        e.preventDefault();
        remove();
        return;
      }
      if (k === 'enter' && floating) {
        e.preventDefault();
        commit();
        return;
      }
      if (k === 'escape') {
        if (floating) undo(); // 持ち上げる／貼り付ける前に戻す
        setSel(null);
        return;
      }
      const arrow = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] }[k];
      if (arrow && (sel || floating) && tool === 'select') {
        e.preventDefault();
        nudge(arrow[0], arrow[1]);
        return;
      }
      if (tool === 'stamp' && !mod && (k === 'r' || k === 'f')) {
        if (k === 'r') setStampRot((n) => (n + 1) % 4);
        else setStampFlip((f) => !f);
        return;
      }
      const tl = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (tl && !e.metaKey && !e.ctrlKey) setTool(tl.id);
    };
    // ⌘V: クリップボードに画像があれば読み込み画面へ。無ければこのページでコピーした絵を貼る
    const onPaste = (e: ClipboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      clearTimeout(pasteFallback.current);
      pasteFallback.current = 0;
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) {
        e.preventDefault();
        openImage(file);
      } else if (clip.current) {
        e.preventDefault();
        place(clip.current.map((r) => [...r]));
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  });

  // 見えているとおりの絵（確定前の浮いた絵も含む）。mint・プレビュー・PNG はこれを使う（浮いたまま mint すると絵が抜けていた）
  const shown = useMemo(() => (floating ? stamp(grid, floating) : grid), [grid, floating]);

  const toolLabel = (id: string) => t(`tool.${id}` as 'tool.pen');

  const download = async () => {
    const blob = await exportPng(shown, bg);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pixmint-${grid.length}x${grid.length}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportPx = grid.length * exportScale(grid.length);

  return (
    <div className="studio">
      <aside className="side">
        <div className="tools">
          {TOOLS.map((x) => (
            <button
              key={x.id}
              className={`tb ${tool === x.id ? 'on' : ''}`}
              onClick={() => setTool(x.id)}
              title={`${toolLabel(x.id)} (${x.key})`}
            >
              <ToolIcon name={x.id} />
              <span>{toolLabel(x.id)}</span>
            </button>
          ))}
          <button className="tb" onClick={undo} disabled={!history.current.length} title={`${t('tool.undo')} (⌘Z)`}>
            <ToolIcon name="undo" />
            <span>{t('tool.undo')}</span>
          </button>
          <button className="tb" onClick={redo} disabled={!future.current.length} title={`${t('tool.redo')} (⇧⌘Z)`}>
            <ToolIcon name="redo" />
            <span>{t('tool.redo')}</span>
          </button>
          <button className="tb" onClick={() => fileRef.current?.click()} title={t('tool.importHint')}>
            <ToolIcon name="import" />
            <span>{t('tool.import')}</span>
          </button>
          <button className="tb" onClick={clear} title={t('tool.clear')}>
            <ToolIcon name="clear" />
            <span>{t('tool.clear')}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.svg"
            hidden
            onChange={(e) => {
              openImage(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        {(tool === 'box' || tool === 'oval') && (
          <div className="sect stamps">
            <div className="shape-opts" title={t('shape.hint')}>
              <button className={`tool ${!shapeFill ? 'on' : ''}`} onClick={() => setShapeFill(false)} aria-pressed={!shapeFill}>
                {t('shape.outline')}
              </button>
              <button className={`tool ${shapeFill ? 'on' : ''}`} onClick={() => setShapeFill(true)} aria-pressed={shapeFill}>
                {t('shape.filled')}
              </button>
            </div>
          </div>
        )}
        {tool === 'stamp' && (
          <div className="sect stamps">
            {/* 操作の説明は文字で出さず、ボタンにかざすと出す（くわしくはヘルプ） */}
            <div className="stamp-opts" title={t('stamp.hint')}>
              <button className="tool" onClick={() => setStampRot((n) => (n + 1) % 4)} title={`${t('stamp.rotate')} (R)`}>
                ⟳
              </button>
              <button className={`tool ${stampFlip ? 'on' : ''}`} onClick={() => setStampFlip((f) => !f)} title={`${t('stamp.flip')} (F)`}>
                ⇋
              </button>
              {[1, 2].map((n) => (
                <button key={n} className={`tool ${stampScale === n ? 'on' : ''}`} onClick={() => setStampScale(n)} title={t('stamp.size')}>
                  {n}×
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="sect">
          <div className="colorrow">
            <label className={`chip big ${isDark(color) ? 'dark' : ''}`} title={t('editor.color')}>
              <input type="color" value={color} onChange={(e) => editColor(e.target.value)} />
              <span style={{ background: color }} />
            </label>
            <input
              className="hex"
              type="text"
              value={hexIn}
              onChange={(e) => {
                setHexIn(e.target.value);
                if (HEX.test(e.target.value)) editColor(e.target.value.toLowerCase());
              }}
              spellCheck={false}
              aria-label={t('editor.color')}
            />
          </div>
          {tool !== 'stamp' && (
          <div className="colorrow">
            <label className="colorrow note" style={{ flex: 1, minWidth: 0 }} title={t('editor.bg')}>
              <span className={`chip ${isDark(bg) ? 'dark' : ''}`}>
                <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
                <span style={{ background: bg }} />
              </span>
              {t('editor.bgShort')}
            </label>
            <select
              className="gridsel"
              value={baseSize(grid.length)}
              onChange={(e) => resize(Number(e.target.value))}
              aria-label={t('editor.grid')}
              title={t('editor.grid')}
            >
              {GRID_SIZES.map((s) => (
                <option key={s} value={s}>
                  {odd ? s + 1 : s}×{odd ? s + 1 : s}
                </option>
              ))}
            </select>
            <button className={`tool ${odd ? 'on' : ''}`} onClick={toggleOdd} title={t('editor.oddHint')} aria-pressed={odd}>
              ODD
            </button>
          </div>
          )}
        </div>

        {tool === 'stamp' ? (
          <>
            {/* スタンプ中: パレットは 1 行に縮めて、下を全部スタンプの一覧にする */}
            <div className="sect" title={t('editor.editHint')}>
              <div className="pal-mini">
                <Swatches colors={palettes[palette]} selected={swatch} onPick={pickSwatch} />
              </div>
            </div>
            <div className="sect stamps stamp-list">
              <span className="stamp-head">{t('stamp.official')}</span>
              <div className="stamp-grid">
                {STAMPS.map((x) => (
                  <button
                    key={x.id}
                    className={`stamp-btn ${stampId === x.id ? 'on' : ''}`}
                    onClick={() => setStampId(x.id)}
                    title={x.id}
                    aria-label={x.id}
                    aria-pressed={stampId === x.id}
                  >
                    <StampThumb grid={stampGrid(x, color)} />
                  </button>
                ))}
              </div>
              {chainStamps.length > 0 && (
                <>
                  <span className="stamp-head">
                    {t('stamp.community')} · {LABEL[mintChain] ?? ''}
                  </span>
                  <div className="stamp-grid">
                    {chainStamps.map((x) => (
                      <button
                        key={stampKey(x)}
                        className={`stamp-btn ${stampId === stampKey(x) ? 'on' : ''}`}
                        onClick={() => setStampId(stampKey(x))}
                        title={`${x.title} · ${x.official ? 'mederu' : short(x.creator)} · ${LABEL[x.chainId] ?? ''} #${x.id}`}
                        aria-label={x.title}
                        aria-pressed={stampId === stampKey(x)}
                      >
                        <StampThumb grid={x.grid} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
        <div className="sect">
          <div className="colorrow">
            <select
              value={palette}
              onChange={(e) => {
                setPalette(e.target.value);
                setSwatch(null);
              }}
              aria-label={t('editor.palette')}
              style={{ flex: 1, minWidth: 0 }}
            >
              {Object.keys(PALETTES).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <button
              className="tool icon"
              onClick={() => setPalettes((ps) => ({ ...ps, [palette]: [...PALETTES[palette]] }))}
              disabled={palettes[palette].join() === PALETTES[palette].join()}
              title={t('editor.resetPalette')}
            >
              ↺
            </button>
          </div>
          <div title={t('editor.editHint')}>
            <Swatches colors={palettes[palette]} selected={swatch} onPick={pickSwatch} />
          </div>
        </div>
        )}

        <div className="sect dl">
          <button
            className={`tool dl-btn ${sound ? '' : 'off'}`}
            onClick={() => {
              setSound(!sound);
              setSoundState(!sound);
              if (!sound) setTimeout(() => sfx.stamp(), 0);
            }}
            aria-pressed={sound}
            title={t('editor.soundHint')}
          >
            <ToolIcon name={sound ? 'sound' : 'mute'} />
            {sound ? t('editor.soundOn') : t('editor.soundOff')}
          </button>
          <button className="tool dl-btn" onClick={download} title={`${t('editor.downloadHint', { px: exportPx })} (S)`}>
            <ToolIcon name="download" />
            {t('editor.download')}
          </button>
        </div>
      </aside>

      <div
        className={`canvas-area ${dropping ? 'dropping' : ''}`}
        onDragOver={(e) => {
          if ([...e.dataTransfer.items].some((i) => i.kind === 'file')) {
            e.preventDefault();
            setDropping(true);
          }
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropping(false);
          openImage(e.dataTransfer.files[0]);
        }}
      >
        <PixCanvas
          grid={grid}
          bg={bg}
          color={color}
          tool={tool}
          onChange={setGrid}
          onBeginStroke={beginStroke}
          onPick={(c) => {
            setColor(c);
            const i = palettes[palette].indexOf(c);
            setSwatch(i >= 0 ? i : null);
            setTool('pen');
          }}
          sel={sel}
          floating={floating}
          onSelect={setSel}
          onLift={lift}
          onMoveFloating={(r, c) => setFloating((f) => (f ? { ...f, r, c } : f))}
          onCommit={commit}
          stamp={stampG}
          stampFor={stampFor}
          shapeFill={shapeFill}
          onStamp={doStamp}
        />
      </div>
      {importing && (
        <ImportDialog
          image={importing}
          size={grid.length}
          bg={bg}
          palette={palettes[palette]}
          onCancel={() => setImporting(null)}
          onApply={(g) => {
            setImporting(null);
            place(g); // 浮かせて置くので、位置を動かしてから Enter で確定できる
          }}
        />
      )}

      <MintPanel
        usedStamps={usedStamps}
        chainId={mintChain}
        onChain={changeChain}
        grid={shown}
        bg={bg}
        onFit={() => {
          // 浮いている絵も含めて、見えているとおりの絵を収める（⌘Z で戻せる）
          if (floating) commit();
          beginStroke();
          setGrid(fitGrid(shown, bg));
          sfx.fill();
        }}
      />
    </div>
  );
}
