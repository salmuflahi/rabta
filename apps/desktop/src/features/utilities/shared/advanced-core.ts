/** Bounded local transforms. These functions never send data or execute input. */
export type DiffLine = { kind: "same" | "add" | "remove"; text: string };
export function diffLines(before: string, after: string): DiffLine[] {
  if (before.length + after.length > 500_000)
    throw new Error("Compare at most 500,000 characters in total.");
  const split = (s: string) =>
    s === "" ? [] : s.replace(/\r\n?/g, "\n").split("\n");
  const a = split(before),
    b = split(after);
  if (a.length > 1500 || b.length > 1500)
    throw new Error("Compare at most 1,500 lines per version.");
  const columns = b.length + 1,
    grid = new Uint16Array((a.length + 1) * columns);
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      grid[i * columns + j] =
        a[i] === b[j]
          ? 1 + grid[(i + 1) * columns + j + 1]
          : Math.max(grid[(i + 1) * columns + j], grid[i * columns + j + 1]);
  const result: DiffLine[] = [];
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      result.push({ kind: "same", text: a[i++] });
      j++;
    } else if (
      i < a.length &&
      (j === b.length ||
        grid[(i + 1) * columns + j] >= grid[i * columns + j + 1])
    )
      result.push({ kind: "remove", text: a[i++] });
    else result.push({ kind: "add", text: b[j++] });
  }
  return result;
}
export function parseTimestamp(
  value: string,
  unit: "seconds" | "milliseconds" | "ISO",
): Date {
  const input = value.trim();
  let result: Date;
  if (unit === "ISO") {
    const match =
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/i.exec(
        input,
      );
    if (!match)
      throw new Error(
        "Use ISO 8601 with a timezone, such as 2026-09-09T14:30:00-04:00.",
      );
    validateWallTime(
      `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}`,
    );
    if (Number(match[6] ?? 0) > 59)
      throw new Error("Seconds must be between 00 and 59.");
    result = new Date(input);
  } else {
    if (!/^-?\d+$/.test(input))
      throw new Error("Enter a whole Unix timestamp and choose its unit.");
    const value = Number(input);
    if (!Number.isSafeInteger(value))
      throw new Error("This timestamp exceeds safe numeric precision.");
    result = new Date(value * (unit === "seconds" ? 1000 : 1));
  }
  if (
    !Number.isFinite(result.getTime()) ||
    result.getUTCFullYear() < 1 ||
    result.getUTCFullYear() > 9999
  )
    throw new Error("Choose a date between years 0001 and 9999.");
  return result;
}
export function validTimezone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(0);
    return true;
  } catch {
    return false;
  }
}
function validateWallTime(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(value);
  if (!m)
    throw new Error("Enter the date as YYYY-MM-DD HH:mm using 24-hour time.");
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const dt = new Date(0);
  dt.setUTCFullYear(y, mo - 1, d);
  dt.setUTCHours(h, mi, 0, 0);
  if (
    y < 1 ||
    y > 9999 ||
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d ||
    h > 23 ||
    mi > 59
  )
    throw new Error("That calendar date or time does not exist.");
  return dt.getTime();
}
function wallMillis(instant: number, zone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const date = new Date(0);
  date.setUTCFullYear(n("year"), n("month") - 1, n("day"));
  date.setUTCHours(n("hour"), n("minute"), n("second"), 0);
  return date.getTime();
}
/** Reject gaps and repeated wall times instead of guessing during DST changes. */
export function scheduledInstant(wallTime: string, zone: string): string {
  if (!validTimezone(zone))
    throw new Error(
      "Enter a valid timezone, such as America/New_York or Europe/London.",
    );
  const target = validateWallTime(wallTime),
    offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = target + hours * 3600_000;
    offsets.add(wallMillis(probe, zone) - probe);
  }
  const matches = [...offsets]
    .map((offset) => target - offset)
    .filter((instant) => wallMillis(instant, zone) === target);
  if (matches.length === 0)
    throw new Error(
      "This local time is skipped by a timezone change. Choose another time.",
    );
  if (matches.length > 1)
    throw new Error(
      "This local time happens twice during a timezone change. Choose another time, or enter the exact UTC time with timezone UTC.",
    );
  return new Date(matches[0]).toISOString();
}

