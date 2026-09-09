import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DownloadButton } from "./ui";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CreativeIcon } from "./ui";
import { BackgroundEditor } from "./background-editor";
import { CREATIVE_TOOLS, type CreativeTool } from "./catalog";
type ImageTool = Exclude<CreativeTool, "svg" | "media">;
type Reply = {
  ok: boolean;
  error?: string;
  width: number;
  height: number;
  type: string;
  blob?: Blob;
  name?: string;
  palette?: { hex: string; pixels: number }[];
};
type Source = {
  file: File;
  url: string;
  width: number;
  height: number;
  type: string;
};
type Result = {
  url: string;
  name: string;
  width: number;
  height: number;
  size: number;
};
const bytes = (n: number) =>
  n >= 1048576
    ? `${(n / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;
export function ImageUtility({ tool }: { tool: ImageTool }) {
  const spec = CREATIVE_TOOLS[tool];
  const [source, setSource] = useState<Source | null>(null),
    [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState<"reading" | "processing" | null>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState(
      "Choose an image to begin. Nothing is uploaded.",
    ),
    [dragging, setDragging] = useState(false);
  const [width, setWidth] = useState(""),
    [height, setHeight] = useState(""),
    [x, setX] = useState("0"),
    [y, setY] = useState("0"),
    [locked, setLocked] = useState(true),
    [format, setFormat] = useState(tool === "compress" ? "webp" : "png"),
    [quality, setQuality] = useState(86),
    [matte, setMatte] = useState("#ffffff"),
    [rotation, setRotation] = useState(0),
    [flipX, setFlipX] = useState(false),
    [flipY, setFlipY] = useState(false),
    [colors, setColors] = useState(6),
    [palette, setPalette] = useState<{ hex: string; pixels: number }[]>([]);
  const picker = useRef<HTMLInputElement>(null),
    errorBox = useRef<HTMLParagraphElement>(null),
    serial = useRef(0),
    active = useRef<{ worker: Worker; cancel: () => void } | null>(null),
    form = useRef<HTMLFormElement>(null);
  useEffect(
    () => () => {
      serial.current++;
      active.current?.cancel();
    },
    [],
  );
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source.url);
    },
    [source],
  );
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );
  useEffect(() => {
    if (error) {
      const field =
        form.current?.querySelector<HTMLInputElement>("input:invalid");
      (field || errorBox.current)?.focus();
    }
  }, [error]);
  function work(
    file: File,
    action: string,
    settings?: Record<string, unknown>,
  ): Promise<Reply> {
    return new Promise((resolve, reject) => {
      if (typeof Worker === "undefined") {
        reject(
          Error(
            "Local processing is unavailable. Update Rabta or try a smaller source.",
          ),
        );
        return;
      }
      const worker = new Worker(new URL("./image-worker.js", import.meta.url), {
        type: "module",
      });
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
        reject(Error("Processing took too long. Try a smaller image."));
      }, 30000);
      active.current = { worker, cancel };
      worker.onmessage = (e: MessageEvent<Reply>) => {
        finish();
        e.data.ok
          ? resolve(e.data)
          : reject(Error(e.data.error || "Processing failed."));
      };
      worker.onerror = () => {
        finish();
        reject(
          Error("The image processor could not start. Reload and try again."),
        );
      };
      worker.postMessage({ file, action, settings });
    });
  }
  function changed() {
    serial.current++;
    setResult(null);
    setPalette([]);
    setError("");
    setStatus(
      source
        ? "Settings changed. Process again for a new result."
        : "Choose an image to begin.",
    );
  }
  function cancel() {
    serial.current++;
    active.current?.cancel();
    setBusy(null);
    setStatus("Cancelled. Your original is unchanged.");
  }
  async function choose(files: FileList | File[]) {
    if (active.current) return;
    if (files.length !== 1) {
      setError("Choose one image at a time.");
      return;
    }
    const file = files[0];
    if (!file.size || file.size > 20 * 1024 * 1024) {
      setError("Choose an image up to 20 MB.");
      return;
    }
    const id = ++serial.current;
    setBusy("reading");
    setError("");
    setStatus("Checking your image locally…");
    try {
      const info = await work(file, "inspect");
      if (id !== serial.current) return;
      setSource({
        file,
        url: URL.createObjectURL(file),
        width: info.width,
        height: info.height,
        type: info.type,
      });
      const scale = Math.min(1, 4096 / info.width, 4096 / info.height);
      setWidth(String(Math.max(1, Math.round(info.width * scale))));
      setHeight(String(Math.max(1, Math.round(info.height * scale))));
      setX("0");
      setY("0");
      setResult(null);
      setPalette([]);
      setStatus(
        `${info.width} × ${info.height} pixels. ${info.type === "gif" ? "The first frame will be used." : "Ready to edit."}`,
      );
    } catch (e) {
      if (id === serial.current) {
        setError(e instanceof Error ? e.message : "Could not read this image.");
        setStatus("Your previous image is unchanged.");
      }
    } finally {
      if (id === serial.current) setBusy(null);
    }
  }
  function dimension(v: string, axis: "width" | "height") {
    changed();
    if (axis === "width") {
      setWidth(v);
      if (tool === "resize" && locked && source && Number(v) > 0)
        setHeight(
          String(
            Math.max(1, Math.round((Number(v) * source.height) / source.width)),
          ),
        );
    } else {
      setHeight(v);
      if (tool === "resize" && locked && source && Number(v) > 0)
        setWidth(
          String(
            Math.max(1, Math.round((Number(v) * source.width) / source.height)),
          ),
        );
    }
  }
  function ratio(r: number) {
    if (!source) return;
    const w = Math.min(source.width, source.height * r, 4096),
      h = w / r;
    setWidth(String(Math.floor(w)));
    setHeight(String(Math.floor(h)));
    setX(String(Math.floor((source.width - w) / 2)));
    setY(String(Math.floor((source.height - h) / 2)));
    changed();
  }
  async function process(e: FormEvent) {
    e.preventDefault();
    if (!source || active.current) return;
    if (
      ["resize", "crop"].includes(tool) &&
      ![Number(width), Number(height)].every(
        (n) => Number.isInteger(n) && n >= 1 && n <= 4096,
      )
    ) {
      setError(
        "Enter a whole-number width and height between 1 and 4096 pixels.",
      );
      return;
    }
    if (
      tool === "crop" &&
      (![Number(x), Number(y)].every((n) => Number.isInteger(n) && n >= 0) ||
        Number(x) + Number(width) > source.width ||
        Number(y) + Number(height) > source.height)
    ) {
      setError("Choose a crop entirely inside the image, using whole pixels.");
      return;
    }
    const id = ++serial.current;
    setBusy("processing");
    setError("");
    setResult(null);
    setPalette([]);
    setStatus("Processing on your device…");
    try {
      const output = await work(source.file, tool, {
        width: Number(width),
        height: Number(height),
        x: Number(x),
        y: Number(y),
        format,
        quality,
        matte,
        rotation,
        flipX,
        flipY,
        colors,
      });
      if (id !== serial.current) return;
      if (output.palette) {
        setPalette(output.palette);
        const css =
          ":root {\n" +
          output.palette
            .map((p, i) => `  --color-${i + 1}: ${p.hex};`)
            .join("\n") +
          "\n}\n";
        const blob = new Blob([css], { type: "text/css" });
        setResult({
          url: URL.createObjectURL(blob),
          name: "rabta-palette.css",
          width: source.width,
          height: source.height,
          size: blob.size,
        });
        setStatus("Palette ready. Copy a color or download CSS.");
      } else if (output.blob) {
        setResult({
          url: URL.createObjectURL(output.blob),
          name: output.name || "rabta-image.png",
          width: output.width,
          height: output.height,
          size: output.blob.size,
        });
        setStatus(
          output.blob.size < source.file.size
            ? `Ready. ${Math.round((1 - output.blob.size / source.file.size) * 100)}% smaller than the source.`
            : "Ready. This export is the same size or larger than the source.",
        );
      } else throw Error("No result was produced. Please retry.");
    } catch (e) {
      if (id === serial.current) {
        setError(e instanceof Error ? e.message : "Processing failed.");
        setStatus("No result created. Your original is unchanged.");
      }
    } finally {
      if (id === serial.current) setBusy(null);
    }
  }
  const oversized = source && (source.width > 4096 || source.height > 4096),
    needsSize = tool === "resize" || tool === "crop";
  const formats =
    tool === "compress" ? ["jpeg", "webp"] : ["png", "jpeg", "webp", "bmp"];
  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    max: number,
    min = 0,
  ) => (
    <label>
      {label}
      <Input
        required
        type="number"
        min={min}
        max={max}
        step="1"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "utility-error" : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
  return (
    <div
      className={
        tool === "transparent"
          ? "utility-workspace utility-mask-layout"
          : "utility-workspace"
      }
    >
      <div className="utility-controls">
        <div
          className={`utility-picker${dragging ? " is-dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) void choose(e.dataTransfer.files);
          }}
        >
          <CreativeIcon name="file" size={28} />
          <strong>
            {source ? source.file.name : "Your image starts here."}
          </strong>
          <p id="image-limits">
            PNG · JPEG · WebP · GIF · BMP
            <br />
            Up to 20 MB / 24 MP. Exports up to 4096 px per side.
          </p>
          <Input
            ref={picker}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
            aria-label="Choose source image"
            aria-describedby="image-limits"
            disabled={Boolean(busy)}
            onChange={(e) => {
              if (e.target.files?.length) void choose(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            className="utility-button"
            disabled={Boolean(busy)}
            onClick={() => picker.current?.click()}
          >
            {source ? "Choose another image" : "Choose image"}
          </Button>
          <small>or drop it here</small>
        </div>
        {tool !== "transparent" && (
          <form ref={form} onSubmit={process} noValidate aria-label={spec.name}>
            <fieldset disabled={!source || Boolean(busy)}>
              <legend className="utility-settings-label">YOUR EXPORT</legend>
              {needsSize && (
                <>
                  <div className="utility-numbers">
                    {field(
                      "Width · px",
                      width,
                      (v) => dimension(v, "width"),
                      4096,
                      1,
                    )}
                    {field(
                      "Height · px",
                      height,
                      (v) => dimension(v, "height"),
                      4096,
                      1,
                    )}
                    {tool === "crop" && (
                      <>
                        {field(
                          "Left · px",
                          x,
                          (v) => {
                            setX(v);
                            changed();
                          },
                          source?.width || 4096,
                        )}
                        {field(
                          "Top · px",
                          y,
                          (v) => {
                            setY(v);
                            changed();
                          },
                          source?.height || 4096,
                        )}
                      </>
                    )}
                  </div>
                  {tool === "resize" ? (
                    <label className="utility-check">
                      <input
                        type="checkbox"
                        checked={locked}
                        onChange={(e) => {
                          setLocked(e.target.checked);
                          changed();
                          if (e.target.checked && source && Number(width) > 0)
                            setHeight(
                              String(
                                Math.round(
                                  (Number(width) * source.height) /
                                    source.width,
                                ),
                              ),
                            );
                        }}
                      />
                      Keep original proportions
                    </label>
                  ) : (
                    <div
                      className="utility-presets"
                      role="group"
                      aria-label="Crop ratios"
                    >
                      {[
                        ["Square", 1],
                        ["Landscape", 16 / 9],
                        ["Portrait", 4 / 5],
                      ].map(([label, r]) => (
                        <Button
                          type="button"
                          className="utility-button"
                          key={label}
                          onClick={() => ratio(Number(r))}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {tool === "rotate" && (
                <>
                  <fieldset className="utility-formats">
                    <legend>Clockwise rotation</legend>
                    {[0, 90, 180, 270].map((n) => (
                      <label key={n}>
                        <input
                          type="radio"
                          name="rotation"
                          checked={rotation === n}
                          onChange={() => {
                            setRotation(n);
                            changed();
                          }}
                        />
                        <span>{n}°</span>
                      </label>
                    ))}
                  </fieldset>
                  <label className="utility-check">
                    <input
                      type="checkbox"
                      checked={flipX}
                      onChange={(e) => {
                        setFlipX(e.target.checked);
                        changed();
                      }}
                    />
                    Flip horizontally
                  </label>
                  <label className="utility-check">
                    <input
                      type="checkbox"
                      checked={flipY}
                      onChange={(e) => {
                        setFlipY(e.target.checked);
                        changed();
                      }}
                    />
                    Flip vertically
                  </label>
                </>
              )}
              {tool === "palette" ? (
                <label className="utility-tolerance">
                  Number of colors <output>{colors}</output>
                  <input
                    type="range"
                    min="2"
                    max="12"
                    value={colors}
                    onChange={(e) => {
                      setColors(Number(e.target.value));
                      changed();
                    }}
                  />
                </label>
              ) : (
                <>
                  <fieldset className="utility-formats">
                    <legend>File format</legend>
                    {formats.map((f) => (
                      <label key={f}>
                        <input
                          type="radio"
                          name="format"
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
                  {["jpeg", "webp"].includes(format) && (
                    <label className="utility-tolerance">
                      Quality <output>{quality}%</output>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={quality}
                        onChange={(e) => {
                          setQuality(Number(e.target.value));
                          changed();
                        }}
                      />
                    </label>
                  )}
                  {["jpeg", "bmp"].includes(format) && (
                    <label className="utility-color">
                      Background
                      <input
                        type="color"
                        value={matte}
                        onChange={(e) => {
                          setMatte(e.target.value);
                          changed();
                        }}
                      />
                      <code>{matte}</code>
                    </label>
                  )}
                </>
              )}
              <Button variant="primary" className="utility-button rk-primary" type="submit">
                {busy === "processing" ? "Processing…" : spec.verb}
                <CreativeIcon name="arrow" size={17} />
              </Button>
            </fieldset>
          </form>
        )}
        {busy && (
          <Button type="button" className="utility-cancel" onClick={cancel}>
            Cancel {busy === "reading" ? "reading" : "processing"}
          </Button>
        )}
        {error && (
          <p
            id="utility-error"
            className="utility-error"
            ref={errorBox}
            tabIndex={-1}
            role="alert"
          >
            {error}
          </p>
        )}
        <p className="utility-status" role="status">
          {status}
        </p>
        <p className="utility-note">{spec.note}</p>
        {oversized && !["resize", "crop", "palette"].includes(tool) && (
          <p className="utility-note">Choose Image resizer in the tool list first.</p>
        )}
        {source && !busy && (
          <Button
            type="button"
            className="utility-cancel"
            onClick={() => {
              setSource(null);
              setResult(null);
              setPalette([]);
              setError("");
              setStatus("Image removed. Choose another to begin.");
              picker.current?.focus();
            }}
          >
            Remove image
          </Button>
        )}
      </div>
      {tool === "transparent" && source && !oversized ? (
        <BackgroundEditor
          key={source.url}
          file={source.file}
          width={source.width}
          height={source.height}
        />
      ) : (
        <div className="utility-preview" aria-busy={Boolean(busy)}>
          <div className="utility-preview-heading">
            <span>
              {result
                ? "YOUR RESULT"
                : source
                  ? "YOUR ORIGINAL"
                  : "READY WHEN YOU ARE"}
            </span>
            <CreativeIcon name="local" size={18} />
          </div>
          <div className="utility-preview-image">
            {source ? (
              <div className="utility-image-holder">
                <img
                  src={result && tool !== "palette" ? result.url : source.url}
                  alt={
                    result
                      ? "Processed image preview"
                      : "Original image preview"
                  }
                />
                {tool === "crop" && !result && (
                  <div
                    className="utility-crop-indicator"
                    style={{
                      left: `${(Number(x) / source.width) * 100}%`,
                      top: `${(Number(y) / source.height) * 100}%`,
                      width: `${(Number(width) / source.width) * 100}%`,
                      height: `${(Number(height) / source.height) * 100}%`,
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="utility-empty-art">
                <CreativeIcon name={spec.icon} size={64} />
                <span>Your original always stays yours.</span>
              </div>
            )}
          </div>
          {palette.length > 0 && (
            <div className="utility-palette-results">
              {palette.map((p) => (
                <Button
                  type="button"
                  key={p.hex}
                  aria-label={`Copy ${p.hex}`}
                  onClick={async () => {
                    const revision = serial.current;
                    try {
                      await navigator.clipboard.writeText(p.hex);
                      if (revision !== serial.current) return;
                      setStatus(`Copied ${p.hex}.`);
                    } catch {
                      if (revision !== serial.current) return;
                      setStatus(`Copy this value: ${p.hex}`);
                    }
                  }}
                >
                  <i style={{ background: p.hex }} />
                  <code>{p.hex}</code>
                </Button>
              ))}
            </div>
          )}
          <div className="utility-preview-footer">
            <span>
              {result && tool !== "palette"
                ? `${result.width} × ${result.height} px · ${bytes(result.size)} (original ${bytes(source!.file.size)})`
                : source
                  ? `${source.width} × ${source.height} px · ${bytes(source.file.size)}`
                  : "Processed on your device. No upload."}
            </span>
            {result && (
              <DownloadButton variant="primary" className="utility-button rk-primary"
                href={result.url}
                download={result.name}
              >
                {tool === "palette" ? "Download CSS" : "Download image"}
                <CreativeIcon name="arrow" size={16} />
              </DownloadButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
