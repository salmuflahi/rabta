import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Input, BlobSource, ALL_FORMATS } from "mediabunny";

type Response = { ok?: boolean; blob?: Blob; duration?: number; hasAudio?: boolean; hasVideo?: boolean; error?: string };
let messages: Response[];
let scope: { onmessage?: (event: { data: unknown }) => Promise<void>; postMessage: (message: Response) => void };

function wav(seconds = 1) {
  const sampleRate = 8000, samples = Math.round(sampleRate * seconds);
  const bytes = new Uint8Array(44 + samples * 2), view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => bytes.set(new TextEncoder().encode(value), at);
  text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.round(Math.sin(i / sampleRate * Math.PI * 440 * 2) * 16000), true);
  return new Blob([bytes], { type: "audio/wav" });
}

beforeEach(async () => {
  messages = [];
  scope = { postMessage: message => messages.push(message) };
  vi.stubGlobal("self", scope);
  vi.resetModules();
  await import("./media-worker");
});
afterEach(() => vi.unstubAllGlobals());

it("inspects real PCM audio locally", async () => {
  await scope.onmessage!({ data: { file: wav(), action: "inspect" } });
  expect(messages.at(-1)).toMatchObject({ ok: true, duration: 1, hasAudio: true, hasVideo: false });
});

it("trims actual WAV samples and writes a playable shorter WAV", async () => {
  await scope.onmessage!({ data: { file: wav(), action: "convert", settings: { format: "wav", start: .25, end: .75, height: 0, quality: "original", mute: false } } });
  const result = messages.at(-1)!;
  expect(result.error).toBeUndefined();
  expect(result.ok).toBe(true);
  expect(result.blob?.type).toBe("audio/wav");
  const input = new Input({ source: new BlobSource(result.blob!), formats: ALL_FORMATS });
  try {
    expect(await input.computeDuration()).toBeCloseTo(.5, 2);
    expect(await input.getPrimaryAudioTrack()).not.toBeNull();
  } finally { input.dispose(); }
});

it("rejects empty sources and impossible trim ranges before producing output", async () => {
  await scope.onmessage!({ data: { file: new Blob(), action: "inspect" } });
  expect(messages.at(-1)).toMatchObject({ ok: false });
  expect(messages.at(-1)?.error).toMatch(/100 MB/);
  await scope.onmessage!({ data: { file: wav(), action: "convert", settings: { format: "wav", start: .8, end: .2, height: 0 } } });
  expect(messages.at(-1)).toMatchObject({ ok: false });
  expect(messages.at(-1)?.error).toMatch(/start and end/);
});
