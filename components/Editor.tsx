'use client';
import { useEffect, useRef } from 'react';
import { PALETTES, floodFill, lineCells, type PixGrid, type PixTool } from '../lib/pix';

interface Props {
  grid: PixGrid;
  bg: string;
  color: string;
  tool: PixTool;
  onChange: (next: PixGrid) => void;
  onBeginStroke: () => void;
  onPick: (color: string) => void;
}

/** キャンバス。1マス = 1画素で描いて CSS で拡大する（原本 drawPixCanvas と同じ） */
export function PixCanvas({ grid, bg, color, tool, onChange, onBeginStroke, onPick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ last: [number, number]; work: PixGrid } | null>(null);
  const size = grid.length;

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
  }, [grid, bg, size]);

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
    if (tool === 'picker') {
      onPick(grid[r][c] ?? bg);
      return;
    }
    onBeginStroke();
    const work = grid.map((row) => [...row]);
    if (tool === 'fill') {
      floodFill(work, r, c, color);
      onChange(work);
      return;
    }
    ref.current!.setPointerCapture(e.pointerId);
    paint(work, r, c);
    drag.current = { last: [r, c], work };
    onChange(work.map((row) => [...row]));
  };

  const move = (e: React.PointerEvent) => {
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
  };

  return (
    <div className="canvas-wrap">
      <canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      {size % 2 === 1 && (
        // 奇数サイズのときは真ん中のマスに十字のガイド（表示だけ。絵には入らない）
        <div className="center-guide" style={{ ['--cell' as string]: `${100 / size}%` }} aria-hidden />
      )}
    </div>
  );
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
  download: 'M12 4v11M7 10l5 5 5-5M5 19h14',
};

export function ToolIcon({ name }: { name: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}
