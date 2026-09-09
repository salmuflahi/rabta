import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DownloadButton } from "./ui";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  brushStamp,
  readAlpha,
  writeAlpha,
  removeColorInRegion,
  type Region,
} from "./mask-core";
import {
  removeEdgeBackground,
  exportName,
} from "./image-core.js";

export function BackgroundEditor({
  file,
  width,
  height,
}: {
  file: File;
  width: number;
  height: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    pixels = useRef<ImageData | null>(null),
    original = useRef<ImageData | null>(null),
    history = useRef<Uint8Array[]>([]),
    drawing = useRef<{
      x: number;
      y: number;
      startX: number;
      startY: number;
    } | null>(null);
  const [ready, setReady] = useState(false),
    [mode, setMode] = useState<"erase" | "restore" | "select">("erase"),
    [size, setSize] = useState(60),
    [softness, setSoftness] = useState(35),
    [color, setColor] = useState("#ffffff"),
    [tolerance, setTolerance] = useState(12),
    [region, setRegion] = useState<Region>({ x: 0, y: 0, width, height }),
    [scope, setScope] = useState<"edges" | "region">("edges"),
    [undoCount, setUndoCount] = useState(0),
    [status, setStatus] = useState("Preparing your canvas…"),
    [error, setError] = useState(""),
    [compare, setCompare] = useState(false),
    [exporting, setExporting] = useState(false),
    [result, setResult] = useState<{ url: string; name: string } | null>(null),
    [cursor, setCursor] = useState({
      x: Math.floor(width / 2),
      y: Math.floor(height / 2),
    });
  const revision = useRef(0),
    mounted = useRef(true),
    errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const bmp = await createImageBitmap(file);
        if (cancelled) {
          bmp.close();
          return;
        }
        const ctx = canvas.current?.getContext("2d", {
          willReadFrequently: true,
        });
        if (!ctx) {
          bmp.close();
          throw Error("The image editor could not open.");
        }
        ctx.drawImage(bmp, 0, 0);
        bmp.close();
        original.current = ctx.getImageData(0, 0, width, height);
        pixels.current = ctx.getImageData(0, 0, width, height);
        setReady(true);
        setStatus(
          "Erase, restore, or select an area. Your original stays unchanged.",
        );
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Could not open this image.",
          );
      }
    })();
    return () => {
      cancelled = true;
      mounted.current = false;
      revision.current++;
      original.current = null;
      pixels.current = null;
      history.current = [];
    };
  }, [file, width, height]);
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  function repaint() {
    const ctx = canvas.current?.getContext("2d");
    if (ctx && pixels.current) ctx.putImageData(pixels.current, 0, 0);
  }
  function changed() {
    revision.current++;
    setResult(null);
    setError("");
  }
  function remember() {
    if (!pixels.current) return;
    const cap = Math.max(
      2,
      Math.min(10, Math.floor((48 * 1024 * 1024) / (width * height))),
    );
    history.current.push(readAlpha(pixels.current.data));
    if (history.current.length > cap) history.current.shift();
    setUndoCount(history.current.length);
    changed();
  }
  function stamp(x: number, y: number) {
    if (!pixels.current || !original.current) return;
    const dirty = brushStamp(
      pixels.current.data,
      original.current.data,
      width,
      height,
      x,
      y,
      size / 2,
      softness / 100,
      mode === "restore",
    );
    canvas.current
      ?.getContext("2d")
      ?.putImageData(
        pixels.current,
        0,
        0,
        dirty.x,
        dirty.y,
        dirty.width,
        dirty.height,
      );
  }
  function point(e: PointerEvent<HTMLCanvasElement>) {
    const b = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(width - 1, ((e.clientX - b.left) * width) / b.width),
      ),
      y: Math.max(
        0,
        Math.min(height - 1, ((e.clientY - b.top) * height) / b.height),
      ),
    };
  }
  function down(e: PointerEvent<HTMLCanvasElement>) {
    if (!ready || compare || exporting || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    drawing.current = { ...p, startX: p.x, startY: p.y };
    setCursor({ x: Math.round(p.x), y: Math.round(p.y) });
    if (mode === "select") {
      setScope("region");
      setRegion({
        x: Math.floor(p.x),
        y: Math.floor(p.y),
        width: 1,
        height: 1,
      });
    } else {
      remember();
      stamp(p.x, p.y);
    }
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const p = point(e),
      last = drawing.current;
    setCursor({ x: Math.round(p.x), y: Math.round(p.y) });
    if (mode === "select") {
      const x = Math.floor(Math.min(p.x, last.startX)),
        y = Math.floor(Math.min(p.y, last.startY));
      setRegion({
        x,
        y,
        width: Math.max(1, Math.ceil(Math.abs(p.x - last.startX))),
        height: Math.max(1, Math.ceil(Math.abs(p.y - last.startY))),
      });
    } else {
      const steps = Math.max(
        1,
        Math.ceil(
          Math.hypot(p.x - last.x, p.y - last.y) / Math.max(1, size / 8),
        ),
      );
      for (let i = 1; i <= steps; i++)
        stamp(
          last.x + ((p.x - last.x) * i) / steps,
          last.y + ((p.y - last.y) * i) / steps,
        );
    }
    drawing.current = { ...last, ...p };
  }
  function end() {
    if (drawing.current) {
      drawing.current = null;
      setStatus(
        mode === "select"
          ? "Area selected. Remove matching color within these bounds."
          : `${mode === "restore" ? "Restored" : "Erased"} the brushed area. Undo is available.`,
      );
    }
  }
  function undo() {
    const a = history.current.pop();
    if (a && pixels.current) {
      writeAlpha(pixels.current.data, a);
      repaint();
      changed();
      setUndoCount(history.current.length);
      setStatus("Last edit undone.");
    }
  }
  function remove() {
    if (!pixels.current) return;
    try {
      if (
        scope === "region" &&
        (![region.x, region.y, region.width, region.height].every(
          Number.isInteger,
        ) ||
          region.x < 0 ||
          region.y < 0 ||
          region.width < 1 ||
          region.height < 1 ||
          region.x + region.width > width ||
          region.y + region.height > height)
      )
        throw Error(
          "Keep the selected area inside the image, using whole pixels.",
        );
      remember();
      const n =
        scope === "edges"
          ? removeEdgeBackground(
              pixels.current.data,
              width,
              height,
              color,
              tolerance,
            )
          : removeColorInRegion(
              pixels.current.data,
              width,
              height,
              color,
              tolerance,
              region,
            );
      repaint();
      setStatus(
        n
          ? `Removed matching color from ${n.toLocaleString()} pixels. Refine with the brushes.`
          : "No matching pixels found. Adjust the color or tolerance.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove this color.");
    }
  }
  async function exportImage() {
    if (!canvas.current || !pixels.current) return;
    setExporting(true);
    setError("");
    const id = revision.current;
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.current!.toBlob(
          (b) =>
            b
              ? resolve(b)
              : reject(Error("Could not export this image. Try again.")),
          "image/png",
        ),
      );
      if (!mounted.current || id !== revision.current) return;
      setResult({
        url: URL.createObjectURL(blob),
        name: exportName(file.name, "edited", "png"),
      });
      setStatus("Your full-resolution transparent PNG is ready.");
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      if (mounted.current) setExporting(false);
    }
  }
  return (
    <div className="background-editor">
      <div
        className="mask-toolbar"
        role="group"
        aria-label="Background editing tools"
      >
        {(["erase", "restore", "select"] as const).map((m) => (
          <Button
            key={m}
            type="button"
            className="utility-button"
            aria-pressed={mode === m}
            disabled={!ready || compare || exporting}
            onClick={() => {
              setMode(m);
              setError("");
            }}
          >
            {m === "erase"
              ? "Erase"
              : m === "restore"
                ? "Restore"
                : "Select area"}
          </Button>
        ))}
        <Button
          type="button"
          className="utility-button"
          disabled={!undoCount || compare || exporting}
          onClick={undo}
        >
          Undo ({undoCount})
        </Button>
        <Button
          type="button"
          className="utility-button"
          aria-pressed={compare}
          disabled={!ready || exporting}
          onClick={() => {
            const ctx = canvas.current?.getContext("2d");
            if (ctx && original.current && pixels.current)
              ctx.putImageData(
                compare ? pixels.current : original.current,
                0,
                0,
              );
            setCompare(!compare);
          }}
        >
          {compare ? "Show edits" : "Show original"}
        </Button>
      </div>
      <div className="mask-canvas-viewport">
        <div
          className="mask-canvas-wrap"
          style={{ aspectRatio: `${width}/${height}` }}
        >
          <canvas
            ref={canvas}
            width={width}
            height={height}
            tabIndex={0}
            role="img"
            aria-label="Editable image. Arrow keys move the brush; Shift moves faster. Space stamps the brush. Use numeric fields to select an area."
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onLostPointerCapture={end}
            onKeyDown={(e) => {
              if (!ready || compare || exporting) return;
              const n = e.shiftKey ? 20 : 1;
              if (
                ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  e.key,
                )
              ) {
                e.preventDefault();
                setCursor((p) => ({
                  x: Math.max(
                    0,
                    Math.min(
                      width - 1,
                      p.x +
                        (e.key === "ArrowRight"
                          ? n
                          : e.key === "ArrowLeft"
                            ? -n
                            : 0),
                    ),
                  ),
                  y: Math.max(
                    0,
                    Math.min(
                      height - 1,
                      p.y +
                        (e.key === "ArrowDown"
                          ? n
                          : e.key === "ArrowUp"
                            ? -n
                            : 0),
                    ),
                  ),
                }));
              }
              if (e.key === " " && mode !== "select") {
                e.preventDefault();
                remember();
                stamp(cursor.x, cursor.y);
                setStatus("Brush applied at the keyboard cursor.");
              }
            }}
          />
          {ready && !compare && (
            <>
              {scope === "region" && (
                <div
                  className="mask-region"
                  style={{
                    left: `${(region.x / width) * 100}%`,
                    top: `${(region.y / height) * 100}%`,
                    width: `${(region.width / width) * 100}%`,
                    height: `${(region.height / height) * 100}%`,
                  }}
                />
              )}
              {mode !== "select" && (
                <div
                  className="mask-brush-cursor"
                  style={{
                    left: `${(cursor.x / width) * 100}%`,
                    top: `${(cursor.y / height) * 100}%`,
                    width: `${(size / width) * 100}%`,
                    aspectRatio: "1",
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
      <fieldset
        className="mask-settings"
        disabled={!ready || compare || exporting}
      >
        <legend>Refine your selection</legend>
        <div className="mask-brush-settings">
          <label>
            Brush size · {size} px
            <input
              type="range"
              min="2"
              max="1000"
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            />
          </label>
          <label>
            Soft edge · {softness}%
            <input
              type="range"
              min="0"
              max="100"
              value={softness}
              onChange={(e) => setSoftness(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="mask-color-settings">
          <label>
            Remove color
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <label>
            Tolerance · {tolerance}%
            <input
              type="range"
              min="0"
              max="100"
              value={tolerance}
              onChange={(e) => setTolerance(Number(e.target.value))}
            />
          </label>
        </div>
        <fieldset className="mask-scope">
          <legend>Where to remove</legend>
          <label>
            <input
              type="radio"
              checked={scope === "edges"}
              name="mask-scope"
              onChange={() => setScope("edges")}
            />
            Connected outer background
          </label>
          <label>
            <input
              type="radio"
              checked={scope === "region"}
              name="mask-scope"
              onChange={() => setScope("region")}
            />
            Matching color in selected area
          </label>
        </fieldset>
        {scope === "region" && (
          <div className="mask-region-fields">
            {(["x", "y", "width", "height"] as const).map((k) => (
              <label key={k}>
                {k} · px
                <Input
                  type="number"
                  min={k === "x" || k === "y" ? 0 : 1}
                  max={k === "x" || k === "width" ? width : height}
                  step="1"
                  value={region[k]}
                  onChange={(e) =>
                    setRegion((r) => ({ ...r, [k]: Number(e.target.value) }))
                  }
                />
              </label>
            ))}
          </div>
        )}
        <div className="mask-actions">
          <Button type="button" className="utility-button" onClick={remove}>
            Remove matching color
          </Button>
          <Button
            type="button"
            className="utility-button"
            onClick={() => {
              if (!original.current || !pixels.current) return;
              remember();
              pixels.current.data.set(original.current.data);
              repaint();
              setStatus("Returned to the original. You can undo this reset.");
            }}
          >
            Reset edits
          </Button>
          <Button
            type="button"
            variant="primary" className="utility-button rk-primary"
            onClick={exportImage}
          >
            Prepare PNG
          </Button>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="utility-error" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      )}
      <p role="status" className="utility-status">
        {exporting ? "Preparing full-resolution PNG…" : status}
      </p>
      {result && (
        <DownloadButton variant="primary" className="utility-button rk-primary"
          href={result.url}
          download={result.name}
        >
          Download PNG · {width} × {height}
        </DownloadButton>
      )}
      <p className="utility-note">
        Arrow keys move the brush; Shift moves 20 pixels; Space applies it. The
        outline shows the current brush. Selected-area removal affects all
        matching colors inside the rectangle. Edits stay here until you leave or
        choose another file.
      </p>
    </div>
  );
}
