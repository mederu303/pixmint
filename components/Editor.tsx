'use client';
import { useEffect, useRef, useState } from 'react';
import { sfx } from '../lib/sound';
import { PALETTES, floodFill, lineCells, type PixFloat, type PixGrid, type PixRect, type PixTool } from '../lib/pix';

interface Props {
  grid: PixGrid;
  bg: string;
  color: string;
  tool: PixTool;
  onChange: (next: PixGrid) => void;
  onBeginStroke: () => void;
  onPick: (color: string) => void;
  // 選択ツール
  sel?: PixRect | null;
  floating?: PixFloat | null;
  onSelect?: (s: PixRect | null) => void;
  onLift?: () => void; // 選択範囲を持ち上げて浮かせる
  onMoveFloating?: (r: number, c: number) => void;
  onCommit?: () => void; // 浮いている絵を下ろす
  // スタンプ（向き・大きさを反映したもの）。マウスの位置に薄く見せて、クリックで押す
  stamp?: PixGrid | null;
  onStamp?: (r: number, c: number) => void;
}

/** キャンバス。1マス = 1画素で描いて CSS で拡大する（原本 drawPixCanvas と同じ） */
export function PixCanvas({ grid, bg, color, tool, onChange, onBeginStroke, onPick, sel, floating, onSelect, onLift, onMoveFloating, onCommit, stamp, onStamp }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ last: [number, number]; work: PixGrid } | null>(null);
  // 選択ツールのドラッグ: 'select' = 範囲を作る / 'move' = 浮いている絵を動かす（つかんだ位置のずれを持つ）
  const sdrag = useRef<{ kind: 'select'; r0: number; c0: number } | { kind: 'move'; dr: number; dc: number } | null>(null);
  const size = grid.length;
  const [hover, setHover] = useState<[number, number] | null>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    cv.width = size;
    cv.height = size;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        const col = grid[r][c];
        if (col) {
          ctx.fillStyle = col;
          ctx.fillRect(c, r, 1, 1);
        }
      }
    if (floating)
      floating.cells.forEach((row, i) =>
        row.forEach((v, j) => {
          if (!v) return;
          ctx.fillStyle = v;
          ctx.fillRect(floating.c + j, floating.r + i, 1, 1);
        }),
      );
    // スタンプの下見（押す位置を薄く）
    if (tool === 'stamp' && stamp && hover) {
      const [r0, c0] = stampOrigin(hover, stamp);
      ctx.globalAlpha = 0.55;
      stamp.forEach((row, i) =>
        row.forEach((v, j) => {
          if (!v) return;
          ctx.fillStyle = v;
          ctx.fillRect(c0 + j, r0 + i, 1, 1);
        }),
      );
      ctx.globalAlpha = 1;
    }
  }, [grid, bg, size, floating, tool, stamp, hover]);

  const inside = (s: PixRect | null | undefined, r: number, c: number) =>
    !!s && r >= s.r && r < s.r + s.h && c >= s.c && c < s.c + s.w;

  const cellAt = (e: React.PointerEvent): [number, number] => {
    const rect = ref.current!.getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * size);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * size);
    return [Math.min(size - 1, Math.max(0, r)), Math.min(size - 1, Math.max(0, c))];
  };

  const paint = (work: PixGrid, r: number, c: number) => {
    work[r][c] = tool === 'eraser' ? null : color;
  };

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    const [r, c] = cellAt(e);
    if (tool === 'select') {
      ref.current!.setPointerCapture(e.pointerId);
      if (floating && inside(floating, r, c)) {
        sdrag.current = { kind: 'move', dr: r - floating.r, dc: c - floating.c };
      } else if (!floating && sel && inside(sel, r, c)) {
        onLift?.();
        sdrag.current = { kind: 'move', dr: r - sel.r, dc: c - sel.c };
      } else {
        if (floating) onCommit?.();
        sdrag.current = { kind: 'select', r0: r, c0: c };
        onSelect?.({ r, c, h: 1, w: 1 });
      }
      return;
    }
    if (tool === 'picker') {
      onPick(grid[r][c] ?? bg);
      return;
    }
    onBeginStroke();
    const work = grid.map((row) => [...row]);
    if (tool === 'stamp') {
      onStamp?.(r, c);
      return;
    }
    if (tool === 'fill') {
      floodFill(work, r, c, color);
      onChange(work);
      sfx.fill();
      return;
    }
    ref.current!.setPointerCapture(e.pointerId);
    paint(work, r, c);
    drag.current = { last: [r, c], work };
    onChange(work.map((row) => [...row]));
  };

  const move = (e: React.PointerEvent) => {
    if (tool === 'stamp') {
      const [r, c] = cellAt(e);
      setHover((h) => (h && h[0] === r && h[1] === c ? h : [r, c]));
      return;
    }
    const sd = sdrag.current;
    if (sd) {
      // 動かすときははみ出してもよい（下ろすときに切れる）。範囲はキャンバスの中だけ
      const rect = ref.current!.getBoundingClientRect();
      const rr = Math.floor(((e.clientY - rect.top) / rect.height) * size);
      const cc = Math.floor(((e.clientX - rect.left) / rect.width) * size);
      if (sd.kind === 'move') onMoveFloating?.(rr - sd.dr, cc - sd.dc);
      else {
        const [r, c] = cellAt(e);
        onSelect?.({ r: Math.min(r, sd.r0), c: Math.min(c, sd.c0), h: Math.abs(r - sd.r0) + 1, w: Math.abs(c - sd.c0) + 1 });
      }
      return;
    }
    const d = drag.current;
    if (!d) return;
    const [r, c] = cellAt(e);
    if (r === d.last[0] && c === d.last[1]) return;
    for (const [rr, cc] of lineCells(d.last[0], d.last[1], r, c)) paint(d.work, rr, cc);
    d.last = [r, c];
    onChange(d.work.map((row) => [...row]));
  };

  const up = () => {
    drag.current = null;
    sdrag.current = null;
  };

  const box = floating ?? (tool === 'select' ? sel : null);

  return (
    <div className="canvas-wrap">
      <canvas
        ref={ref}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={() => setHover(null)}
      />
      {box && (
        <div
          className={`sel-box ${floating ? 'floating' : ''}`}
          style={{
            left: `${(box.c / size) * 100}%`,
            top: `${(box.r / size) * 100}%`,
            width: `${(box.w / size) * 100}%`,
            height: `${(box.h / size) * 100}%`,
          }}
          aria-hidden
        />
      )}
      {size % 2 === 1 && (
        // 奇数サイズのときは真ん中のマスに十字のガイド（表示だけ。絵には入らない）
        <div className="center-guide" style={{ ['--cell' as string]: `${100 / size}%` }} aria-hidden />
      )}
    </div>
  );
}

