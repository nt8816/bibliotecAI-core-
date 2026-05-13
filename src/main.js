import { jsx as _jsx } from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import "./index.css";

let root;

document.documentElement.lang = "pt-BR";
document.documentElement.setAttribute("translate", "no");
document.documentElement.classList.add("notranslate");
document.body?.setAttribute("translate", "no");
document.body?.classList.add("notranslate");
document.getElementById("root")?.setAttribute("translate", "no");
document.getElementById("root")?.classList.add("notranslate");

function renderApp(error) {
  const container = document.getElementById("root");
  if (!container) return;

  if (!root) {
    root = createRoot(container);
  }
  root.render(_jsx(AppErrorBoundary, {
    hasError: Boolean(error),
    message: error?.message || String(error || ""),
    children: _jsx(App, {}),
  }));
}

window.addEventListener("error", (event) => {
  console.error("Erro global capturado:", event.error || event.message);
  renderApp(event.error || new Error(event.message));
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Promessa rejeitada capturada:", event.reason);
  renderApp(event.reason instanceof Error ? event.reason : new Error(String(event.reason || "")));
});

renderApp();
