type Tool = { id: string; label: string; ready: boolean; detail?: string };

/** Connection availability, deliberately separate from saved-reference counts. */
export function RestoreReadiness({ tools }: { tools: Tool[] }) {
  const connected = tools.filter((tool) => tool.ready).length;
  return <figure className="restore-readiness">
    <svg viewBox="0 0 360 220" role="img" aria-label={`${connected} of ${tools.length} tools reachable now. This does not guarantee a complete restore.`}>
      {tools.map((tool, i) => {
        const start = Math.PI + (Math.PI * i / tools.length) + .06;
        const end = Math.PI + (Math.PI * (i + 1) / tools.length) - .06;
        return <path key={tool.id} className={tool.ready ? "is-ready" : "is-offline"} d={`M${180 + 145 * Math.cos(start)} ${185 + 145 * Math.sin(start)} A145 145 0 0 1 ${180 + 145 * Math.cos(end)} ${185 + 145 * Math.sin(end)}`} />;
      })}
      <text x="180" y="145" textAnchor="middle" className="readiness-total">{connected}<tspan> / {tools.length}</tspan></text>
      <text x="180" y="175" textAnchor="middle" className="readiness-label">tools reachable now</text>
    </svg>
    <figcaption>{tools.length ? "One segment per tool. Restore results appear in your receipt." : "No tools saved in this capsule yet."}</figcaption>
  </figure>;
}
