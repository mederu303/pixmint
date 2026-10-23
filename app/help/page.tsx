'use client';
import { HELP, type HelpItem } from '../../lib/help';
import { useI18n } from '../../lib/i18n';

/** 段落の配列を、表（"| " 行）・箇条書き（"- " 行）・段落にまとめて描く */
function Body({ a }: { a: string[] }) {
  const blocks: { kind: 'p' | 'ul' | 'table'; lines: string[] }[] = [];
  for (const line of a) {
    const kind = line.startsWith('| ') ? 'table' : line.startsWith('- ') ? 'ul' : 'p';
    const last = blocks[blocks.length - 1];
    if (last && last.kind === kind && kind !== 'p') last.lines.push(line);
    else blocks.push({ kind, lines: [line] });
  }
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === 'p') return <p key={i}>{b.lines[0]}</p>;
        if (b.kind === 'ul')
          return (
            <ul key={i}>
              {b.lines.map((l, j) => (
                <li key={j}>{l.slice(2)}</li>
              ))}
            </ul>
          );
        const rows = b.lines.map((l) => l.replace(/^\|\s*|\s*\|\s*$/g, '').split(/\s*\|\s*/));
        return (
          <div className="tbl" key={i}>
            <table>
              <thead>
                <tr>
                  {rows[0].map((c, j) => (
                    <th key={j}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(1).map((r, j) => (
                  <tr key={j}>
                    {r.map((c, k) => (
                      <td key={k}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

function Item({ item, open }: { item: HelpItem; open: boolean }) {
  return (
    <details className="faq" open={open}>
      <summary>{item.q}</summary>
      <div className="faq-a">
        <Body a={item.a} />
      </div>
    </details>
  );
}

export default function Help() {
  const { lang } = useI18n();
  const sections = HELP[lang];
  return (
    <div className="help">
      <h1>{lang === 'ja' ? 'ヘルプ' : 'Help'}</h1>
      <nav className="chips toc">
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="tool">
            {s.title}
          </a>
        ))}
      </nav>
      {sections.map((s) => (
        <section key={s.id} id={s.id} className="panel">
          <h3>{s.title}</h3>
          {s.lead && <p className="lead">{s.lead}</p>}
          {s.items.map((it, i) => (
            <Item key={i} item={it} open={i === 0} />
          ))}
        </section>
      ))}
    </div>
  );
}
