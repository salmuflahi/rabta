#!/usr/bin/env node
/**
 * Record the two approved product-return loops from the real capture app.
 *
 * Requirements: macOS Screen Recording permission for the invoking terminal,
 * Google Chrome, and the desktop workspace dependencies already installed.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "..");
const repoRoot = resolve(appDir, "../..");
const outDir = join(repoRoot, "website/assets/demos");

const PORT = 5199;
const WINDOW = { left: 64, top: 64 };
const REPLACE = process.argv.includes("--replace");

const JOBS = [
  { demo: "hero-return", variant: "desktop", width: 1280, height: 720, seconds: 8.0, tolerance: 0.5, preset: "PresetAppleM4V720pHD" },
  { demo: "hero-return", variant: "mobile", width: 390, height: 700, seconds: 8.0, tolerance: 0.5, preset: "PresetPassthrough", exactSize: true },
  { demo: "honest-return", variant: "desktop", width: 1280, height: 720, seconds: 5.0, tolerance: 0.4, preset: "PresetAppleM4V720pHD" },
  { demo: "honest-return", variant: "mobile", width: 390, height: 700, seconds: 5.0, tolerance: 0.4, preset: "PresetPassthrough", exactSize: true },
];

/** `screencapture` records Retina regions at 2x physical pixels. Apple's
 * delivery presets only offer fixed sizes (the Cellular preset turns a
 * 390x700 logical crop into 168x300), so mobile gets one native, video-only
 * AVFoundation composition after avconvert normalizes the container. */
const EXACT_SIZE_TRANSCODER = String.raw`
import AVFoundation
import CoreGraphics
import CoreVideo
import Foundation

enum TranscodeError: Error {
  case usage
  case invalidSize
  case missingVideo
  case aspectMismatch
  case cannotRead
  case cannotWrite
  case cannotAddIO
  case appendFailed
}

@main
struct ExactSizeTranscoder {
  static func main() async {
    do {
      try await transcode()
    } catch {
      fputs("exact-size transcode failed: \(error)\n", stderr)
      exit(1)
    }
  }

  static func transcode() async throws {
    guard CommandLine.arguments.count == 5 else { throw TranscodeError.usage }
    let input = URL(fileURLWithPath: CommandLine.arguments[1])
    let output = URL(fileURLWithPath: CommandLine.arguments[2])
    guard let width = Int(CommandLine.arguments[3]), let height = Int(CommandLine.arguments[4]) else {
      throw TranscodeError.invalidSize
    }

    let source = AVURLAsset(url: input)
    guard let sourceTrack = try await source.loadTracks(withMediaType: .video).first else {
      throw TranscodeError.missingVideo
    }
    let duration = try await source.load(.duration)
    let naturalSize = try await sourceTrack.load(.naturalSize)
    let preferredTransform = try await sourceTrack.load(.preferredTransform)
    let sourceRect = CGRect(origin: .zero, size: naturalSize).applying(preferredTransform)
    let target = CGSize(width: width, height: height)
    let sourceAspect = abs(sourceRect.width / sourceRect.height)
    let targetAspect = target.width / target.height
    guard abs(sourceAspect - targetAspect) < 0.001 else {
      throw TranscodeError.aspectMismatch
    }

    let normalized = preferredTransform.translatedBy(
      x: -sourceRect.origin.x,
      y: -sourceRect.origin.y
    )
    let scale = CGAffineTransform(
      scaleX: target.width / abs(sourceRect.width),
      y: target.height / abs(sourceRect.height)
    )
    let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: sourceTrack)
    layerInstruction.setTransform(normalized.concatenating(scale), at: .zero)
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: duration)
    instruction.layerInstructions = [layerInstruction]
    let videoComposition = AVMutableVideoComposition()
    videoComposition.instructions = [instruction]
    videoComposition.renderSize = target
    videoComposition.frameDuration = CMTime(value: 1, timescale: 30)

    // Feed the composition's decoded frames into an H.264 writer. Only a
    // video input is added, so even an unexpectedly audible source produces
    // a silent website asset. The bitrate is sufficient for this real 390px
    // UI crop while keeping mobile well below 75% of its desktop pair.
    let reader = try AVAssetReader(asset: source)
    let readerOutput = AVAssetReaderVideoCompositionOutput(
      videoTracks: [sourceTrack],
      videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
    )
    readerOutput.videoComposition = videoComposition
    guard reader.canAdd(readerOutput) else { throw TranscodeError.cannotAddIO }
    reader.add(readerOutput)

    let writer = try AVAssetWriter(outputURL: output, fileType: .m4v)
    let writerInput = AVAssetWriterInput(
      mediaType: .video,
      outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: [
          AVVideoAverageBitRateKey: 400_000,
          AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
          AVVideoMaxKeyFrameIntervalKey: 60,
        ],
      ]
    )
    guard writer.canAdd(writerInput) else { throw TranscodeError.cannotAddIO }
    writer.add(writerInput)
    guard writer.startWriting() else { throw TranscodeError.cannotWrite }
    writer.startSession(atSourceTime: .zero)
    guard reader.startReading() else { throw TranscodeError.cannotRead }

    while reader.status == .reading {
      if writerInput.isReadyForMoreMediaData {
        guard let sample = readerOutput.copyNextSampleBuffer() else { break }
        guard writerInput.append(sample) else { throw TranscodeError.appendFailed }
      } else {
        try await Task.sleep(nanoseconds: 1_000_000)
      }
    }
    guard reader.status == .completed else { throw TranscodeError.cannotRead }
    writerInput.markAsFinished()
    await writer.finishWriting()
    guard writer.status == .completed else { throw TranscodeError.cannotWrite }
  }
}
`;

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function findChrome() {
  const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!chrome) throw new Error("No Chrome-family browser found; install Chrome or add its executable to CHROME_CANDIDATES.");
  return chrome;
}

