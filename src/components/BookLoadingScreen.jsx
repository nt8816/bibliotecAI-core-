import { BookOpen } from 'lucide-react';

export function BookLoadingScreen({ message = 'Carregando biblioteca...' }) {
  return (
    <div className="book-loading-screen" role="status" aria-live="polite">
      <div className="book-loading-stage">
        <div className="book-loading-visual" aria-hidden="true">
          <div className="book-loading-cover">
            <BookOpen className="book-loading-icon" />
          </div>
          <span className="book-loading-page book-loading-page-1" />
          <span className="book-loading-page book-loading-page-2" />
          <span className="book-loading-page book-loading-page-3" />
        </div>
        <p className="book-loading-text">{message}</p>
      </div>
    </div>
  );
}

