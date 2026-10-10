import { Component, ErrorInfo, ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  private handleReset = () => {
    localStorage.clear();
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-fg text-center">
          <div className="glass-card max-w-md w-full p-8 rounded-3xl border border-outline-variant flex flex-col items-center space-y-6 shadow-2xl backdrop-blur-xl">
            <div className="w-16 h-16 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center text-error">
              <Icon name="error_outline" className="text-3xl" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-extrabold font-heading text-fg">Something went wrong</h2>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                The application encountered an unexpected issue while loading data.
              </p>
              {this.state.error && (
                <div className="bg-surface-container/60 p-3 rounded-xl text-left overflow-x-auto text-xs text-error/80 font-mono mt-3 border border-outline-variant/30 max-h-32">
                  {this.state.error.message}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-primary hover:bg-primary/90 text-on-primary font-heading font-bold text-xs py-3 px-4 rounded-xl transition-all shadow-neon-cyan flex items-center justify-center gap-2"
              >
                <Icon name="refresh" className="text-sm" />
                <span>Reload Page</span>
              </button>
              <button
                onClick={this.handleReset}
                className="flex-1 bg-surface-container hover:bg-surface-container-high text-fg font-heading font-semibold text-xs py-3 px-4 rounded-xl transition-all border border-outline-variant flex items-center justify-center gap-2"
              >
                <Icon name="restart_alt" className="text-sm" />
                <span>Reset & Log In</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
