import { BookOpen, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LoadingIndicator({ className }) {
  return (
    <div className={cn('app-book-loader', className)} aria-hidden="true">
      <div className="app-book-loader-orbit" />
      <div className="app-book-loader-book">
        <BookOpen className="h-10 w-10" strokeWidth={1.6} />
        <span className="app-book-loader-page" />
      </div>
      <Sparkles className="app-book-loader-sparkle h-5 w-5" />
      <div className="app-loading-dots"><span /><span /><span /></div>
    </div>
  );
}
