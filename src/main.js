import { jsx as _jsx } from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import "./index.css";

document.documentElement.lang = "pt-BR";
document.documentElement.setAttribute("translate", "no");
document.documentElement.classList.add("notranslate");
document.body?.setAttribute("translate", "no");
document.body?.classList.add("notranslate");
document.getElementById("root")?.setAttribute("translate", "no");
document.getElementById("root")?.classList.add("notranslate");

createRoot(document.getElementById("root")).render(_jsx(AppErrorBoundary, { children: _jsx(App, {}) }));
