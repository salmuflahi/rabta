import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ProjectIcon,
  PROJECT_ICON_OPTIONS,
} from "@/lib/project-icons";
import type { Project, ProjectIconKey } from "@/store";

interface ProjectDialogsProps {
  renameProject: Project | null;
  iconProject: Project | null;
  busy: boolean;
  onClose: () => void;
  onRename: (id: string, name: string) => Promise<void>;
  onSetIcon: (id: string, icon: ProjectIconKey | null) => Promise<void>;
}

export function ProjectDialogs({
  renameProject,
  iconProject,
  busy,
  onClose,
  onRename,
  onSetIcon,
}: ProjectDialogsProps) {
  const [name, setName] = useState("");
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(renameProject?.name ?? "");
    if (renameProject) {
      requestAnimationFrame(() => nameInput.current?.select());
    }
  }, [renameProject]);

  const trimmedName = name.trim();
  const renameDisabled =
    busy ||
    !renameProject ||
    !trimmedName ||
    trimmedName === renameProject.name;

  return (
    <>
      <Dialog
        open={renameProject !== null}
        onOpenChange={(open) => !open && onClose()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>
              Change the name Rabta uses for this workspace.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!renameProject || renameDisabled) return;
              void onRename(renameProject.id, trimmedName);
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rename-project-name">Project name</Label>
              <Input
                ref={nameInput}
                id="rename-project-name"
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={renameDisabled}>
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={iconProject !== null}
        onOpenChange={(open) => !open && onClose()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose project icon</DialogTitle>
            <DialogDescription>
              Use a stable visual marker for this workspace.
            </DialogDescription>
          </DialogHeader>
          {iconProject && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              <Button
                type="button"
                variant="outline"
                className="h-auto flex-col py-3 aria-pressed:border-primary aria-pressed:bg-primary/10"
                aria-label="Default icon"
                aria-pressed={iconProject.icon === null}
                disabled={busy}
                onClick={() => void onSetIcon(iconProject.id, null)}
              >
                <ProjectIcon icon={null} />
                <span className="text-xs">Default</span>
              </Button>
              {PROJECT_ICON_OPTIONS.map((option) => (
                <Button
                  key={option.key}
                  type="button"
                  variant="outline"
                  className="h-auto flex-col py-3 aria-pressed:border-primary aria-pressed:bg-primary/10"
                  aria-label={`${option.label} icon`}
                  aria-pressed={iconProject.icon === option.key}
                  disabled={busy}
                  onClick={() =>
                    void onSetIcon(iconProject.id, option.key)
                  }
                >
                  <ProjectIcon icon={option.key} />
                  <span className="text-xs">{option.label}</span>
                </Button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
