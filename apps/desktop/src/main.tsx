import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./index.css";

const isGallery = import.meta.env.DEV && window.location.hash === "#gallery";

async function Root() {
  if (isGallery) {
    const { Gallery } = await import("@/gallery/Gallery");
    return <Gallery />;
  }
  return <App />;
}

function Mount() {
  const [node, setNode] = React.useState<React.ReactNode>(null);
  React.useEffect(() => {
    Root().then(setNode);
  }, []);
  return (
    <>
      {node}
      <Toaster />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark">
      <Mount />
    </ThemeProvider>
  </React.StrictMode>
);