export type StudyCard = { question: string; answer: string; source: string };
export function studyCards(notes: string): StudyCard[] {
  if (notes.length > 50_000)
    throw new Error("Use at most 50,000 characters of notes.");
  const cards: StudyCard[] = [],
    seen = new Set<string>();
  for (const raw of notes.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*•]\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const definition = /^(.{1,160}?)(?::\s+|\s+[—–]\s+)(.{2,})$/.exec(line);
    let card: StudyCard;
    if (definition)
      card = {
        question: `Explain: ${definition[1]}`,
        answer: definition[2],
        source: line,
      };
    else {
      const words = [...line.matchAll(/[\p{L}][\p{L}'’-]{3,}/gu)].sort(
        (a, b) => b[0].length - a[0].length,
      );
      const word = words[0];
      if (!word || line.length < 15) continue;
      card = {
        question:
          line.slice(0, word.index) +
          "_____" +
          line.slice(word.index! + word[0].length),
        answer: word[0],
        source: line,
      };
    }
    const key = card.question.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      cards.push(card);
    }
    if (cards.length === 100) break;
  }
  if (!cards.length)
    throw new Error(
      "Add a term and definition on each line, like Photosynthesis: Plants turn light into chemical energy.",
    );
  return cards;
}
export function quizOptions(cards: StudyCard[], index: number) {
  const answer = cards[index]?.answer;
  if (!answer) return [];
  const wrong = [...new Set(cards.map((c) => c.answer))]
    .filter((x) => x.toLocaleLowerCase() !== answer.toLocaleLowerCase())
    .slice(0, 3);
  const options = [...wrong];
  options.splice(index % (wrong.length + 1), 0, answer);
  return options;
}

export type PlannedPost = {
  id: string;
  title: string;
  channel: string;
  caption: string;
  wallTime: string;
  timezone: string;
  instant: string;
};
export function validatePost(input: PlannedPost): PlannedPost {
  if (!input.id || !/^[\w-]{1,100}$/.test(input.id))
    throw new Error("This draft has an invalid identifier.");
  if (!input.title.trim() || input.title.length > 160)
    throw new Error("Add a post title up to 160 characters.");
  if (input.channel.length > 100 || input.caption.length > 10_000)
    throw new Error(
      "Keep the channel under 100 characters and the caption under 10,000.",
    );
  return {
    ...input,
    title: input.title.trim(),
    instant: scheduledInstant(input.wallTime, input.timezone),
  };
}
export function parsePlan(raw: string | null): PlannedPost[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Saved plan is unreadable. It has not been overwritten.");
  }
  if (!Array.isArray(parsed) || parsed.length > 100)
    throw new Error(
      "Saved plan is unreadable. Export or repair the saved data before replacing it.",
    );
  const ids = new Set<string>();
  return parsed.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      [
        "id",
        "title",
        "channel",
        "caption",
        "wallTime",
        "timezone",
        "instant",
      ].some((key) => typeof item[key] !== "string")
    )
      throw new Error("Saved plan is unreadable. It has not been overwritten.");
    const result = validatePost(item);
    if (ids.has(result.id))
      throw new Error(
        "Saved plan has duplicate identifiers. It has not been overwritten.",
      );
    ids.add(result.id);
    return result;
  });
}
function icsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}
function foldCalendarLine(line: string) {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let chunk = "",
    bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      chunks.push(chunk);
      chunk = " ";
      bytes = 1;
    }
    chunk += character;
    bytes += size;
  }
  chunks.push(chunk);
  return chunks.join("\r\n");
}
export function calendarExport(
  posts: PlannedPost[],
  createdAt = new Date().toISOString(),
) {
  if (!posts.length) throw new Error("Add a scheduled draft first.");
  const stamp = (iso: string) =>
    parseTimestamp(iso, "ISO")
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rabta//Content reminders//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const source of posts) {
    const post = validatePost(source);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${post.id}@rabta.local`,
      `DTSTAMP:${stamp(createdAt)}`,
      `DTSTART:${stamp(post.instant)}`,
      `DTEND:${stamp(new Date(Date.parse(post.instant) + 15 * 60000).toISOString())}`,
      `SUMMARY:${icsText(`Post reminder: ${post.title}`)}`,
      `DESCRIPTION:${icsText(`${post.channel}\n${post.caption}\nPlanned in ${post.timezone}: ${post.wallTime}\nRabta reminder only. Publish the post yourself.`)}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT15M",
      "ACTION:DISPLAY",
      "DESCRIPTION:Review and publish your planned post",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldCalendarLine).join("\r\n") + "\r\n";
}