function commandText(command, args) {
  return [command, ...args].map((part) => (/[\s]/.test(part) ? JSON.stringify(part) : part)).join(" ");
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun({ stdout, stderr });
      else {
        const detail = stderr.trim() || stdout.trim() || `exit ${code ?? signal}`;
        rejectRun(new Error(`${commandText(command, args)}\n${detail}`));
      }
    });
  });
}

async function compileExactSizeTranscoder(tempDir) {
  const source = join(tempDir, "exact-size-transcoder.swift");
  const executable = join(tempDir, "exact-size-transcoder");
  writeFileSync(source, EXACT_SIZE_TRANSCODER);
  await run("/usr/bin/xcrun", ["swiftc", "-parse-as-library", source, "-o", executable]);
  return executable;
}

async function verifyMediaOutput(job, output) {
  const { stdout } = await run("/usr/bin/avmediainfo", [output, "--brief"]);
  const dimensions = /Dimensions: (\d+) x (\d+)/.exec(stdout);
  const duration = Number(/Duration: ([\d.]+) seconds/.exec(stdout)?.[1]);
  const videoTracks = (stdout.match(/^Track \d+: Video,/gm) ?? []).length;
  const audioTracks = (stdout.match(/^Track \d+: Audio,/gm) ?? []).length;
  const codec = /Format: H\.264/.test(stdout) ? "H.264" : "unknown";
  const observed = dimensions ? `${dimensions[1]}x${dimensions[2]}` : "unknown dimensions";
  if (
    dimensions?.[1] !== String(job.width) ||
    dimensions?.[2] !== String(job.height) ||
    videoTracks !== 1 ||
    audioTracks !== 0 ||
    codec !== "H.264" ||
    !Number.isFinite(duration) ||
    Math.abs(duration - job.seconds) > job.tolerance
  ) {
    throw new Error(
      `${job.demo}-${job.variant} media contract failed: ${observed}, ${duration}s, ` +
      `${videoTracks} video/${audioTracks} audio, ${codec}`,
    );
  }
  return { duration, width: Number(dimensions[1]), height: Number(dimensions[2]), videoTracks, audioTracks, codec };
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await sleep(100);
  }
  throw new Error(`capture server did not start at ${url}`);
}

