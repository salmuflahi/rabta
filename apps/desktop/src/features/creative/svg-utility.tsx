import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DownloadButton } from "./ui";
import { useEffect, useRef, useState } from "react";
import { svgToCode } from "./svg-code";
const sample =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" stroke="#bad0bd" stroke-width="2.2" stroke-linecap="round"><path d="M8 36C23 36 21 12 40 12"/><path d="M8 36V12h12M40 12v24H28"/></svg>';
export function SvgUtility() {
  const [source, setSource] = useState(sample),
    [name, setName] = useState("RabtaGraphic"),
    [mono, setMono] = useState(false),
    [result, setResult] = useState<{
      xml: string;
      code: string;
      removed: number;
      preview: string;
      download: string;
      svgDownload: string;
    } | null>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Paste your SVG or open a file."),
    [reading, setReading] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null),
    serial = useRef(0);
  useEffect(
    () => () => {
      serial.current++;
    },
    [],
  );
  useEffect(
    () => () => {
      if (result) {
        URL.revokeObjectURL(result.preview);
        URL.revokeObjectURL(result.download);
        URL.revokeObjectURL(result.svgDownload);
      }
    },
    [result],
  );
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  function change() {
    serial.current++;
    setResult(null);
    setError("");
    setStatus("Generate code to update the preview.");
  }
  function generate() {
    serial.current++;
    try {
      const r = svgToCode(source, name, mono);
      setResult({
        ...r,
        preview: URL.createObjectURL(
          new Blob([r.xml], { type: "image/svg+xml" }),
        ),
        download: URL.createObjectURL(
          new Blob([r.code], { type: "text/plain" }),
        ),
        svgDownload: URL.createObjectURL(
          new Blob([r.xml], { type: "image/svg+xml" }),
        ),
      });
      setError("");
      setStatus(
        r.removed
          ? `Code ready. Removed ${r.removed} unsupported elements or attributes. Check the preview against your original.`
          : "Code ready. Preview it before adding it to your project.",
      );
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Could not read the SVG.");
    }
  }
  return (
    <div className="svg-workspace">
      <form
        className="svg-source"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          generate();
        }}
      >
        <label>
          Open SVG · up to 1 MB
          <Input
            type="file"
            accept=".svg,image/svg+xml"
            disabled={reading}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (!f.size || f.size > 1048576) {
                setError("Choose one SVG up to 1 MB.");
                return;
              }
              const id = ++serial.current;
              setReading(true);
              try {
                const text = await f.text();
                if (id !== serial.current) return;
                setSource(text);
                setResult(null);
                setError("");
                setStatus("Generate code to update the preview.");
              } catch {
                if (id === serial.current)
                  setError("Could not read that file. Paste the SVG instead.");
              } finally {
                if (id === serial.current) setReading(false);
              }
            }}
          />
        </label>
        <label htmlFor="svg-source">
          SVG markup
          <Textarea
            className="resize-none"
            disabled={reading}
            id="svg-source"
            spellCheck={false}
            rows={12}
            maxLength={1048576}
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              change();
            }}
          />
        </label>
        <label htmlFor="svg-name">
          Component name
          <Input
            disabled={reading}
            id="svg-name"
            required
            maxLength={50}
            value={name}
            aria-invalid={error.startsWith("Use a component") || undefined}
            aria-describedby={error ? "svg-error" : undefined}
            onChange={(e) => {
              setName(e.target.value);
              change();
            }}
          />
        </label>
        <label className="utility-check">
          <input
            type="checkbox"
            disabled={reading}
            checked={mono}
            onChange={(e) => {
              setMono(e.target.checked);
              change();
            }}
          />
          Use currentColor for solid fills and strokes
        </label>
        <Button
          type="submit"
          variant="primary" className="utility-button rk-primary"
          disabled={reading || !source.trim()}
        >
          Generate code
        </Button>
        {error && (
          <p
            id="svg-error"
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="utility-error"
          >
            {error}
          </p>
        )}
        <p className="utility-status" role="status">
          {reading ? "Reading SVG…" : status}
        </p>
      </form>
      <div className="svg-result">
        <div className="svg-preview">
          {result ? (
            <img
              src={result.preview}
              width={260}
              height={260}
              alt="Sanitized SVG preview"
            />
          ) : (
            <span>Your graphic will appear here.</span>
          )}
        </div>
        {result && (
          <>
            <div className="mask-actions">
              <DownloadButton href={result.download}
                download={`${name}.tsx`}
                variant="primary" className="utility-button rk-primary"
              >
                Download React
              </DownloadButton>
              <DownloadButton href={result.svgDownload}
                download={`${name}.svg`}
                className="utility-button"
              >
                Download SVG
              </DownloadButton>
              <Button
                type="button"
                className="utility-button"
                onClick={async () => {
                  const id = serial.current;
                  try {
                    await navigator.clipboard.writeText(result.code);
                    if (id !== serial.current) return;
                    setStatus("React code copied.");
                  } catch {
                    if (id !== serial.current) return;
                    setStatus(
                      "Clipboard unavailable. Select the code below or download it.",
                    );
                  }
                }}
              >
                Copy code
              </Button>
            </div>
            <pre tabIndex={0} aria-label="Generated React component">
              {result.code}
            </pre>
          </>
        )}
        <p className="utility-note">
          Static vectors only. Scripts, external images, stylesheets and
          embedded HTML are removed. Inline style attributes are removed too;
          move required styling into SVG attributes before importing.
          currentColor previews as black in the isolated image.
        </p>
      </div>
    </div>
  );
}
