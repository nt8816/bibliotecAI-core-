import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
export function MainLayout({ children, title }) {
    return (_jsx(SidebarProvider, { children: _jsxs("div", { className: "min-h-screen flex w-full", children: [_jsx(AppSidebar, {}), _jsxs("main", { className: "flex-1 flex flex-col", children: [_jsxs("header", { className: "h-16 border-b bg-card flex items-center px-4 gap-4", children: [_jsx(SidebarTrigger, { className: "text-muted-foreground hover:text-foreground" }), _jsx("h1", { className: "text-xl font-bold text-foreground", children: title })] }), _jsx("div", { className: "flex-1 p-6 overflow-auto", children: children })] })] }) }));
}
