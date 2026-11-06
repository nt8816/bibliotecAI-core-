import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "@/lib/utils";
function Skeleton({ className, ...props }) {
    return _jsx("div", { className: cn("app-loading-skeleton relative overflow-hidden rounded-md bg-muted", className), ...props });
}
export { Skeleton };
