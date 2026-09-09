import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DownloadButton } from "./ui";
import { exportName } from "./image-core.js";
import { useEffect, useRef, useState } from "react";
import { Progress } from "./ui";
type Info = {
  duration: number;
  width: number;
  height: number;
  hasVideo: boolean;
  hasAudio: boolean;
};
type Reply = Info & {
  ok: boolean;
  error?: string;
  blob?: Blob;
  audioOnly?: boolean;
  format?: string;
  progress?: number;
};
export function MediaUtility() {
  const [file, setFile] = useState<File | null>(null),
    [info, setInfo] = useState<Info | null>(null),
    [sourceUrl, setSourceUrl] = useState(""),
    [format, setFormat] = useState("webm"),
    [height, setHeight] = useState(0),
    [quality, setQuality] = useState("original"),
    [start, setStart] = useState("0"),
    [end, setEnd] = useState(""),
    [mute, setMute] = useState(false),
    [busy, setBusy] = useState<"reading" | "converting" | null>(null),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [status, setStatus] = useState(
      "Choose a video or audio file. Nothing is uploaded.",
    ),
    [result, setResult] = useState<{
      url: string;
      name: string;
      size: number;
      audioOnly: boolean;
    } | null>(null);
  const serial = useRef(0),
    active = useRef<{ worker: Worker; cancel: () => void } | null>(null),
    errorRef = useRef<HTMLParagraphElement>(null),
    picker = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      serial.current++;
      active.current?.cancel();
    },
    [],
  );
  useEffect(
    () => () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    },
    [sourceUrl],
  );
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  function work(
    file: File,
    action: string,
    settings?: Record<string, unknown>,
  ): Promise<Reply> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL("./media-worker.ts", import.meta.url),
        { type: "module" },
      );
      let last = 0;
      const finish = () => {
        clearTimeout(timer);
        worker.terminate();
        if (active.current?.worker === worker) active.current = null;
      };
      const cancel = () => {
        finish();
        reject(Error("Cancelled"));
      };
      const timer = window.setTimeout(() => {
        finish();
        reject(
          Error(
            "The conversion exceeded two minutes. Shorten the clip or reduce its resolution and try again.",
          ),
        );
      }, 120000);
      active.current = { worker, cancel };
      worker.onmessage = (e: MessageEvent<Reply>) => {
        if (typeof e.data.progress === "number") {
          const now = Date.now();
          if (now - last > 100) {
            last = now;
            setProgress(Math.min(99, Math.round(e.data.progress * 100)));
          }
          return;
        }
        finish();
        e.data.ok
          ? resolve(e.data)
          : reject(Error(e.data.error || "Conversion failed."));
      };
      worker.onerror = () => {
        finish();
        reject(
          Error(
            "The local media processor could not start. Reload or try a recent desktop browser.",
          ),
        );
      };
      worker.postMessage({ file, action, settings });
    });
  }
  function changed() {
    setResult(null);
    setError("");
    setProgress(0);
    setStatus("Settings changed. Convert again to create an updated file.");
  }
  function cancel() {
    serial.current++;
    active.current?.cancel();
    setBusy(null);
    setProgress(0);
    setStatus("Cancelled. No output created; your original is unchanged.");
  }
  async function choose(f: File) {
    if (active.current) return;
    if (!f.size || f.size > 100 * 1024 * 1024) {
      setError("Choose a file up to 100 MB.");
      return;
    }
    const id = ++serial.current;
    setError("");
    setBusy("reading");
    setStatus("Reading tracks on your device…");
    try {
      const data = await work(f, "inspect");
      if (id !== serial.current) return;
      setFile(f);
      setInfo(data);
      setSourceUrl(URL.createObjectURL(f));
      setEnd(String(Math.floor(data.duration * 1000) / 1000));
      setStart("0");
      setFormat(data.hasVideo ? "webm" : "wav");
      setResult(null);
      setStatus(`${f.name} · ${data.duration.toFixed(2)} seconds. Ready.`);
    } catch (e) {
      if (id === serial.current)
        setError(e instanceof Error ? e.message : "Could not open this file.");
    } finally {
      if (id === serial.current) setBusy(null);
    }
  }
  async function convert() {
    if (!file || !info || active.current) return;
    if (
      !Number.isFinite(Number(start)) ||
      !Number.isFinite(Number(end)) ||
      Number(start) < 0 ||
      Number(end) <= Number(start) ||
      Number(end) > info.duration + 0.01
    ) {
      setError(
        "Keep start and end inside the clip, with the end after the start.",
      );
      return;
    }
    const id = ++serial.current;
    setBusy("converting");
    setProgress(0);
    setResult(null);
    setError("");
    setStatus("Checking codecs, then converting locally…");
    try {
      const data = await work(file, "convert", {
        format,
        height,
        quality,
        start: Number(start),
        end: Number(end),
        mute,
      });
      if (id !== serial.current) return;
      if (!data.blob) throw Error("No media output was created.");
      setResult({
        url: URL.createObjectURL(data.blob),
        name: exportName(file.name, "rabta", format),
        size: data.blob.size,
        audioOnly: Boolean(data.audioOnly),
      });
      setProgress(100);
      setStatus("Conversion finished. Preview and download the result.");
    } catch (e) {
      if (id === serial.current) {
        setError(
          e instanceof Error ? e.message : "Could not convert this file.",
        );
        setStatus("No result created. Your original is unchanged.");
      }
    } finally {
      if (id === serial.current) setBusy(null);
    }
  }
  const audioOnly = format === "wav" || format === "ogg";
  return (
    <div className="utility-workspace">
      <div className="utility-controls">
        <div
          className="utility-picker"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (busy) return;
            if (e.dataTransfer.files.length !== 1) {
              setError("Choose one media file at a time.");
              return;
            }
            void choose(e.dataTransfer.files[0]);
          }}
        >
          <strong>{file?.name || "Your next clip starts here."}</strong>
          <p>
            MP4, MOV, WebM, MKV, MP3, WAV, FLAC or Ogg.
            <br />
            Up to 100 MB · 10 minutes · 4K.
          </p>
          <Input
            ref={picker}
            type="file"
            aria-label="Choose media file"
            accept="video/*,audio/*,.mkv,.mov"
            disabled={Boolean(busy)}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void choose(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            className="utility-button"
            disabled={Boolean(busy)}
            onClick={() => picker.current?.click()}
          >
            {file ? "Choose another file" : "Choose video or audio"}
          </Button>
          <small>or drop a file here</small>
        </div>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void convert();
          }}
        >
          <fieldset disabled={!info || Boolean(busy)}>
            <legend className="utility-settings-label">YOUR OUTPUT</legend>
            <fieldset className="utility-formats">
              <legend>Format</legend>
              {["mp4", "webm", "wav", "ogg"].map((f) => (
                <label key={f}>
                  <input
                    type="radio"
                    name="media-format"
                    checked={format === f}
                    onChange={() => {
                      setFormat(f);
                      changed();
                    }}
                  />
                  <span>{f.toUpperCase()}</span>
                </label>
              ))}
            </fieldset>
            <p className="utility-note">
              WAV and Ogg export audio only. Video formats keep the primary
              video and audio tracks, unless you choose to mute.
            </p>
            {!audioOnly && (
              <>
                <fieldset className="utility-formats">
                  <legend>Maximum height</legend>
                  {[
                    [0, "Original"],
                    [720, "720p"],
                    [1080, "1080p"],
                    [2160, "4K"],
                  ].map(([n, label]) => (
                    <label key={n}>
                      <input
                        type="radio"
                        name="media-height"
                        checked={height === n}
                        onChange={() => {
                          setHeight(Number(n));
                          changed();
                        }}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
                <fieldset className="utility-formats">
                  <legend>Video quality</legend>
                  {["original", "balanced", "high"].map((q) => (
                    <label key={q}>
                      <input
                        type="radio"
                        name="media-quality"
                        checked={quality === q}
                        onChange={() => {
                          setQuality(q);
                          changed();
                        }}
                      />
                      <span>{q}</span>
                    </label>
                  ))}
                </fieldset>
                <label className="utility-check">
                  <input
                    type="checkbox"
                    checked={mute}
                    onChange={(e) => {
                      setMute(e.target.checked);
                      changed();
                    }}
                  />
                  Remove audio from video
                </label>
              </>
            )}
            <div className="utility-numbers">
              <label>
                Start · seconds
                <Input
                  type="number"
                  min="0"
                  max={info?.duration || 0}
                  step="0.001"
                  required
                  value={start}
                  aria-invalid={error.startsWith("Keep start") || undefined}
                  aria-describedby={error ? "media-error" : undefined}
                  onChange={(e) => {
                    setStart(e.target.value);
                    changed();
                  }}
                />
              </label>
              <label>
                End · seconds
                <Input
                  type="number"
                  min="0"
                  max={info?.duration || 0}
                  step="0.001"
                  required
                  value={end}
                  aria-invalid={error.startsWith("Keep start") || undefined}
                  aria-describedby={error ? "media-error" : undefined}
                  onChange={(e) => {
                    setEnd(e.target.value);
                    changed();
                  }}
                />
              </label>
            </div>
            <Button type="submit" variant="primary" className="utility-button rk-primary">
              Convert {audioOnly ? "audio" : "video"}
            </Button>
          </fieldset>
        </form>
        {busy && (
          <>
            <Progress
              value={busy === "reading" ? undefined : progress}
              aria-label={
                busy === "reading"
                  ? "Reading source media"
                  : "Conversion progress"
              }
            />
            <Button type="button" className="utility-cancel" onClick={cancel}>
              Cancel {busy === "reading" ? "reading" : "conversion"}
            </Button>
          </>
        )}
        {error && (
          <p
            id="media-error"
            className="utility-error"
            ref={errorRef}
            tabIndex={-1}
            role="alert"
          >
            {error}
          </p>
        )}
        <p className="utility-status" role="status">
          {status}
        </p>
        {file && !busy && <Button type="button" variant="ghost" onClick={() => {
          serial.current++;
          setFile(null); setInfo(null); setSourceUrl(""); setResult(null); setError(""); setProgress(0);
          setStatus("File removed. Choose another to begin.");
          picker.current?.focus();
        }}>Remove file</Button>}
        <p className="utility-note">
          Original quality keeps compatible tracks without re-encoding. Changing
          resolution, format or quality can require available media codecs. Support
          depends on the codecs this Mac can decode and encode. Unsupported
          tracks stop the conversion. Extra language tracks, subtitles and
          metadata are excluded. Limit: 100 MB output and two minutes of
          processing per job.
        </p>
      </div>
      <div className="utility-preview">
        <div className="utility-preview-heading">
          {result ? "YOUR RESULT" : "YOUR SOURCE"}
        </div>
        <div className="media-preview">
          {sourceUrl ? (
            result?.audioOnly || (!result && info && !info.hasVideo) ? (
              <audio
                key={result?.url || sourceUrl}
                controls
                src={result?.url || sourceUrl}
                aria-label={result ? "Converted audio" : "Original audio"}
              />
            ) : (
              <video
                key={result?.url || sourceUrl}
                controls
                playsInline
                preload="metadata"
                src={result?.url || sourceUrl}
                aria-label={result ? "Converted video" : "Original video"}
              />
            )
          ) : (
            <span>Choose a file to inspect its tracks.</span>
          )}
        </div>
        <div className="utility-preview-footer">
          <span>
            {result
              ? `${(result.size / 1048576).toFixed(2)} MB · ${format.toUpperCase()}`
              : info
                ? `${info.hasVideo ? `${info.width} × ${info.height} · ` : ""}${info.duration.toFixed(2)} seconds`
                : "Processed on your device."}
          </span>
          {result && (
            <DownloadButton variant="primary" className="utility-button rk-primary"
              href={result.url}
              download={result.name}
            >
              Download {format.toUpperCase()}
            </DownloadButton>
          )}
        </div>
      </div>
    </div>
  );
}
