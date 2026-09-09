import { Companion } from "@/features/companion/Companion";
import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "@/components/theme-provider";
import { IconSprite } from "@/components/ui/icon";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./index.css";
import "@/fonts.css";
import "@/vendor/rabta-ui/brand.css";
import "./vendor/rabta-ui/lens.css";
import "./lens-app.css";
import "./context-measure.css";

const isGallery = import.meta.env.DEV && window.location.hash === "#gallery";
const Gallery = isGallery
  ? React.lazy(() => import("@/gallery/Gallery").then((m) => ({ default: m.Gallery })))
  : null;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* Mounted once, at the app root — every <Icon>'s <use href="#ic-…">
        resolves against these defs regardless of which screen renders it.
        Not part of ThemeProvider/App: it carries no icon-set wiring of its
        own, just the sprite's symbol defs (Phase 2 wires icons into
        screens). */}
    <IconSprite />
    <ThemeProvider>
      <TooltipProvider delayDuration={200}>
        {Gallery ? (
          <Suspense fallback={null}>
            <Gallery />
          </Suspense>
        ) : (
          window.location.hash === "#companion" ? <Companion /> : <App />
        )}
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>
);
