'use client';
// 人が /l/… を開いたら作品ページへ（履歴に残さない）
import { useEffect } from 'react';

export function Redirect({ to }: { to: string }) {
  useEffect(() => {
    location.replace(to);
  }, [to]);
  return (
    <p className="note" style={{ textAlign: 'center', padding: 40 }}>
      <a href={to}>pixmint ↗</a>
    </p>
  );
}
