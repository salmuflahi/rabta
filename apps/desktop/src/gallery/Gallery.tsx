import * as React from "react";
import {
  Download,
  Inbox,
  Moon,
  Plug,
  Sun,
  Terminal,
} from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { toast } from "@/components/ui/sonner";
import markUrl from "@/assets/brand/rabta-mark.svg";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Kbd } from "@/components/ui/kbd";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandInput,
  CommandList,
} from "@/components/ui/command";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-4">
      {children}
    </p>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-16">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  );
}

const buttonVariants = [
  "primary",
  "secondary",
  "ghost",
  "destructive",
  "outline",
  "link",
] as const;
const buttonSizes = ["default", "sm", "lg", "icon"] as const;

export function Gallery() {
  const { theme, setTheme } = useTheme();
  const [commandOpen, setCommandOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-16">
        <div className="flex items-center gap-3">
          <img
            src={markUrl}
            alt="Rabta"
            className="h-7 w-7 rounded-[8px]"
          />
          <div>
            <h1 className="text-2xl font-semibold">
              Rabta — Component Gallery
            </h1>
            <p className="text-sm text-muted-foreground">
              Dev-only review surface — every component, both themes.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={theme === "light" ? "primary" : "outline"}
            size="sm"
            onClick={() => setTheme("light")}
          >
            <Sun /> Light
          </Button>
          <Button
            variant={theme === "dark" ? "primary" : "outline"}
            size="sm"
            onClick={() => setTheme("dark")}
          >
            <Moon /> Dark
          </Button>
        </div>
      </header>

      {/* Brand palette */}
      <Section title="Brand palette">
        <div className="flex flex-wrap gap-6">
          {[
            { label: "Primary", swatch: "bg-primary" },
            { label: "Foreground", swatch: "bg-foreground" },
            { label: "Success", swatch: "bg-success" },
            { label: "Info", swatch: "bg-info" },
            { label: "Warning", swatch: "bg-warning" },
            { label: "Destructive", swatch: "bg-destructive" },
          ].map(({ label, swatch }) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <div className={`h-14 w-14 rounded-lg border border-border ${swatch}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
          <div className="flex flex-col items-center gap-2">
            <div className="h-14 w-14 rounded-lg border border-border bg-sidebar flex items-center justify-center">
              <span className="text-[10px] text-sidebar-foreground">Aa</span>
            </div>
            <span className="text-xs text-muted-foreground">Sidebar</span>
          </div>
        </div>

        <div className="mt-8 max-w-xs">
          <p className="text-xs text-muted-foreground mb-2">Sidebar preview</p>
          <div className="bg-sidebar text-sidebar-foreground rounded-lg p-3 flex flex-col gap-1">
            <div className="rounded-md px-3 py-2 text-sm bg-sidebar-accent text-sidebar-accent-foreground">
              Connections
            </div>
            <div className="rounded-md px-3 py-2 text-sm">Activity</div>
            <div className="rounded-md px-3 py-2 text-sm">Advanced</div>
          </div>
        </div>
      </Section>

      {/* Buttons */}
      <Section title="Buttons">
        <div className="flex flex-col gap-4">
          {buttonVariants.map((variant) => (
            <div key={variant} className="flex items-center gap-3">
              <span className="w-24 text-xs text-muted-foreground">{variant}</span>
              {buttonSizes.map((size) => (
                <Button key={size} variant={variant} size={size}>
                  {size === "icon" ? <Download /> : "Button"}
                </Button>
              ))}
            </div>
          ))}
          <div className="flex items-center gap-3">
            <span className="w-24 text-xs text-muted-foreground">disabled</span>
            <Button variant="secondary" disabled>Disabled</Button>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-24 text-xs text-muted-foreground">icon+label</span>
            <Button variant="secondary">
              <Download />
              Download
            </Button>
          </div>
        </div>
      </Section>

      {/* Badges */}
      <Section title="Badges">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>default</Badge>
          <Badge variant="secondary">secondary</Badge>
          <Badge variant="success">success</Badge>
          <Badge variant="warning">warning</Badge>
          <Badge variant="destructive">destructive</Badge>
          <Badge variant="outline">outline</Badge>
          <Badge variant="success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            online
          </Badge>
        </div>
      </Section>

      {/* Inputs */}
      <Section title="Inputs">
        <div className="grid grid-cols-2 gap-6 max-w-2xl">
          <div className="space-y-1.5">
            <Label htmlFor="gallery-input">Name</Label>
            <Input id="gallery-input" placeholder="Connector name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gallery-textarea">Notes</Label>
            <Textarea id="gallery-textarea" placeholder="Freeform notes..." />
          </div>
          <div className="space-y-1.5">
            <Label>Kind</Label>
            <Select defaultValue="vscode">
              <SelectTrigger>
                <SelectValue placeholder="Select a kind" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vscode">VS Code</SelectItem>
                <SelectItem value="cli">CLI</SelectItem>
                <SelectItem value="browser">Browser</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Switch id="gallery-switch" defaultChecked />
            <Label htmlFor="gallery-switch">Auto-reconnect</Label>
          </div>
        </div>
      </Section>

      {/* Cards */}
      <Section title="Cards">
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Connector</CardTitle>
            <CardDescription>vscode-fake-01</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Connected 2 minutes ago. 14 events sent.
            </p>
          </CardContent>
          <CardFooter>
            <Button size="sm" variant="secondary">
              Disconnect
            </Button>
          </CardFooter>
        </Card>
      </Section>

      {/* Overlays */}
      <Section title="Overlays">
        <div className="flex flex-wrap items-center gap-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Remove connector</DialogTitle>
                <DialogDescription>
                  This will disconnect the client and forget its pairing. This
                  action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline">Cancel</Button>
                <Button variant="destructive">Remove</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Open menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Rename</DropdownMenuItem>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ContextMenu>
            <ContextMenuTrigger className="flex h-9 items-center rounded-md border border-dashed border-border px-4 text-sm text-muted-foreground">
              Right-click me
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem>Copy</ContextMenuItem>
              <ContextMenuItem>Paste</ContextMenuItem>
              <ContextMenuItem>Reload</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline">Hover me</Button>
              </TooltipTrigger>
              <TooltipContent>Tooltip content</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">Open popover</Button>
            </PopoverTrigger>
            <PopoverContent>
              <p className="text-sm">
                Popovers render floating, dismissible content anchored to a
                trigger.
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </Section>

      {/* Feedback */}
      <Section title="Feedback">
        <div className="space-y-8">
          <div className="max-w-sm space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>

          <div className="flex items-center gap-1">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </div>

          <EmptyState
            icon={<Inbox />}
            title="No connectors yet"
            description="Pair a client to see it appear here."
            action={<Button size="sm" variant="primary">Pair a connector</Button>}
          />

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => toast.success("Connector paired successfully")}
            >
              Success toast
            </Button>
            <Button
              variant="outline"
              onClick={() => toast.error("Failed to reach hub")}
            >
              Error toast
            </Button>
            <Button
              variant="outline"
              onClick={() => toast("Event received")}
            >
              Default toast
            </Button>
          </div>
        </div>
      </Section>

      {/* Tabs */}
      <Section title="Tabs">
        <Tabs defaultValue="connections" className="max-w-lg">
          <TabsList>
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>
          <TabsContent value="connections">
            <p className="text-sm text-muted-foreground">
              List of paired connectors and their live status would render here.
            </p>
          </TabsContent>
          <TabsContent value="activity">
            <p className="text-sm text-muted-foreground">
              A scrolling feed of recent hub events would render here.
            </p>
          </TabsContent>
          <TabsContent value="advanced">
            <p className="text-sm text-muted-foreground">
              Hub port, reset pairing, and diagnostic actions would render here.
            </p>
          </TabsContent>
        </Tabs>
      </Section>

      {/* Command */}
      <Section title="Command">
        <Button variant="outline" onClick={() => setCommandOpen(true)}>
          <Terminal />
          Open command palette
        </Button>
        <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
          <CommandInput placeholder="Type a command..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Connectors">
              <CommandItem>
                <Plug />
                Pair new connector
              </CommandItem>
              <CommandItem>
                <Inbox />
                View activity log
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </Section>
    </div>
  );
}