async function waitForTarget(debugPort, expectedUrl, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = await response.json();
      const target = targets.find((candidate) => candidate.type === "page" && candidate.url === expectedUrl);
      if (target?.webSocketDebuggerUrl) return target;
    } catch {
      // Chrome is still starting.
    }
    await sleep(100);
  }
  throw new Error(`Chrome did not expose the capture page at ${expectedUrl}`);
}

/** Minimal Chrome DevTools websocket client. Keeping this local avoids adding
 * a browser-automation runtime solely to wait for deterministic page markers. */
class DevToolsClient {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map();
    socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.readFrames();
    });
    socket.on("error", (error) => {
      for (const { reject } of this.pending.values()) reject(error);
      this.pending.clear();
    });
  }

  static async open(webSocketUrl) {
    const url = new URL(webSocketUrl);
    const socket = connect(Number(url.port), url.hostname);
    await new Promise((resolveConnect, rejectConnect) => {
      socket.once("connect", resolveConnect);
      socket.once("error", rejectConnect);
    });

    const key = randomBytes(16).toString("base64");
    socket.write([
      `GET ${url.pathname}${url.search} HTTP/1.1`,
      `Host: ${url.host}`,
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Key: ${key}`,
      "Sec-WebSocket-Version: 13",
      "\r\n",
    ].join("\r\n"));

    let handshake = Buffer.alloc(0);
    const remainder = await new Promise((resolveHandshake, rejectHandshake) => {
      const timeout = setTimeout(() => rejectHandshake(new Error("timed out connecting to Chrome DevTools")), 10_000);
      const onData = (chunk) => {
        handshake = Buffer.concat([handshake, chunk]);
        const end = handshake.indexOf("\r\n\r\n");
        if (end === -1) return;
        clearTimeout(timeout);
        socket.off("data", onData);
        const header = handshake.subarray(0, end).toString("utf8");
        if (!header.startsWith("HTTP/1.1 101")) {
          rejectHandshake(new Error(`Chrome DevTools websocket upgrade failed: ${header.split("\r\n")[0]}`));
          return;
        }
        resolveHandshake(handshake.subarray(end + 4));
      };
      socket.on("data", onData);
    });

    const client = new DevToolsClient(socket);
    if (remainder.length) {
      client.buffer = remainder;
      client.readFrames();
    }
    return client;
  }

  readFrames() {
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        length = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }
      const masked = Boolean(second & 0x80);
      const maskBytes = masked ? 4 : 0;
      if (this.buffer.length < offset + maskBytes + length) return;
      const mask = masked ? this.buffer.subarray(offset, offset + 4) : null;
      offset += maskBytes;
      const payload = Buffer.from(this.buffer.subarray(offset, offset + length));
      this.buffer = this.buffer.subarray(offset + length);
      if (mask) payload.forEach((value, index) => { payload[index] = value ^ mask[index % 4]; });
      if (opcode === 0x1) this.onMessage(payload.toString("utf8"));
      if (opcode === 0x8) this.socket.end();
    }
  }

  onMessage(text) {
    const message = JSON.parse(text);
    if (!message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  }

  send(message) {
    const payload = Buffer.from(JSON.stringify(message));
    const mask = randomBytes(4);
    let header;
    if (payload.length < 126) {
      header = Buffer.from([0x81, 0x80 | payload.length]);
    } else if (payload.length <= 0xffff) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    const masked = Buffer.from(payload);
    masked.forEach((value, index) => { masked[index] = value ^ mask[index % 4]; });
    this.socket.write(Buffer.concat([header, mask, masked]));
  }

  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveCall, rejectCall) => {
      this.pending.set(id, { resolve: resolveCall, reject: rejectCall });
      this.send({ id, method, params });
    });
  }

  async evaluate(expression) {
    const result = await this.call("Runtime.evaluate", { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? `evaluation failed: ${expression}`);
    return result.result.value;
  }

  close() {
    this.socket.end();
  }
}

async function waitForExpression(client, expression, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`capture page did not satisfy: ${expression}`);
}

async function sizeWindow(client, targetId, job) {
  const getDimensions = () => client.evaluate(`({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    screenX: window.screenX,
    screenY: window.screenY
  })`);
  const initial = await getDimensions();
  const { windowId } = await client.call("Browser.getWindowForTarget", { targetId });
  const width = job.width + Math.max(0, initial.outerWidth - initial.innerWidth);
  const height = job.height + Math.max(0, initial.outerHeight - initial.innerHeight);
  await client.call("Browser.setWindowBounds", {
    windowId,
    bounds: { left: WINDOW.left, top: WINDOW.top, width, height, windowState: "normal" },
  });
  await sleep(250);
  const dimensions = await getDimensions();
  if (dimensions.innerWidth !== job.width || dimensions.innerHeight !== job.height) {
    throw new Error(
      `Chrome content rectangle is ${dimensions.innerWidth}x${dimensions.innerHeight}; expected ${job.width}x${job.height}`,
    );
  }
  return {
    x: dimensions.screenX + Math.round((dimensions.outerWidth - dimensions.innerWidth) / 2),
    y: dimensions.screenY + (dimensions.outerHeight - dimensions.innerHeight),
    width: dimensions.innerWidth,
    height: dimensions.innerHeight,
  };
}

function spawnChrome(chrome, profile, debugPort, url, job) {
  return spawn(chrome, [
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--force-color-profile=srgb",
    "--disable-lcd-text",
    "--autoplay-policy=no-user-gesture-required",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${debugPort}`,
    `--window-position=${WINDOW.left},${WINDOW.top}`,
    `--window-size=${job.width},${job.height}`,
    `--app=${url}`,
  ], {
    cwd: appDir,
    stdio: "ignore",
    env: { ...process.env, TZ: "UTC", LANG: "en_US.UTF-8" },
  });
}

