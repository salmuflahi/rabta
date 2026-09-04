// The dashboard: one HTML string, no requests. Every style lives in the one
// nonce'd <style>; bars and the sparkline are inline SVG so no inline style
// attribute is ever needed under the page's content security policy.

import type { DayPoint, Stats, Totals } from "./stats";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function num(n: number): string {
  return n.toLocaleString("en-US");
}

/** `2026-09-04` as `Sep 4`. */
function shortDay(day: string): string {
  const month = Number(day.slice(5, 7));
  return `${MONTHS[month - 1] ?? day.slice(5, 7)} ${Number(day.slice(8, 10))}`;
}

const CSS = `
:root{color-scheme:dark}
*{box-sizing:border-box}
html{background:#0a0b0e}
body{margin:0;padding:28px 20px 56px;background:#0a0b0e;color:#f5f5f7;font:15px/1.5 Inter,system-ui,-apple-system,sans-serif;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
main{max-width:960px;margin:0 auto}
header{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px 16px;padding-bottom:18px;margin-bottom:20px;border-bottom:1px solid rgba(245,245,247,.08)}
h1{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em}
h1 span{color:#7c808b;font-weight:400}
header time{color:#b4b8c2;font-size:13px}
.card{background:#14161b;border:1px solid rgba(245,245,247,.08);border-radius:10px;min-width:0}
.tiles{display:grid;gap:12px;grid-template-columns:repeat(3,minmax(0,1fr))}
.tile{padding:16px 18px 14px}
.label{color:#7c808b;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.06em}
.big{font-size:34px;font-weight:600;line-height:1.15;letter-spacing:-.02em;margin-top:6px}
.small{color:#b4b8c2;font-size:13px;margin-top:2px}
.chart{margin-top:12px;padding:16px 18px 12px}
.chart svg{display:block;width:100%;height:140px;margin-top:10px}
.views{fill:none;stroke:rgba(245,245,247,.22);stroke-width:1.5}
.visitors{fill:none;stroke:#ff6b2c;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.dot{stroke:#ff6b2c;stroke-width:7;stroke-linecap:round}
.base{stroke:rgba(245,245,247,.08);stroke-width:1}
.axis{display:flex;justify-content:space-between;color:#7c808b;font-size:12px;margin-top:6px}
.legend{display:flex;gap:16px;align-items:center;color:#b4b8c2;font-size:12px;flex-wrap:wrap}
.legend i{display:inline-block;width:14px;height:2px;vertical-align:middle;margin-right:6px;border-radius:1px}
.sw-visitors{background:#ff6b2c}
.sw-views{background:rgba(245,245,247,.22)}
.legend .peak{margin-left:auto;color:#7c808b}
.lists{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:12px}
.list{padding:14px 18px 6px}
h2{margin:0 0 4px;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:#7c808b}
ol{list-style:none;margin:0;padding:0}
.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:0 12px;padding:8px 0 9px;border-top:1px solid rgba(245,245,247,.08)}
.row:first-child{border-top:0}
.k{min-width:0;overflow-wrap:anywhere;font-size:14px}
.v{color:#b4b8c2;font-size:14px}
.bar{grid-column:1/-1;display:block;width:100%;height:3px;margin-top:6px}
.track{fill:#1e2128}
.fill{fill:rgba(245,245,247,.34)}
.empty{color:#7c808b;font-size:13px;padding:6px 0 10px}
@media (max-width:720px){.lists{grid-template-columns:1fr}}
@media (max-width:520px){body{padding:20px 14px 48px}.tiles{grid-template-columns:1fr}.big{font-size:30px}.chart svg{height:120px}}
`.trim();

function tile(label: string, t: Totals): string {
  return (
    `<div class="card tile"><div class="label">${label}</div>` +
    `<div class="big">${num(t.visitors)}</div>` +
    `<div class="small">${num(t.views)} ${t.views === 1 ? "view" : "views"}</div></div>`
  );
}

/** Two polylines on a 600 by 140 box, stretched to the card and drawn with non-scaling strokes. */
function sparkline(series: DayPoint[]): string {
  const W = 600;
  const H = 140;
  const PAD = 8;
  const n = series.length;
  const peak = Math.max(1, ...series.map((p) => p.views));
  const x = (i: number) => (n > 1 ? (i * W) / (n - 1) : W / 2);
  const y = (v: number) => PAD + (1 - v / peak) * (H - 2 * PAD);
  const path = (pick: (p: DayPoint) => number) =>
    series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(pick(p)).toFixed(1)}`).join(" ");
  const last = series[n - 1];
  const dot = last ? `<path class="dot" vector-effect="non-scaling-stroke" d="M${x(n - 1).toFixed(1)},${y(last.visitors).toFixed(1)} h0"/>` : "";
  const first = series[0];
  return (
    `<section class="card chart"><div class="legend">` +
    `<span><i class="sw-visitors"></i>visitors</span><span><i class="sw-views"></i>views</span>` +
    `<span class="peak">peak ${num(peak)} views</span></div>` +
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Visitors and views per day">` +
    `<line class="base" vector-effect="non-scaling-stroke" x1="0" y1="${H - PAD}" x2="${W}" y2="${H - PAD}"/>` +
    `<path class="views" vector-effect="non-scaling-stroke" d="${path((p) => p.views)}"/>` +
    `<path class="visitors" vector-effect="non-scaling-stroke" d="${path((p) => p.visitors)}"/>` +
    dot +
    `</svg><div class="axis"><span>${first ? shortDay(first.day) : ""}</span><span>${last ? shortDay(last.day) : ""}</span></div></section>`
  );
}

function list(title: string, rows: { k: string; n: number }[], total: number): string {
  const body =
    rows.length === 0
      ? `<div class="empty">Nothing yet.</div>`
      : `<ol>${rows
          .map((r) => {
            const share = total > 0 ? Math.max(0, Math.min(100, (100 * r.n) / total)) : 0;
            return (
              `<li class="row"><span class="k">${esc(r.k)}</span><span class="v">${num(r.n)}</span>` +
              `<svg class="bar" aria-hidden="true"><rect class="track" width="100%" height="100%"/>` +
              `<rect class="fill" width="${share.toFixed(1)}%" height="100%"/></svg></li>`
            );
          })
          .join("")}</ol>`;
  return `<section class="card list"><h2>${title}</h2>${body}</section>`;
}

/** The complete page. `nonce` must match the one in the CSP header. */
export function renderDashboard(stats: Stats, nonce: string): string {
  const today = stats.series[stats.series.length - 1]?.day ?? "";
  const total = stats.last30.views;
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="dark"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer">` +
    `<title>Rabta · site</title><style nonce="${esc(nonce)}">${CSS}</style></head><body><main>` +
    `<header><h1>Rabta <span>·</span> site</h1><time datetime="${esc(today)}">${esc(today)} UTC</time></header>` +
    `<section class="tiles">${tile("Today", stats.today)}${tile("7 days", stats.last7)}${tile("30 days", stats.last30)}</section>` +
    sparkline(stats.series) +
    `<section class="lists">` +
    list("Pages", stats.pages.map((p) => ({ k: p.path, n: p.n })), total) +
    list("Referrers", stats.referrers.map((r) => ({ k: r.host, n: r.n })), total) +
    list("Countries", stats.countries.map((c) => ({ k: c.cc, n: c.n })), total) +
    list("Devices", stats.devices.map((d) => ({ k: d.class, n: d.n })), total) +
    `</section></main></body></html>`
  );
}
