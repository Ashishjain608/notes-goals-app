import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import { isTauri } from "@/lib/platform";
import { syncController } from "@/sync";
import "@/styles/index.css";

// A Dropbox sign-in pop-up that lands here only hands its code back and closes.
if (!syncController.handleRedirect()) {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// Register service worker for phone PWA (web mode only).
if (!isTauri && import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("./sw.js");
}
