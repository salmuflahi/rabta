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
import { TEXT_LIMIT } from "./core";
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
  exportFile?: (
    blob: Blob,
    filename: string,
  ) => Promise<{ cancelled: boolean }>;
};
export const UIContext = createContext<UtilityUI | null>(null);
export function useUI() {
  const ui = useContext(UIContext);
  if (!ui) throw new Error("Utility UI adapter is missing");
  return ui;
}
export function message(e: unknown) {
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
/** Canonical export feedback. Native host owns the Save dialog; shared preview owns a download. */
export function useFileExport() {
  const ui = useUI(),
    pending = useRef(false),
    alive = useRef(true);
  const [exporting, setExporting] = useState(false),
    [notice, setNotice] = useState(""),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const exportFile = async (blob: Blob, filename: string, after = "") => {
    if (pending.current) return false;
    pending.current = true;
    setExporting(true);
    setNotice("");
    setFailed(false);
    try {
      const result = ui.exportFile
        ? await ui.exportFile(blob, filename)
        : (download(blob, filename), { cancelled: false });
      if (alive.current)
        setNotice(
          result.cancelled
            ? "Export cancelled. Your work is still here."
            : `${ui.exportFile ? "File exported." : "Download prepared."}${after ? " " + after : ""}`,
        );
      return !result.cancelled;
    } catch (error) {
      if (alive.current) {
        setFailed(true);
        setNotice(
          `Export failed: ${message(error)}. Your work is still here; try again.`,
        );
      }
      return false;
    } finally {
      pending.current = false;
      if (alive.current) setExporting(false);
    }
  };
  return {
    exportFile,
    exporting,
    exportFeedback: <Status error={failed}>{notice}</Status>,
  };
}
export const MemoryContext = createContext<Map<string, string> | null>(null);
export function useDraft(key: string, initial = "") {
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
export function SelectField(props: Omit<SelectProps, "id">) {
  const { Select } = useUI(),
    id = useId();
  return (
    <div className="rk-field">
      <label htmlFor={id}>{props.label}</label>
      <Select {...props} id={id} />
    </div>
  );
}
export function InputField({
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
export function TextField({
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
export function Status({
  error,
  children,
}: {
  error?: boolean;
  children: ReactNode;
}) {
  return (
    <p
      className={`rk-status ${error ? "rk-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </p>
  );
}
export function Output({
  value,
  filename = "rabta-result.txt",
  secret = false,
}: {
  value: string;
  filename?: string;
  secret?: boolean;
}) {
  const { exportFile, exporting, exportFeedback } = useFileExport();
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
              disabled={!value || exporting}
              aria-busy={exporting}
              onClick={() =>
                exportFile(
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
      {exportFeedback}
    </div>
  );
}
