import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { exportBlob } from "@/lib/export-file";

const icons: Record<string, IconName> = {
  file: "folder-open", arrow: "chevron-right", local: "shield", restore: "capture",
  prism: "appearance", layers: "capsule", code: "code", play: "play",
};

export function CreativeIcon({ name, size = 24 }: { name: string; size?: number }) {
  return <Icon name={icons[name] ?? "utilities"} style={{ width: size, height: size }} />;
}

/** A native progress element keeps its platform semantics without a second UI framework. */
export function Progress({ value, "aria-label": label }: { value?: number; "aria-label": string }) {
  return <progress className="creative-progress" value={value} max={100} aria-label={label}>{value === undefined ? "Working…" : `${value}%`}</progress>;
}

export function DownloadButton({ href, download, children, ...props }: Omit<ComponentProps<typeof Button>, "onClick"> & {
  href: string;
  download: string;
  children: ReactNode;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const active = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    revision.current++;
    setMessage("");
    setFailed(false);
    setSaving(false);
    return () => { revision.current++; };
  }, [href]);
  return (
    <span className="creative-download">
      <Button {...props} type="button" disabled={props.disabled || saving} aria-busy={saving} onClick={async () => {
        if (active.current) return;
        active.current = true;
        setSaving(true);
        setMessage("");
        setFailed(false);
        const id = revision.current;
        try {
          if (!href.startsWith("blob:")) throw new Error("Create a local result before saving.");
          const response = await fetch(href);
          if (!response.ok) throw new Error("This result is no longer available. Create a new export.");
          const blob = await response.blob();
          if (id !== revision.current) return;
          const result = await exportBlob(blob, download);
          if (id === revision.current) setMessage(result.cancelled ? "Save cancelled." : result.path ? "File saved." : "Download requested.");
        } catch (error) {
          if (id === revision.current) {
            setFailed(true);
            setMessage(error instanceof Error ? error.message : "Could not save this file. Try again.");
          }
        } finally {
          active.current = false;
          if (id === revision.current) setSaving(false);
        }
      }}>{children}</Button>
      <span role={failed ? "alert" : "status"}>{message}</span>
    </span>
  );
}
