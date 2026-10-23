'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PixCanvas, Swatches, ToolIcon } from '../components/Editor';
import { MintPanel } from '../components/MintPanel';
import { useI18n } from '../lib/i18n';
import { DEFAULT_BG, DEFAULT_COLOR, GRID_SIZES, PALETTES, exportPng, exportScale, newGrid, type PixGrid, type PixTool } from '../lib/pix';

const SAVE_KEY = 'pixmint-doc-v1';
const PAL_KEY = 'pixmint-palettes-v1';
const TOOLS: { id: PixTool; key: string }[] = [
  { id: 'pen', key: 'B' },
  { id: 'eraser', key: 'E' },
  { id: 'fill', key: 'G' },
  { id: 'picker', key: 'I' },
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
  const [, bump] = useState(0);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
      if (s && Array.isArray(s.grid) && GRID_SIZES.includes(s.grid.length)) {
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
    const prev = history.current.pop();
    if (prev) setGrid(prev);
    bump((n) => n + 1);
  };

  const resize = (size: number) => {
    if (size === grid.length) return;
    if (grid.some((r) => r.some(Boolean)) && !window.confirm(t('editor.resizeConfirm'))) return;
    history.current = [];
    setGrid(newGrid(size));
  };

  const clear = () => {
    beginStroke();
    setGrid(newGrid(grid.length));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      const tl = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (tl && !e.metaKey && !e.ctrlKey) setTool(tl.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
              value={grid.length}
              onChange={(e) => resize(Number(e.target.value))}
              aria-label={t('editor.grid')}
              title={t('editor.grid')}
            >
              {GRID_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}×{s}
                </option>
              ))}
            </select>
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

      <div className="canvas-area">
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
        />
      </div>

      <MintPanel grid={grid} bg={bg} />
    </div>
  );
}
