import { jsx as _jsx } from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import "./index.css";
createRoot(document.getElementById("root")).render(_jsx(AppErrorBoundary, { children: _jsx(App, {}) }));
