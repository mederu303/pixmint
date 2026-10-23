'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { convert, detectPixelArt, dropBackground, placePixels, sample } from '../lib/convert';
import { useI18n } from '../lib/i18n';
import type { PixGrid } from '../lib/pix';
import { PXM_MAX_RUNS } from '../src/pxm';

/** 画像 → ドット絵の確認画面。色数・ディザ・パレットに寄せるかを選んで、プレビューを見てから置く */
export function ImportDialog({
  image,
  size,
  bg,
  palette,
  onApply,
  onCancel,
}: {
  image: ImageBitmap;
  size: number;
  bg: string;
  palette: string[];
  onApply: (grid: PixGrid) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [colors, setColors] = useState(16);
  const [dither, setDither] = useState(false);
  const [usePalette, setUsePalette] = useState(false);
  const ref = useRef<HTMLCanvasElement>(null);

  // ドット絵の拡大画像なら元のマス目を読む（にじまない）。写真などはなめらかに縮める
  const art = useMemo(() => detectPixelArt(image), [image]);
  const [asPixels, setAsPixels] = useState(true);
  const [dropBg, setDropBg] = useState(true);
  const rgba = useMemo(() => {
    const raw = art && asPixels ? placePixels(art, size) : sample(image, size);
    return dropBg ? dropBackground(raw, bg) : raw;
  }, [art, asPixels, image, size, dropBg, bg]);
  const result = useMemo(
    () => convert(rgba, size, bg, { colors, dither, palette: usePalette ? palette : undefined }),
    [rgba, size, bg, colors, dither, usePalette, palette],
  );

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    cv.width = size;
    cv.height = size;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    result.grid.forEach((row, r) =>
      row.forEach((c, k) => {
        if (!c) return;
        ctx.fillStyle = c;
        ctx.fillRect(k, r, 1, 1);
      }),
    );
  }, [result, size, bg]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && result.runs <= PXM_MAX_RUNS) onApply(result.grid);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [result, onApply, onCancel]);

  const tooMany = result.runs > PXM_MAX_RUNS;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={t('import.title')} onClick={onCancel}>
      <div className="panel stack modal-box" onClick={(e) => e.stopPropagation()}>
        <h3>{t('import.title')}</h3>
        <canvas ref={ref} className="import-preview" />
        <div className="meta">
          <span>{t('mint.colors')}</span>
          <b>{result.colors}</b>
          <span>{t('mint.runs')}</span>
          <b className={tooMany ? 'bad' : result.runs >= PXM_MAX_RUNS * 0.8 ? 'warn' : undefined}>
            {result.runs > PXM_MAX_RUNS ? '> ' + PXM_MAX_RUNS.toLocaleString() : result.runs.toLocaleString()} /{' '}
            {PXM_MAX_RUNS.toLocaleString()}
          </b>
        </div>
        <label className="stack" style={{ gap: 4 }}>
          <span className="note lbl">
            {t('import.colors')}
            <span>{colors}</span>
          </span>
          <input type="range" min={2} max={32} value={colors} onChange={(e) => setColors(Number(e.target.value))} />
        </label>
        {art && (
          <p className="note ok">
            {t('import.detected', { w: art.w, h: art.h })}
            {(art.w > size || art.h > size) && ' ' + t('import.shrunk', { size })}
          </p>
        )}
        <div className="chips">
          {art && (
            <button className={`tool ${asPixels ? 'on' : ''}`} onClick={() => setAsPixels((v) => !v)} aria-pressed={asPixels}>
              {t('import.asPixels')}
            </button>
          )}
          <button className={`tool ${dropBg ? 'on' : ''}`} onClick={() => setDropBg((v) => !v)} aria-pressed={dropBg} title={t('import.dropBgHint')}>
            {t('import.dropBg')}
          </button>
          <button className={`tool ${dither ? 'on' : ''}`} onClick={() => setDither((d) => !d)} aria-pressed={dither}>
            {t('import.dither')}
          </button>
          <button className={`tool ${usePalette ? 'on' : ''}`} onClick={() => setUsePalette((p) => !p)} aria-pressed={usePalette}>
            {t('import.usePalette')}
          </button>
        </div>
        {result.reduced && !tooMany && <p className="note warn">{t('import.reduced', { n: result.colors })}</p>}
        {tooMany && <p className="note bad">{t('mint.tooDetailed')}</p>}
        <p className="note">{t('import.note', { size })}</p>
        <div className="chips">
          <button onClick={() => onApply(result.grid)} disabled={tooMany}>
            {t('import.apply')}
          </button>
          <button className="tool" onClick={onCancel}>
            {t('import.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
