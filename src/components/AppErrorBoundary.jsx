import React from 'react';

export class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'Erro inesperado na interface.',
    };
  }

  componentDidCatch(error, errorInfo) {
    // Mantem diagnostico no console sem derrubar toda a interface.
    console.error('AppErrorBoundary capturou erro:', error, errorInfo);
  }

  handleReload() {
    window.location.reload();
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-sm space-y-3">
          <h1 className="text-lg font-semibold">Ocorreu um erro na tela</h1>
          <p className="text-sm text-muted-foreground">
            A interface foi recuperada em modo seguro para evitar tela branca.
          </p>
          <p className="text-xs text-muted-foreground break-words">{this.state.message}</p>
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Recarregar página
          </button>
        </div>
      </div>
    );
  }
}
