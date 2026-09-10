import type { EntryKind, TeamEntry, TeamMember, TeamPlace } from "./client";

/** The Lens ladder, one colour per person. Ember is the accent and never a person. */
export const PERSON_COLORS = ["#BAD0BD", "#D7A57B", "#B4D5DF", "#E3B4C1", "#C9B8E8", "#A8D8C8", "#9FB3C8", "#D8CBA8"] as const;

/** Stable per room: members sorted by id take colours in order, so every
 * teammate sees the same colour for the same person. */
export function personColor(memberId: string, members: Pick<TeamMember, "id">[]): string {
  const order = [...members.map(member => member.id)].sort();
  const index = order.indexOf(memberId);
  return PERSON_COLORS[(index < 0 ? order.length : index) % PERSON_COLORS.length];
}
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? "")).toLocaleUpperCase() || "?";
}
/** Clients order by Lamport clock, then author, then server sequence. */
export function orderEntries(entries: TeamEntry[]): TeamEntry[] {
  return [...entries].sort((a, b) => a.lamport - b.lamport || a.author.localeCompare(b.author) || a.seq - b.seq);
}
export function nextLamport(entries: TeamEntry[]): number {
  return entries.reduce((max, entry) => Math.max(max, entry.lamport), 0);
}
export function placeLabel(place: TeamPlace | null | undefined): string {
  if (!place) return "";
  if (place.label) return place.label;
  switch (place.type) {
    case "file": return `${place.path}${place.line ? `:${place.line}` : ""}`;
    case "folder": return `${place.path}/`;
    case "link": { try { const url = new URL(place.url); return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`; } catch { return place.url; } }
    case "commit": return place.sha.slice(0, 7);
    case "image": return `image · ${Math.round(place.x * 100)}%, ${Math.round(place.y * 100)}%`;
  }
}
export const KIND_VERBS: Record<EntryKind, string> = {
  knot: "tied a knot", request: "asked", decision: "decided", acknowledge: "acknowledged", handoff: "handed off",
  accept: "stepped in", decline: "declined", split: "split the capsule", weave: "wove back", link: "linked",
};
/** Who acknowledged a decision, in order. */
export function acknowledgements(entries: TeamEntry[], decision: TeamEntry): string[] {
  return orderEntries(entries).filter(entry => entry.kind === "acknowledge" && entry.target === decision.hash).map(entry => entry.author);
}
/** The answer to a hand-off, if any. */
export function handoffAnswer(entries: TeamEntry[], handoff: TeamEntry): TeamEntry | undefined {
  return entries.find(entry => ["accept", "decline"].includes(entry.kind) && entry.target === handoff.hash);
}
export function waitingFor(entry: TeamEntry, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(entry.createdAt)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}
/** A task id the service accepts, derived from a title or a local id. */
export function taskIdFor(source: string): string {
  const slug = source.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return slug || "task";
}
/** The thread as Markdown: every knot with its place, decisions with who
 * acknowledged them. Suitable for a pull request description. */
export function threadMarkdown(title: string, entries: TeamEntry[], members: TeamMember[]): string {
  const name = (id: string) => members.find(member => member.id === id)?.displayName ?? "Former member";
  const ordered = orderEntries(entries);
  const lines = [`# ${title}`, ""];
  for (const entry of ordered) {
    if (["acknowledge", "accept", "decline"].includes(entry.kind)) continue;
    const when = new Date(entry.createdAt).toISOString().slice(0, 16).replace("T", " ");
    const where = entry.place ? ` · \`${placeLabel(entry.place)}\`` : "";
    const head = `- **${name(entry.author)}** ${KIND_VERBS[entry.kind]}${entry.to ? ` to ${name(entry.to)}` : ""}${where} · ${when}`;
    lines.push(head);
    if (entry.text) lines.push(`  ${entry.text.replace(/\n/g, "\n  ")}`);
    if (entry.kind === "decision") {
      const acks = acknowledgements(entries, entry).map(name);
      lines.push(`  Acknowledged by ${acks.length ? acks.join(", ") : "no one yet"}.`);
    }
    if (entry.kind === "handoff") {
      const answer = handoffAnswer(entries, entry);
      lines.push(`  ${answer ? `${name(answer.author)} ${answer.kind === "accept" ? "stepped in" : "declined"}.` : "Waiting."}`);
    }
  }
  lines.push("", "Exported from Rabta Teams. Places are project-relative references; no file contents were included.");
  return lines.join("\n");
}
