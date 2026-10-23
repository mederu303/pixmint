'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PixCanvas, Swatches, ToolIcon } from '../components/Editor';
import { ImportDialog } from '../components/ImportDialog';
import { loadImage } from '../lib/convert';
import { MintPanel } from '../components/MintPanel';
import { useI18n } from '../lib/i18n';
import { ALL_SIZES, DEFAULT_BG, DEFAULT_COLOR, GRID_SIZES, PALETTES, baseSize, isOdd, regrid, wouldCrop, exportPng, exportScale, newGrid, clearRect, cutOut, stamp, type PixFloat, type PixGrid, type PixRect, type PixTool } from '../lib/pix';

const SAVE_KEY = 'pixmint-doc-v1';
const PAL_KEY = 'pixmint-palettes-v1';
const TOOLS: { id: PixTool; key: string }[] = [
  { id: 'pen', key: 'B' },
  { id: 'eraser', key: 'E' },
  { id: 'fill', key: 'G' },
  { id: 'picker', key: 'I' },
  { id: 'select', key: 'M' },
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
  // 選択・コピー＆ペースト。floating は確定前の絵（動かせる）。clip はこのページの中のクリップボード
  const [sel, setSel] = useState<PixRect | null>(null);
  const [floating, setFloating] = useState<PixFloat | null>(null);
  const clip = useRef<PixGrid | null>(null);
  const pasteFallback = useRef(0);
  // 画像 → ドット絵の確認画面
  const [importing, setImporting] = useState<ImageBitmap | null>(null);
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
      localStorage.setItem(SAVE_KEY, JSON.stringify({ grid, bg, color, palette }));
      const edited = Object.fromEntries(Object.entries(palettes).filter(([k, v]) => v.join() !== PALETTES[k]?.join()));
      localStorage.setItem(PAL_KEY, JSON.stringify(edited));
    } catch {}
  }, [grid, bg, color, palette, palettes]);
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
    if (history.current.length > 50) history.current.shift();
    bump((n) => n + 1);
  }, [grid]);

  const undo = () => {
    // 浮いている絵は、持ち上げた／貼り付けた時点の履歴に戻すと消える
    setFloating(null);
    const prev = history.current.pop();
    if (prev) setGrid(prev);
    bump((n) => n + 1);
  };

  const odd = isOdd(grid.length);
  const resize = (base: number) => {
    const size = odd ? base + 1 : base;
    if (size === grid.length) return;
    if (grid.some((r) => r.some(Boolean)) && !window.confirm(t('editor.resizeConfirm'))) return;
    history.current = [];
    setGrid(newGrid(size));
  };
  // ODD の切り替えは絵を残す（1列・1行を足す／削る）。削る側に絵があるときだけ確認する
  const toggleOdd = () => {
    const size = odd ? grid.length - 1 : grid.length + 1;
    if (wouldCrop(grid, size) && !window.confirm(t('editor.oddCropConfirm'))) return;
    beginStroke();
    setGrid(regrid(grid, size));
  };

  const clear = () => {
    beginStroke();
    setFloating(null);
    setSel(null);
    setGrid(newGrid(grid.length));
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

  const openImage = async (file: Blob | null | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
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
      if (mod && k === 'z') {
        e.preventDefault();
        undo();
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

  const toolLabel = (id: string) => t(`tool.${id}` as 'tool.pen');

  const download = async () => {
    const blob = await exportPng(grid, bg);
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
          <button className="tb" onClick={clear} title={t('tool.clear')}>
            <ToolIcon name="clear" />
            <span>{t('tool.clear')}</span>
          </button>
          <button className="tb" onClick={() => fileRef.current?.click()} title={t('tool.importHint')}>
            <ToolIcon name="import" />
            <span>{t('tool.import')}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              openImage(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        <div className="sect">
          <div className="colorrow">
            <label className="chip big" title={t('editor.color')}>
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
          <div className="colorrow">
            <label className="colorrow note" style={{ flex: 1, minWidth: 0 }} title={t('editor.bg')}>
              <span className="chip">
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
        </div>

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

        <div className="sect dl">
          <button className="tool dl-btn" onClick={download} title={t('editor.downloadHint', { px: exportPx })}>
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

      <MintPanel grid={grid} bg={bg} />
    </div>
  );
}
