import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./index.css";

const isGallery = import.meta.env.DEV && window.location.hash === "#gallery";
const Gallery = isGallery
  ? React.lazy(() => import("@/gallery/Gallery").then((m) => ({ default: m.Gallery })))
  : null;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark">
      {Gallery ? (
        <Suspense fallback={null}>
          <Gallery />
        </Suspense>
      ) : (
        <App />
      )}
      <Toaster />
    </ThemeProvider>
  </React.StrictMode>
);
