"use client";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from "react";
import { TOOLS, type ToolId } from "./catalog";
import { ToolIcon } from "./ToolIcon";
import {
  calculate,
  cleanLinks,
  colorValues,
  contrast,
  convertUnit,
  csvToJson,
  ENCODINGS,
  encodeText,
  formatJson,
  jsonToCsv,
  randomPassword,
  renamedFiles,
  sha256,
  TEXT_ACTIONS,
  TEXT_LIMIT,
  transformText,
  UNITS,
  zipFiles,
} from "./core";

export type SelectProps = {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
};
export type UtilityUI = {
  Button: ComponentType<ButtonHTMLAttributes<HTMLButtonElement>>;
  Input: ComponentType<InputHTMLAttributes<HTMLInputElement>>;
  Textarea: ComponentType<TextareaHTMLAttributes<HTMLTextAreaElement>>;
  Select: ComponentType<SelectProps>;
};
const UIContext = createContext<UtilityUI | null>(null);
function useUI() {
  const ui = useContext(UIContext);
  if (!ui) throw new Error("Utility UI adapter is missing");
  return ui;
}
function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const MemoryContext = createContext<Map<string, string> | null>(null);
function useDraft(key: string, initial = "") {
  const memory = useContext(MemoryContext)!;
  const [value, rawSet] = useState(() => memory.get(key) ?? initial);
  return [
    value,
    (next: string) => {
      memory.set(key, next);
      rawSet(next);
    },
  ] as const;
}
function SelectField(props: Omit<SelectProps, "id">) {
  const { Select } = useUI(),
    id = useId();
  return (
    <div className="rk-field">
      <label htmlFor={id}>{props.label}</label>
      <Select {...props} id={id} />
    </div>
  );
}
function InputField({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { Input } = useUI(),
    id = useId();
  return (
    <div className="rk-field">
      <label htmlFor={id}>{label}</label>
      <Input {...props} id={id} />
    </div>
  );
}
function TextField({
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const { Textarea } = useUI(),
    id = useId();
  return (
    <div className="rk-field">
      <label htmlFor={id}>{label}</label>
      <Textarea
        {...props}
        id={id}
        className={"rk-textarea resize-none " + (props.className ?? "")}
        maxLength={props.maxLength ?? TEXT_LIMIT}
      />
    </div>
  );
}
function Status({ error, children }: { error?: boolean; children: ReactNode }) {
  return (
    <p
      className={`rk-status ${error ? "rk-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </p>
  );
}
function Output({
  value,
  filename = "rabta-result.txt",
  secret = false,
}: {
  value: string;
  filename?: string;
  secret?: boolean;
}) {
  const { Button, Input } = useUI(),
    [copied, setCopied] = useState(""),
    [show, setShow] = useState(false);
  useEffect(() => {
    setCopied("");
    setShow(false);
  }, [value]);
  return (
    <div className="rk-output">
      <div className="rk-output-top">
        <span>Result</span>
        <div className="rk-inline">
          <Button
            type="button"
            disabled={!value}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value);
                setCopied("Copied.");
              } catch {
                setCopied(
                  "Clipboard unavailable. Select the result and copy it manually.",
                );
              }
            }}
          >
            Copy
          </Button>
          {!secret && (
            <Button
              type="button"
              disabled={!value}
              onClick={() =>
                download(
                  new Blob([value], { type: "text/plain;charset=utf-8" }),
                  filename,
                )
              }
            >
              Download
            </Button>
          )}
        </div>
      </div>
      {secret ? (
        <div className="rk-inline">
          <Input
            aria-label="Generated password"
            type={show ? "text" : "password"}
            value={value}
            readOnly
            autoComplete="off"
          />
          <Button
            type="button"
            aria-pressed={show}
            onClick={() => setShow(!show)}
          >
            {show ? "Hide" : "Show"}
          </Button>
        </div>
      ) : (
        <pre tabIndex={0} aria-label="Result">
          {value || "Your result will appear here."}
        </pre>
      )}
      <Status>{copied}</Status>
    </div>
  );
}
function Transformer({ id }: { id: ToolId }) {
  const { Button } = useUI(),
    [input, setInput] = useDraft(id),
    [extra, setExtra] = useState(""),
    [action, setAction] = useState(
      id === "text"
        ? TEXT_ACTIONS[0]
        : id === "encode"
          ? ENCODINGS[0]
          : id === "csv"
            ? "CSV to JSON"
            : "Format",
    ),
    [output, setOutput] = useDraft(id + "-result"),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  const run = () => {
    try {
      if (!input.trim()) throw new Error("Add some text first.");
      let next = "";
      if (id === "clean-links") {
        const result = cleanLinks(input, extra);
        next = result.text;
        setNote(
          `${result.removed} tracking parameter${result.removed === 1 ? "" : "s"} removed. Other parameters and fragments are kept.`,
        );
      } else if (id === "text") next = transformText(input, action);
      else if (id === "json") next = formatJson(input, action === "Compact");
      else if (id === "csv")
        next = action === "CSV to JSON" ? csvToJson(input) : jsonToCsv(input);
      else next = encodeText(input, action);
      setOutput(next);
      setError("");
    } catch (e) {
      setError(message(e));
      setOutput("");
      setNote("");
    }
  };
  return (
    <>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        {id !== "clean-links" && (
          <SelectField
            label="Operation"
            value={action}
            onChange={setAction}
            options={
              id === "text"
                ? TEXT_ACTIONS
                : id === "encode"
                  ? ENCODINGS
                  : id === "csv"
                    ? ["CSV to JSON", "JSON to CSV"]
                    : ["Format", "Compact"]
            }
          />
        )}
        <TextField
          label={id === "clean-links" ? "Links · one per line" : "Source"}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError("");
            setOutput("");
          }}
          placeholder={
            id === "clean-links"
              ? "https://example.com/article?utm_source=newsletter"
              : id === "json"
                ? "Paste JSON here…"
                : "Paste or type here…"
          }
          aria-invalid={!!error}
          aria-describedby={`${id}-error`}
          rows={8}
        />
        {id === "clean-links" && (
          <InputField
            label="Also remove these parameters (comma separated)"
            value={extra}
            onChange={(e) => {
              setExtra(e.target.value);
              setOutput("");
            }}
            placeholder="custom_tracking_id"
          />
        )}
        <div className="rk-actions">
          <Button type="submit" className="rk-primary">
            {id === "clean-links"
              ? "Clean links"
              : id === "json"
                ? "Format JSON"
                : id === "text"
                  ? "Transform text"
                  : "Convert"}
          </Button>
          <span className="rk-meta">
            {input.length.toLocaleString("en-US")} characters
            {id === "text"
              ? ` · ${input.trim() ? input.trim().split(/\s+/).length.toLocaleString("en-US") : 0} words`
              : ""}
          </span>
        </div>
        <p id={`${id}-error`} role="alert" className="rk-status rk-error">
          {error}
        </p>
      </form>
      <Output
        value={output}
        filename={
          id === "json" || (id === "csv" && action === "CSV to JSON")
            ? "rabta-result.json"
            : id === "csv"
              ? "rabta-result.csv"
              : "rabta-result.txt"
        }
      />
      {note && <p className="rk-note">{note}</p>}
      {id === "csv" && (
        <p className="rk-note">
          CSV imports keep cell values as text. Export adds an apostrophe to
          formula-like cells for safer spreadsheet use.
        </p>
      )}
    </>
  );
}
function Calculator() {
  const { Button } = useUI(),
    [input, setInput] = useDraft("calculator"),
    [output, setOutput] = useDraft("calculator-result"),
    [error, setError] = useState("");
  return (
    <>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          try {
            setOutput(String(calculate(input)));
            setError("");
          } catch (e) {
            setError(message(e));
            setOutput("");
          }
        }}
      >
        <InputField
          label="Expression"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOutput("");
            setError("");
          }}
          placeholder="(125 + 75) × 0.8"
          maxLength={500}
          aria-invalid={!!error}
          aria-describedby="calculator-error"
        />
        <div className="rk-actions">
          <Button type="submit" className="rk-primary">
            Calculate
          </Button>
          <span className="rk-meta">% divides a value by 100</span>
        </div>
        <p id="calculator-error" role="alert" className="rk-status rk-error">
          {error}
        </p>
      </form>
      <Output value={output} />
    </>
  );
}
function UnitConverter() {
  const [category, setCategory] = useState("Length"),
    [from, setFrom] = useState("Centimeters"),
    [to, setTo] = useState("Inches"),
    [value, setValue] = useDraft("units", "100");
  let result = "",
    error = "";
  try {
    if (value.trim()) {
      result =
        String(
          Number(
            convertUnit(Number(value), category, from, to).toPrecision(12),
          ),
        ) +
        " " +
        to;
    }
  } catch (e) {
    error = message(e);
  }
  return (
    <>
      <SelectField
        label="Measurement"
        value={category}
        options={Object.keys(UNITS)}
        onChange={(v) => {
          setCategory(v);
          setFrom(Object.keys(UNITS[v])[0]);
          setTo(Object.keys(UNITS[v])[1]);
        }}
      />
      <InputField
        label="Value"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={!!error}
        aria-describedby="unit-error"
      />
      <div className="rk-columns">
        <SelectField
          label="From"
          value={from}
          onChange={setFrom}
          options={Object.keys(UNITS[category])}
        />
        <SelectField
          label="To"
          value={to}
          onChange={setTo}
          options={Object.keys(UNITS[category])}
        />
      </div>
      <p id="unit-error" role="alert" className="rk-status rk-error">
        {error}
      </p>
      <Output value={result} />
      {category === "Data" && (
        <p className="rk-note">
          KB, MB and GB use 1000. KiB, MiB and GiB use 1024.
        </p>
      )}
    </>
  );
}
function Checksum() {
  const { Button, Input } = useUI(),
    [text, setText] = useDraft("hash"),
    [file, setFile] = useState<File | null>(null),
    [expected, setExpected] = useState(""),
    [result, setResult] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const invalidate = () => {
    generation.current++;
    setResult("");
    setError("");
    setBusy(false);
  };
  return (
    <>
      <TextField
        label="Text"
        value={text}
        onChange={(e) => {
          invalidate();
          setText(e.target.value);
          setFile(null);
        }}
        rows={5}
      />
      <div className="rk-field">
        <label htmlFor="checksum-file">Or choose a file · up to 50 MB</label>
        <Input
          id="checksum-file"
          type="file"
          onChange={(e) => {
            invalidate();
            const f = e.target.files?.[0];
            if (f && f.size > 50 * 1024 * 1024) {
              setError("Choose a file under 50 MB.");
              setFile(null);
              e.target.value = "";
              return;
            }
            setFile(f ?? null);
          }}
        />
      </div>
      {file && (
        <p className="rk-note">
          Hashing file: {file.name}{" "}
          <Button
            type="button"
            onClick={() => {
              invalidate();
              setFile(null);
            }}
          >
            Use text instead
          </Button>
        </p>
      )}
      <InputField
        label="Expected SHA-256 (optional)"
        value={expected}
        onChange={(e) => setExpected(e.target.value)}
        placeholder="Paste a 64-character checksum"
        maxLength={64}
      />
      <div className="rk-actions">
        <Button
          type="button"
          disabled={busy || (!file && !text)}
          className="rk-primary"
          onClick={async () => {
            const job = ++generation.current;
            setBusy(true);
            setError("");
            setResult("");
            try {
              const value = await sha256(
                file ? await file.arrayBuffer() : text,
              );
              if (job === generation.current) setResult(value);
            } catch (e) {
              if (job === generation.current) setError(message(e));
            } finally {
              if (job === generation.current) setBusy(false);
            }
          }}
        >
          {busy ? "Calculating…" : "Calculate checksum"}
        </Button>
      </div>
      <Status error={!!error}>
        {error ||
          (result && expected.trim()
            ? /^[a-f\d]{64}$/i.test(expected.trim())
              ? result === expected.trim().toLowerCase()
                ? "Checksums match."
                : "Checksums do not match."
              : "Expected checksum must contain 64 hexadecimal characters."
            : "")}
      </Status>
      <Output value={result} />
    </>
  );
}
function Generator() {
  const { Button } = useUI(),
    [kind, setKind] = useState("Password"),
    [length, setLength] = useState("24"),
    [symbols, setSymbols] = useState(true),
    [value, setValue] = useState(""),
    [error, setError] = useState("");
  return (
    <>
      <SelectField
        label="Generate"
        value={kind}
        onChange={(v) => {
          setKind(v);
          setValue("");
        }}
        options={["Password", "UUID v4"]}
      />
      {kind === "Password" && (
        <>
          <InputField
            label="Length · 12–128 characters"
            type="number"
            min={12}
            max={128}
            value={length}
            onChange={(e) => {
              setLength(e.target.value);
              setValue("");
            }}
          />
          <label className="rk-check">
            <input
              type="checkbox"
              checked={symbols}
              onChange={(e) => {
                setSymbols(e.target.checked);
                setValue("");
              }}
            />
            Include symbols
          </label>
        </>
      )}
      <div className="rk-actions">
        <Button
          type="button"
          className="rk-primary"
          onClick={() => {
            try {
              setValue(
                kind === "Password"
                  ? randomPassword(Number(length), symbols)
                  : crypto.randomUUID(),
              );
              setError("");
            } catch (e) {
              setError(message(e));
            }
          }}
        >
          Generate {kind === "Password" ? "password" : "UUID"}
        </Button>
      </div>
      <Status error>{error}</Status>
      <Output value={value} secret={kind === "Password"} />
      <p className="rk-note">
        Generated with your device’s cryptographic random source. Never saved by
        Rabta. Copying places the value on your system clipboard.
      </p>
    </>
  );
}
function ColorLab() {
  const { Button } = useUI(),
    [fg, setFg] = useDraft("color-fg", "#BAD0BD"),
    [bg, setBg] = useDraft("color-bg", "#0B0E0C"),
    [pickError, setPickError] = useState("");
  let values: ReturnType<typeof colorValues> | null = null,
    ratio = 0,
    error = "";
  try {
    values = colorValues(fg);
    colorValues(bg);
    ratio = contrast(fg, bg);
  } catch (e) {
    error = message(e);
  }
  return (
    <>
      <div className="rk-columns">
        <InputField
          label="Text color"
          value={fg}
          maxLength={7}
          onChange={(e) => setFg(e.target.value)}
          aria-invalid={!!error}
        />
        <InputField
          label="Background"
          value={bg}
          maxLength={7}
          onChange={(e) => setBg(e.target.value)}
          aria-invalid={!!error}
        />
      </div>
      <div className="rk-actions">
        <Button
          type="button"
          onClick={() => {
            setFg(bg);
            setBg(fg);
          }}
        >
          Swap colors
        </Button>
        <Button
          type="button"
          onClick={async () => {
            const Eye = (
              window as unknown as {
                EyeDropper?: new () => {
                  open: () => Promise<{ sRGBHex: string }>;
                };
              }
            ).EyeDropper;
            if (!Eye) {
              setPickError(
                "Screen color picking is unavailable in this browser. Enter a hex color above.",
              );
              return;
            }
            try {
              setFg((await new Eye().open()).sRGBHex);
              setPickError("");
            } catch (e) {
              if (!(e instanceof DOMException && e.name === "AbortError"))
                setPickError(message(e));
            }
          }}
        >
          Pick from screen
        </Button>
      </div>
      <Status error>{error || pickError}</Status>
      {values && !error && (
        <>
          <div
            className="rk-color-preview"
            style={{ color: values.hex, backgroundColor: colorValues(bg).hex }}
          >
            <span>Aa</span>
            <p>The details make the difference.</p>
          </div>
          <div className="rk-contrast">
            <strong>{ratio.toFixed(2)}:1</strong>
            <div>
              <p>
                {ratio >= 4.5
                  ? "AA normal text: passes"
                  : "AA normal text: fails"}
              </p>
              <p>
                {ratio >= 7
                  ? "AAA normal text: passes"
                  : "AAA normal text: fails"}
              </p>
              <p>
                {ratio >= 3 ? "AA large text: passes" : "AA large text: fails"}
              </p>
            </div>
          </div>
          <Output
            value={[values.hex, values.rgb, values.hsl].join("\n")}
            filename="rabta-color.txt"
          />
        </>
      )}
    </>
  );
}

type LocalDoc = { text: string; version: string };
function Scratchpad() {
  const { Button } = useUI(),
    [text, setText] = useState(""),
    [status, setStatus] = useState(""),
    [ready, setReady] = useState(false),
    [conflict, setConflict] = useState<LocalDoc | null>(null),
    version = useRef(""),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    latest = useRef(""),
    blocked = useRef(false),
    dirty = useRef(false),
    [undo, setUndo] = useState<string | null>(null);
  const read = (): LocalDoc => {
    const raw = localStorage.getItem("rabta.utility.note");
    if (!raw) return { text: "", version: "" };
    const d = JSON.parse(raw);
    if (
      typeof d.text !== "string" ||
      typeof d.version !== "string" ||
      d.text.length > TEXT_LIMIT
    )
      throw new Error("Saved note could not be read.");
    return d;
  };
  const save = (value: string, force = false) => {
    try {
      const old = read();
      if (!force && old.version !== version.current) {
        blocked.current = true;
        setConflict(old);
        setStatus(
          "Another window changed this note. Choose which copy to keep.",
        );
        return;
      }
      const next = { text: value, version: crypto.randomUUID() };
      localStorage.setItem("rabta.utility.note", JSON.stringify(next));
      version.current = next.version;
      dirty.current = false;
      setStatus("Saved on this device.");
    } catch {
      setStatus(
        "Could not save on this device. Download your note to keep it.",
      );
    }
  };
  useEffect(() => {
    try {
      const d = read();
      setText(d.text);
      latest.current = d.text;
      version.current = d.version;
      setStatus(
        d.text
          ? "Saved on this device."
          : "Notes save on this device as you type.",
      );
    } catch {
      setStatus(
        "Saved note could not be read. Download any new work before leaving.",
      );
      blocked.current = true;
    }
    setReady(true);
    const changed = (e: StorageEvent) => {
      if (e.key !== "rabta.utility.note") return;
      clearTimeout(timer.current);
      try {
        const d = read();
        blocked.current = true;
        setConflict(d);
        setStatus(
          "Another window changed this note. Choose which copy to keep.",
        );
      } catch {
        blocked.current = true;
        setStatus(
          "A saved note changed but could not be read. Download your copy.",
        );
      }
    };
    const flush = () => {
      clearTimeout(timer.current);
      if (!blocked.current && dirty.current) save(latest.current);
    };
    window.addEventListener("storage", changed);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("storage", changed);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  const edit = (v: string) => {
    dirty.current = true;
    latest.current = v;
    setText(v);
    clearTimeout(timer.current);
    if (!blocked.current) {
      setStatus("Saving…");
      timer.current = setTimeout(() => save(v), 400);
    }
  };
  return (
    <>
      <TextField
        label="Your note"
        value={text}
        onChange={(e) => edit(e.target.value)}
        rows={13}
        disabled={!ready}
        placeholder="A thought. A meeting note. The next thing to try."
      />
      {conflict && (
        <div className="rk-conflict">
          <p>
            Your open note is still here. Download it before replacing it if you
            need both.
          </p>
          <div className="rk-actions">
            <Button
              type="button"
              onClick={() => {
                clearTimeout(timer.current);
                blocked.current = false;
                version.current = conflict.version;
                latest.current = conflict.text;
                dirty.current = false;
                setText(conflict.text);
                setConflict(null);
                setStatus("Loaded the other window’s note.");
              }}
            >
              Use saved copy
            </Button>
            <Button
              type="button"
              onClick={() => {
                blocked.current = false;
                save(text, true);
                setConflict(null);
              }}
            >
              Keep this copy
            </Button>
          </div>
        </div>
      )}
      <div className="rk-actions">
        <Button
          type="button"
          disabled={!text}
          onClick={() =>
            download(
              new Blob([text], { type: "text/markdown;charset=utf-8" }),
              "rabta-note.md",
            )
          }
        >
          Download note
        </Button>
        <Button
          type="button"
          disabled={!text}
          onClick={() => {
            setUndo(text);
            edit("");
          }}
        >
          Clear note
        </Button>
        {undo !== null && (
          <Button
            type="button"
            onClick={() => {
              edit(undo);
              setUndo(null);
            }}
          >
            Undo clear
          </Button>
        )}
      </div>
      <Status error={status.startsWith("Could")}>{status}</Status>
      <p className="rk-note">
        Stored in this browser or app profile, without cloud sync. Avoid saving
        passwords or private keys.
      </p>
    </>
  );
}
type Clip = { id: string; title: string; text: string };
function Shelf({ snippets = false }: { snippets?: boolean }) {
  const { Button } = useUI(),
    [items, setItems] = useState<Clip[]>([]),
    [title, setTitle] = useDraft("snippet-title"),
    [text, setText] = useDraft(snippets ? "snippet-draft" : "clipboard-draft"),
    [status, setStatus] = useState(""),
    [undo, setUndo] = useState<Clip | null>(null),
    [loaded, setLoaded] = useState(false),
    [editing, setEditing] = useState<string | null>(null),
    saved = useRef("[]"),
    persistBlocked = useRef(false);
  const readItems = (raw: string): Clip[] => {
    const list = JSON.parse(raw);
    if (
      !Array.isArray(list) ||
      list.length > 50 ||
      list.some(
        (x) =>
          !x ||
          typeof x.id !== "string" ||
          typeof x.title !== "string" ||
          typeof x.text !== "string" ||
          x.text.length > 10000,
      )
    )
      throw new Error("Invalid snippets");
    return list;
  };
  useEffect(() => {
    if (snippets) {
      try {
        const raw = localStorage.getItem("rabta.utility.snippets") ?? "[]";
        setItems(readItems(raw));
        saved.current = raw;
      } catch {
        persistBlocked.current = true;
        setStatus(
          "Saved snippets could not be read. New snippets will stay in this session.",
        );
      }
    }
    setLoaded(true);
  }, [snippets]);
  const commit = (next: Clip[]) => {
    if (snippets && !persistBlocked.current) {
      try {
        const raw = localStorage.getItem("rabta.utility.snippets") ?? "[]";
        if (raw !== saved.current) {
          setItems(readItems(raw));
          saved.current = raw;
          setEditing(null);
          setStatus(
            "Another window changed your snippets. The list is refreshed; your draft is still here. Review it, then add it as a new snippet.",
          );
          return false;
        }
        localStorage.setItem("rabta.utility.snippets", JSON.stringify(next));
        saved.current = JSON.stringify(next);
        setStatus("Snippet saved on this device.");
      } catch {
        persistBlocked.current = true;
        setStatus(
          "Could not save on this device. Your snippets are still available in this session.",
        );
      }
    } else if (snippets) {
      setStatus(
        "This snippet is available for this session. Device storage is unavailable.",
      );
    }
    setItems(next);
    return true;
  };
  return (
    <>
      {snippets && (
        <InputField
          label="Snippet name"
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Introduction, reply, command…"
        />
      )}
      <TextField
        label={snippets ? "Snippet text" : "Text to keep"}
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={10000}
      />
      <div className="rk-actions">
        <Button
          type="button"
          className="rk-primary"
          disabled={
            !loaded ||
            !text.trim() ||
            (snippets && !title.trim()) ||
            (!editing && items.length >= 50)
          }
          onClick={() => {
            const item = {
              id: editing ?? crypto.randomUUID(),
              title: snippets ? title.trim() : text.trim().slice(0, 55),
              text: text.slice(0, 10000),
            };
            if (
              !commit(
                editing
                  ? items.map((x) => (x.id === editing ? item : x))
                  : [item, ...items],
              )
            )
              return;
            setText("");
            setTitle("");
            setEditing(null);
            if (!snippets) setStatus("Added to this session’s shelf.");
          }}
        >
          {editing ? "Save snippet" : snippets ? "Add snippet" : "Add to shelf"}
        </Button>
        {!snippets && (
          <Button
            type="button"
            onClick={async () => {
              try {
                const value = await navigator.clipboard.readText();
                if (value.length > 10000)
                  throw new Error(
                    "Clipboard text is too long. Paste a smaller excerpt.",
                  );
                setText(value);
                setStatus(
                  "Clipboard text loaded. Choose Add to shelf to keep it.",
                );
              } catch (e) {
                setStatus(
                  e instanceof Error && e.message.includes("too long")
                    ? e.message
                    : "Clipboard access is unavailable. Paste into the text box instead.",
                );
              }
            }}
          >
            Read clipboard
          </Button>
        )}
        {editing && (
          <Button
            type="button"
            onClick={() => {
              setEditing(null);
              setText("");
              setTitle("");
            }}
          >
            Cancel edit
          </Button>
        )}
      </div>
      <Status>{status}</Status>
      <p className="rk-note">
        {snippets
          ? "Snippets save locally; they are not synced. Copy to insert into any app."
          : "Only text you add is collected. Nothing is monitored automatically. Shelf contents last until this utility closes."}
      </p>
      {items.length >= 50 && (
        <p className="rk-note">
          50-item limit reached. Remove an item before adding another.
        </p>
      )}
      {items.length === 0 ? (
        <div className="rk-empty">
          {snippets ? "Your reusable words go here." : "Your shelf is empty."}
        </div>
      ) : (
        <div className="rk-shelf">
          {items.map((item) => (
            <article key={item.id}>
              <h3>{item.title}</h3>
              <pre>{item.text}</pre>
              <div className="rk-inline">
                <Button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(item.text);
                      setStatus("Copied.");
                    } catch {
                      setText(item.text);
                      setStatus("Select the text above and copy it manually.");
                    }
                  }}
                >
                  Copy
                </Button>
                {snippets && (
                  <Button
                    type="button"
                    onClick={() => {
                      setEditing(item.id);
                      setTitle(item.title);
                      setText(item.text);
                    }}
                  >
                    Edit
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={() => {
                    if (!commit(items.filter((x) => x.id !== item.id))) return;
                    setUndo(item);
                    if (editing === item.id) setEditing(null);
                    setStatus("Removed. Undo is available.");
                  }}
                >
                  Remove
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {undo && (
        <Button
          type="button"
          onClick={() => {
            if (items.length < 50) {
              if (!commit([undo, ...items])) return;
              setUndo(null);
              setStatus("Item restored.");
            }
          }}
        >
          Undo remove
        </Button>
      )}
    </>
  );
}
function FocusTimer() {
  const { Button } = useUI(),
    [duration, setDuration] = useState("25"),
    [remaining, setRemaining] = useState(25 * 60),
    [deadline, setDeadline] = useState<number | null>(null),
    [status, setStatus] = useState(""),
    [total, setTotal] = useState(25 * 60);
  useEffect(() => {
    if (deadline === null) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (!left) {
        setDeadline(null);
        setStatus("Focus session complete. Take a breath.");
      }
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [deadline]);
  return (
    <>
      <div className="rk-timer-face">
        <svg viewBox="0 0 220 220" aria-hidden="true">
          <circle cx="110" cy="110" r="98" />
          <circle
            className="rk-timer-arc"
            cx="110"
            cy="110"
            r="98"
            pathLength="100"
            strokeDasharray="100"
            strokeDashoffset={100 - (remaining / Math.max(1, total)) * 100}
          />
        </svg>
        <div>
          <strong>
            {String(Math.floor(remaining / 60)).padStart(2, "0")}:
            {String(remaining % 60).padStart(2, "0")}
          </strong>
          <span>
            {deadline
              ? "One thing at a time."
              : remaining === 0
                ? "You made the time."
                : "Ready when you are."}
          </span>
        </div>
      </div>
      <InputField
        label="Session length in minutes"
        type="number"
        min={1}
        max={180}
        value={duration}
        disabled={deadline !== null}
        onChange={(e) => {
          setDuration(e.target.value);
          setStatus("");
          if (
            Number.isInteger(Number(e.target.value)) &&
            Number(e.target.value) > 0 &&
            Number(e.target.value) <= 180
          ) {
            setRemaining(Number(e.target.value) * 60);
            setTotal(Number(e.target.value) * 60);
          }
        }}
      />
      <div className="rk-actions">
        <Button
          type="button"
          className="rk-primary"
          onClick={() => {
            if (deadline) {
              setRemaining(
                Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
              );
              setDeadline(null);
              setStatus("Paused.");
            } else if (
              Number.isInteger(Number(duration)) &&
              Number(duration) > 0 &&
              Number(duration) <= 180
            ) {
              const seconds = remaining || Number(duration) * 60;
              setRemaining(seconds);
              setDeadline(Date.now() + seconds * 1000);
              setStatus("Session started.");
            } else
              setStatus("Choose a whole number of minutes between 1 and 180.");
          }}
        >
          {deadline
            ? "Pause"
            : remaining !== total && remaining > 0
              ? "Resume"
              : "Start focus"}
        </Button>
        <Button
          type="button"
          onClick={() => {
            setDeadline(null);
            setRemaining(total);
            setStatus("Timer reset.");
          }}
        >
          Reset
        </Button>
      </div>
      <Status>{status}</Status>
      <p className="rk-note">
        The timer keeps time while this workbench is open, including when
        another tool is selected. Closing the page ends the session.
      </p>
    </>
  );
}
function BatchRename() {
  const { Button, Input } = useUI(),
    [files, setFiles] = useState<File[]>([]),
    [prefix, setPrefix] = useState("rabta"),
    [start, setStart] = useState("1"),
    [find, setFind] = useState(""),
    [replacement, setReplacement] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    job = useRef(0);
  useEffect(
    () => () => {
      job.current++;
    },
    [],
  );
  let names: string[] = [],
    validation = "";
  try {
    names = renamedFiles(
      files.map((f) => f.name),
      prefix,
      Number(start),
      find,
      replacement,
    );
  } catch (e) {
    validation = message(e);
  }
  return (
    <>
      <div className="rk-field">
        <label htmlFor="rename-files">
          Choose files · up to 100 files, 50 MB total
        </label>
        <Input
          id="rename-files"
          type="file"
          multiple
          disabled={busy}
          onChange={(e) => {
            const next = Array.from(e.target.files ?? []);
            setStatus("");
            if (
              next.length > 100 ||
              next.reduce((n, f) => n + f.size, 0) > 50 * 1024 * 1024
            ) {
              setError("Choose at most 100 files, under 50 MB total.");
              e.target.value = "";
              setFiles([]);
              return;
            }
            setFiles(next);
            setError("");
          }}
        />
      </div>
      <div className="rk-columns">
        <InputField
          label="Numbered prefix (optional)"
          value={prefix}
          disabled={busy}
          maxLength={100}
          onChange={(e) => {
            setPrefix(e.target.value);
            setStatus("");
          }}
        />
        <InputField
          label="Start at"
          type="number"
          min={0}
          max={999999}
          value={start}
          disabled={busy || !prefix}
          onChange={(e) => {
            setStart(e.target.value);
            setStatus("");
          }}
        />
      </div>
      {!prefix && (
        <div className="rk-columns">
          <InputField
            label="Find in filename"
            value={find}
            disabled={busy}
            onChange={(e) => setFind(e.target.value)}
          />
          <InputField
            label="Replace with"
            value={replacement}
            disabled={busy}
            onChange={(e) => setReplacement(e.target.value)}
          />
        </div>
      )}
      {files.length > 0 && (
        <div className="rk-rename-preview">
          <table>
            <caption>
              {files.length} file{files.length === 1 ? "" : "s"} · originals
              stay unchanged
            </caption>
            <thead>
              <tr>
                <th>Original</th>
                <th>Renamed copy</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f, i) => (
                <tr key={i}>
                  <td>{f.name}</td>
                  <td>{names[i] ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="rk-actions">
        <Button
          type="button"
          className="rk-primary"
          disabled={busy || !files.length || !!validation}
          onClick={async () => {
            const current = ++job.current;
            setBusy(true);
            setError("");
            try {
              const entries = [];
              for (let i = 0; i < files.length; i++) {
                if (current !== job.current) return;
                entries.push({
                  name: names[i],
                  bytes: new Uint8Array(await files[i].arrayBuffer()),
                });
                setStatus(`Preparing ${i + 1} of ${files.length}…`);
              }
              if (current !== job.current) return;
              download(
                new Blob([zipFiles(entries) as BlobPart], {
                  type: "application/zip",
                }),
                "rabta-renamed.zip",
              );
              setStatus(
                "ZIP prepared. Your browser will save the renamed copies.",
              );
            } catch (e) {
              setError(message(e));
            } finally {
              if (current === job.current) setBusy(false);
            }
          }}
        >
          {busy ? "Preparing ZIP…" : "Download renamed ZIP"}
        </Button>
        {busy && (
          <Button
            type="button"
            onClick={() => {
              job.current++;
              setBusy(false);
              setStatus("Cancelled. Originals are unchanged.");
            }}
          >
            Cancel
          </Button>
        )}
      </div>
      <Status error={!!(error || validation)}>
        {error || validation || status}
      </Status>
    </>
  );
}

function ToolContent({ id }: { id: ToolId }) {
  switch (id) {
    case "scratchpad":
      return <Scratchpad />;
    case "snippets":
      return <Shelf snippets />;
    case "clipboard":
      return <Shelf />;
    case "focus":
      return <FocusTimer />;
    case "calculator":
      return <Calculator />;
    case "units":
      return <UnitConverter />;
    case "hash":
      return <Checksum />;
    case "generate":
      return <Generator />;
    case "color":
      return <ColorLab />;
    case "rename":
      return <BatchRename />;
    default:
      return <Transformer id={id} />;
  }
}
export function UtilityWorkbench({
  ui,
  initialTool = "scratchpad",
  onToolChange,
  nativeTools,
}: {
  ui: UtilityUI;
  initialTool?: ToolId;
  onToolChange?: (id: ToolId) => void;
  nativeTools?: ReactNode;
}) {
  const [selected, setSelected] = useState<ToolId | "mac">(initialTool),
    [query, setQuery] = useState(""),
    [favorites, setFavorites] = useState<string[]>([]),
    [favoriteError, setFavoriteError] = useState(""),
    [visited, setVisited] = useState<ToolId[]>([initialTool]);
  const inputId = useId(),
    memory = useRef(new Map<string, string>()),
    { Input, Button, Select } = ui;
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("rabta.utility.favorites") ?? "[]",
      );
      if (Array.isArray(saved))
        setFavorites(
          saved.filter(
            (x) => typeof x === "string" && TOOLS.some((t) => t.id === x),
          ),
        );
    } catch {
      /* A fresh preference is safe when storage is unavailable. */
    }
  }, []);
  const favorite = (id: string) => {
    const next = favorites.includes(id)
      ? favorites.filter((x) => x !== id)
      : [...favorites, id];
    setFavorites(next);
    try {
      localStorage.setItem("rabta.utility.favorites", JSON.stringify(next));
      setFavoriteError("");
    } catch {
      setFavoriteError(
        "Favorites could not be saved. They will last for this visit.",
      );
    }
  };
  const select = (id: ToolId) => {
    setSelected(id);
    setVisited((v) => (v.includes(id) ? v : [...v, id]));
    onToolChange?.(id);
  };
  const shown = TOOLS.filter((t) =>
    `${t.name} ${t.category} ${t.hint}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const active = TOOLS.find((t) => t.id === selected);
  return (
    <UIContext.Provider value={ui}>
      <MemoryContext.Provider value={memory.current}>
        <section className="rk-workbench" aria-label="Rabta utility workbench">
          <div className="rk-command">
            <ToolIcon name="search" />
            <label className="rk-sr-only" htmlFor={inputId}>
              Find a utility
            </label>
            <Input
              id={inputId}
              value={query}
              placeholder="What do you need to do?"
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
            {query && (
              <Button
                type="button"
                aria-label="Clear utility search"
                onClick={() => {
                  setQuery("");
                  document.getElementById(inputId)?.focus();
                }}
              >
                <ToolIcon name="x" size={18} />
              </Button>
            )}
            <span className="rk-command-count">{TOOLS.length} tools</span>
          </div>
          <div className="rk-mobile-picker">
            {shown.length > 0 || nativeTools ? (
              <>
                <label htmlFor={`${inputId}-mobile`}>Choose a utility</label>
                <Select
                  id={`${inputId}-mobile`}
                  label="Choose a utility"
                  value={
                    selected === "mac"
                      ? "Mac controls"
                      : shown.some((t) => t.id === selected)
                        ? (active?.name ?? "")
                        : ""
                  }
                  options={[
                    ...shown.map((t) => t.name),
                    ...(nativeTools ? ["Mac controls"] : []),
                  ]}
                  onChange={(name) => {
                    if (name === "Mac controls") {
                      setSelected("mac");
                      return;
                    }
                    const tool = TOOLS.find((t) => t.name === name);
                    if (tool) select(tool.id);
                  }}
                />
              </>
            ) : (
              <p>No tools match your search. Clear it to see all tools.</p>
            )}
          </div>
          <div className="rk-layout">
            <nav className="rk-browser" aria-label="Utilities">
              {["Favorites", "Everyday", "Creative", "Developer"].map(
                (group) => {
                  const list =
                    group === "Favorites"
                      ? shown.filter((t) => favorites.includes(t.id))
                      : shown.filter((t) => t.category === group);
                  return (
                    list.length > 0 && (
                      <div className="rk-group" key={group}>
                        <p>{group}</p>
                        {list.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className={`rk-tool-row ${selected === t.id ? "is-selected" : ""}`}
                            aria-current={
                              selected === t.id ? "page" : undefined
                            }
                            onClick={() => select(t.id)}
                          >
                            <ToolIcon name={t.icon} size={20} />
                            <span>{t.name}</span>
                            {selected === t.id && (
                              <ToolIcon name="arrow" size={16} />
                            )}
                          </button>
                        ))}
                      </div>
                    )
                  );
                },
              )}
              {shown.length === 0 && (
                <div className="rk-empty">
                  <p>No tools match “{query}”.</p>
                  <Button type="button" onClick={() => setQuery("")}>
                    Clear search
                  </Button>
                </div>
              )}
              {nativeTools && (
                <div className="rk-group">
                  <p>This Mac</p>
                  <button
                    type="button"
                    className={`rk-tool-row ${selected === "mac" ? "is-selected" : ""}`}
                    onClick={() => setSelected("mac")}
                    aria-current={selected === "mac" ? "page" : undefined}
                  >
                    <ToolIcon name="mac" size={20} />
                    <span>Mac controls</span>
                  </button>
                </div>
              )}
            </nav>
            <div className="rk-stage">
              <header className="rk-tool-header">
                <div>
                  <span className="rk-eyebrow">
                    {active?.category ?? "This Mac"}
                  </span>
                  <h2>{active?.name ?? "Mac controls"}</h2>
                  <p>
                    {active?.description ??
                      "Useful controls, connected to your Mac."}
                  </p>
                </div>
                {active && (
                  <Button
                    type="button"
                    className="rk-pin"
                    onClick={() => favorite(active.id)}
                    aria-label={
                      favorites.includes(active.id)
                        ? "Remove from favorites"
                        : "Add to favorites"
                    }
                    aria-pressed={favorites.includes(active.id)}
                  >
                    <ToolIcon name="star" />
                  </Button>
                )}
              </header>
              {favoriteError && <Status error>{favoriteError}</Status>}
              {visited.map((id) => (
                <div key={id} hidden={selected !== id}>
                  <ToolContent id={id} />
                </div>
              ))}
              {selected === "mac" && nativeTools}
            </div>
          </div>
          <footer className="rk-foot">
            <span>Rabta Studio</span>
            <span>Your tools. On your device.</span>
          </footer>
        </section>
      </MemoryContext.Provider>
    </UIContext.Provider>
  );
}
