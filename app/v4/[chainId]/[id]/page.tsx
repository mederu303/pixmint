'use client';
// v4（スタンプ入り）の作品ページ。v4 は id が 1 から振り直しなので /v4/ の下に置く
import { WorkPage } from '../../../../components/WorkPage';

export default function Page() {
  return <WorkPage ver={4} />;
}