async function activateChrome(processId) {
  // A region recording captures whichever window is topmost. Bring this
  // throwaway Chrome process forward explicitly so an unrelated user window
  // can never be composited over the product capture.
  await run("/usr/bin/osascript", [
    "-e",
    `tell application "System Events" to set frontmost of first process whose unix id is ${Number(processId)} to true`,
  ]);
  await sleep(250);
}

async function recordJob(chrome, tempDir, exactSizeTranscoder, job, index) {
  const stem = `${job.demo}-${job.variant}`;
  const output = join(outDir, `${stem}.m4v`);
  const rawMovie = join(tempDir, `${stem}.mov`);
  const rawPoster = join(tempDir, `${job.demo}.png`);
  const profile = join(tempDir, `chrome-${index}`);
  const debugPort = 9330 + index;
  const url = `http://localhost:${PORT}/#demo=${job.demo}&variant=${job.variant}`;
  const chromeProcess = spawnChrome(chrome, profile, debugPort, url, job);
  let client;

  try {
    const target = await waitForTarget(debugPort, url);
    client = await DevToolsClient.open(target.webSocketDebuggerUrl);
    const rect = await sizeWindow(client, target.id, job);
    await waitForExpression(client, 'document.documentElement.dataset.demoReady === "true"');
    await activateChrome(chromeProcess.pid);

    const captureArgs = [
      "-x",
      "-v",
      `-V${job.seconds.toFixed(1)}`,
      `-R${rect.x},${rect.y},${rect.width},${rect.height}`,
      rawMovie,
    ];
    process.stdout.write(`  ${stem.padEnd(29)} record  `);
    const recording = run("/usr/sbin/screencapture", captureArgs);
    await client.evaluate('document.dispatchEvent(new Event("rabta-demo-start")); true');

    try {
      await recording;
    } catch (error) {
      throw new Error(
        "Screen Recording failed. Grant Screen Recording permission to the invoking terminal/Codex app in " +
        `System Settings > Privacy & Security > Screen Recording, then retry.\nCommand: ${commandText("/usr/sbin/screencapture", captureArgs)}\n${error.message}`,
      );
    }
    if (!existsSync(rawMovie) || statSync(rawMovie).size === 0) {
      throw new Error(`Screen Recording produced no movie: ${commandText("/usr/sbin/screencapture", captureArgs)}`);
    }

    await waitForExpression(client, 'document.documentElement.dataset.demoComplete === "true"', 3_000);
    const finalLabelVisible = await client.evaluate(
      'document.body.innerText.includes("Workspace partially restored")',
    );
    if (!finalLabelVisible) throw new Error(`${stem} did not finish on the truthful partial-restore result`);

    if (job.variant === "desktop") {
      await run("/usr/sbin/screencapture", [
        "-x",
        `-R${rect.x},${rect.y},${rect.width},${rect.height}`,
        rawPoster,
      ]);
      writeFileSync(join(outDir, `${job.demo}.png`), readFileSync(rawPoster));
    }

    await run("/usr/bin/avconvert", [
      "--source", rawMovie,
      "--preset", job.preset,
      "--output", job.exactSize ? join(tempDir, `${stem}-passthrough.m4v`) : output,
      "--duration", job.seconds.toFixed(1),
      "--disableMetadataFilter",
      "--replace",
    ]);
    if (job.exactSize) {
      const passthrough = join(tempDir, `${stem}-passthrough.m4v`);
      rmSync(output, { force: true });
      await run(exactSizeTranscoder, [passthrough, output, String(job.width), String(job.height)]);
    }
    const media = await verifyMediaOutput(job, output);
    console.log(
      `ok  ${media.width}x${media.height} ${media.duration.toFixed(3)}s ` +
      `${media.codec} silent ${(statSync(output).size / 1024).toFixed(0)} KB`,
    );
  } finally {
    client?.close();
    chromeProcess.kill("SIGTERM");
    await sleep(250);
    if (chromeProcess.exitCode === null) chromeProcess.kill("SIGKILL");
    rmSync(profile, { recursive: true, force: true });
  }
}

