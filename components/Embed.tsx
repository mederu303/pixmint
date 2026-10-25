'use client';
// pixmint — X のツイートの中に埋め込まれる画面（medeLink と同じ形: 上に作品、下に題名・値段・↗）
//   絵はこの場でブラウザがコントラクトから読んで出す（サーバーも IPFS も通らない = フルオンチェーンをそのまま見せる）
//   見るだけのページ。mint・購入のボタンは置かない（X の中の iframe なので）
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatEther } from 'viem';
import { LABEL, workPath, type Ver } from '../lib/chains';
import { readWork, svgUrl, type WorkView } from '../lib/contract';

/** X のツイートの中に埋め込まれる画面（v3: /l/embed/<chain>/<id>・v4: /l/embed/v4/<chain>/<id>） */
export function Embed({ ver }: { ver: Ver }) {
  const params = useParams<{ chainId: string; id: string }>();
  const chainId = Number(params.chainId);
  const id = /^\d+$/.test(params.id) ? BigInt(params.id) : 0n;
  const [w, setW] = useState<WorkView | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    readWork(chainId, id, ver).then(setW, () => setError(true));
  }, [chainId, id, ver]);
  const page = `https://pixmint.mederu.art${workPath(chainId, id, ver)}`;

  return (
    <div className="embed">
      <div className="embed-art">
        {w ? <img src={svgUrl(w.svg)} alt={w.title} /> : <span className="note">{error ? 'could not read the contract' : 'reading the contract…'}</span>}
      </div>
      <div className="embed-bar">
        <b>{w ? w.title || `#${id}` : `#${id}`}</b>
        {w && w.price > 0n && <span>· {formatEther(w.price)} ETH</span>}
        <span className="embed-chain">ON-CHAIN · {LABEL[chainId] ?? ''}</span>
        <a href={page} target="_blank" rel="noopener noreferrer" aria-label="Open on pixmint">
          ↗
        </a>
      </div>
    </div>
  );
}
