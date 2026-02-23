import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AccessibilityControls } from '@/components/accessibility/AccessibilityControls';
import { AppSidebar } from './AppSidebar';

export function MainLayout({ children, title }) {
  return _jsx(SidebarProvider, {
    children: _jsxs('div', {
      className: 'flex min-h-screen w-full bg-background',
      children: [
        _jsx('a', { href: '#main-content', className: 'skip-link', children: 'Pular para o conteúdo principal' }),
        _jsx(AppSidebar, {}),
        _jsxs('main', {
          className: 'flex min-w-0 flex-1 flex-col',
          children: [
            _jsxs('header', {
              className: 'flex h-14 items-center justify-between gap-3 border-b bg-card px-3 sm:h-16 sm:gap-4 sm:px-4',
              children: [
                _jsxs('div', {
                  className: 'flex min-w-0 items-center gap-3 sm:gap-4',
                  children: [
                    _jsx(SidebarTrigger, { className: 'shrink-0 text-muted-foreground hover:text-foreground', 'aria-label': 'Abrir ou fechar menu lateral' }),
                    _jsx('h1', { className: 'truncate text-base font-bold text-foreground sm:text-xl', children: title }),
                  ],
                }),
                _jsx('div', { className: 'shrink-0', children: _jsx(AccessibilityControls, {}) }),
              ],
            }),
            _jsx('div', { id: 'main-content', className: 'flex-1 overflow-auto px-3 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6', children }),
          ],
        }),
      ],
    }),
  });
}
