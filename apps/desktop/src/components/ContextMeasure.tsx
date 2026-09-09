export type ContextMeasureItem = { id: string; label: string; count: number; detail?: string };

/** A count of saved references, never a claim of live restore readiness. */
export function ContextMeasure({ items, compact = false }: { items: ContextMeasureItem[]; compact?: boolean }) {
  const valid = items.filter((item) => Number.isSafeInteger(item.count) && item.count > 0);
  const total = valid.reduce((sum, item) => sum + Math.floor(item.count), 0);
  const markers = Math.min(total, 80);
  const at = (index: number) => {
    let boundary = 0;
    return valid.findIndex((item) => { boundary += item.count; return index * total / markers < boundary; });
  };
  return <figure className={`context-measure${compact ? " is-compact" : ""}`}>
    <svg viewBox="0 0 360 210" role="img" aria-label={`${total} saved references: ${valid.map((item) => item.label).join(", ") || "nothing captured yet"}`}>
      <path className="measure-track" d="M36 159A153 153 0 0 1 324 159" fill="none" />
      {Array.from({ length: markers }, (_, i) => {
        const angle = (200 + 140 * (i + .5) / Math.max(markers, 1)) * Math.PI / 180;
        const group = at(i);
        return <path className={`measure-tick measure-group-${group % 4}`} key={i} d={`M${180 + 145 * Math.cos(angle)} ${211 + 145 * Math.sin(angle)}L${180 + 158 * Math.cos(angle)} ${211 + 158 * Math.sin(angle)}`} />;
      })}
      <text className="measure-total" x="180" y="150" textAnchor="middle">{total}</text>
      <text className="measure-label" x="180" y="175" textAnchor="middle">{total === 1 ? "saved reference" : "saved references"}</text>
    </svg>
    <figcaption>{total ? (total > 80 ? "Grouped markers · exact totals below" : "One mark. One saved reference.") : "Capture a task to keep its context here."}</figcaption>
    <ul>{valid.map((item, i) => <li className={`measure-group-${i % 4}`} key={item.id}><i aria-hidden="true" /><div><strong>{item.label}</strong>{item.detail && <span>{item.detail}</span>}</div></li>)}</ul>
  </figure>;
}