/** スタンプを押す左上（マウスの位置がスタンプの真ん中になるように） */
export function stampOrigin([r, c]: [number, number], g: PixGrid): [number, number] {
  return [r - Math.floor(g.length / 2), c - Math.floor((g[0]?.length ?? 0) / 2)];
}

/** スタンプの見本（小さく描く） */
export function StampThumb({ grid }: { grid: PixGrid }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    cv.width = grid[0]?.length ?? 1;
    cv.height = grid.length;
    ctx.clearRect(0, 0, cv.width, cv.height);
    grid.forEach((row, i) =>
      row.forEach((v, j) => {
        if (!v) return;
        ctx.fillStyle = v;
        ctx.fillRect(j, i, 1, 1);
      }),
    );
  }, [grid]);
  return <canvas ref={ref} className="stamp-thumb" />;
}

/** パレット。小さめの四角を 10 列で。選んでいるものに枠 */
export function Swatches({ colors, selected, onPick }: { colors: string[]; selected: number | null; onPick: (i: number) => void }) {
  return (
    <div className="swatches">
      {colors.map((c, i) => (
        <button
          key={i}
          className={i === selected ? 'on' : ''}
          style={{ background: c }}
          onClick={() => onPick(i)}
          aria-label={c}
          title={c}
        />
      ))}
    </div>
  );
}

// 道具のアイコン（24px・線だけ）
const ICONS: Record<string, string> = {
  pen: 'M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3',
  eraser: 'M8 20h12M5 15l8-8 6 6-6 6H9l-4-4z',
  fill: 'M5 11l7-7 7 7-7 7-7-7zM19 15s2 2.4 2 3.5a2 2 0 01-4 0c0-1.1 2-3.5 2-3.5z',
  picker: 'M14 4l6 6M17 7l-9 9-4 4v-4l9-9M12 6l6 6',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  clear: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  select: 'M4 4h3M10 4h4M17 4h3v3M20 10v4M20 17v3h-3M14 20h-4M7 20H4v-3M4 14v-4M4 7V4',
  import: 'M4 16l4-4 3 3 5-5 4 4M4 4h16v16H4zM9 8.5a1 1 0 100 .01',
  stamp: 'M9 3h6v6l3 3v3H6v-3l3-3zM5 19h14M8 21h8',
  sound: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11',
  mute: 'M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6',
  download: 'M12 4v11M7 10l5 5 5-5M5 19h14',
};

export function ToolIcon({ name }: { name: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}