async function main() {
  if (process.platform !== "darwin") throw new Error("record-demos.mjs requires macOS screencapture and avconvert.");
  const chrome = findChrome();
  mkdirSync(outDir, { recursive: true });

  const outputs = [
    ...JOBS.map((job) => join(outDir, `${job.demo}-${job.variant}.m4v`)),
    ...["hero-return.png", "honest-return.png"].map((name) => join(outDir, name)),
  ];
  const existing = outputs.filter(existsSync);
  if (existing.length && !REPLACE) {
    throw new Error(
      `Refusing to overwrite ${existing.length} demo output(s). Re-run with --replace after reviewing the fixture.`,
    );
  }

  const tempDir = mkdtempSync(join(tmpdir(), "rabta-demos-"));
  const exactSizeTranscoder = await compileExactSizeTranscoder(tempDir);
  const vite = spawn(
    join(appDir, "node_modules/.bin/vite"),
    ["--config", join(here, "vite.config.ts")],
    { cwd: appDir, stdio: "ignore", env: { ...process.env, TZ: "UTC" } },
  );

  console.log(`chrome  ${chrome}`);
  console.log(`output  ${outDir}`);
  try {
    await waitForServer(`http://localhost:${PORT}/`);
    for (const [index, job] of JOBS.entries()) {
      await recordJob(chrome, tempDir, exactSizeTranscoder, job, index);
    }
  } finally {
    vite.kill("SIGTERM");
    await sleep(150);
    if (vite.exitCode === null) vite.kill("SIGKILL");
    rmSync(tempDir, { recursive: true, force: true });
  }

  console.log(`\n${JOBS.length} real-product demos recorded serially.`);
  console.log("Inspect the videos/posters, then record their observed metadata in manifest.json.");
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
