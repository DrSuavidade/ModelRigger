import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full bg-acid-black p-8">
          <div className="max-w-md w-full bg-[#111116] border-2 border-acid-magenta rounded-lg p-6 shadow-neon-magenta">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-acid-magenta/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-acid-magenta" />
              </div>
              <div>
                <h2 className="font-display text-xl text-acid-magenta tracking-wider">
                  SYSTEM_ERROR
                </h2>
                <p className="text-gray-500 text-xs font-mono">
                  CRITICAL FAILURE DETECTED
                </p>
              </div>
            </div>

            {/* Error Details */}
            <div className="bg-black/50 border border-gray-800 rounded p-3 mb-4">
              <p className="font-mono text-sm text-acid-orange mb-2">
                {this.state.error?.message || "Unknown error occurred"}
              </p>
              {this.state.errorInfo && (
                <details className="mt-2">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">
                    Stack trace
                  </summary>
                  <pre className="text-[10px] text-gray-600 mt-2 overflow-auto max-h-32 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={this.handleReset}
                className="flex-1 flex items-center justify-center gap-2 bg-acid-green text-black font-display py-2 px-4 rounded hover:bg-white transition-colors"
              >
                <RefreshCw size={16} />
                RETRY
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 flex items-center justify-center gap-2 bg-transparent text-acid-cyan border border-acid-cyan font-display py-2 px-4 rounded hover:bg-acid-cyan hover:text-black transition-colors"
              >
                RELOAD APP
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Mini error boundary for individual panels
export const PanelErrorBoundary = ({
  children,
  panelName,
}: {
  children: ReactNode;
  panelName: string;
}) => (
  <ErrorBoundary
    fallback={
      <div className="flex flex-col items-center justify-center h-full p-4 bg-[#111116]">
        <AlertTriangle className="w-8 h-8 text-acid-orange mb-2" />
        <p className="font-display text-sm text-acid-orange">
          {panelName} ERROR
        </p>
        <p className="font-mono text-[10px] text-gray-500 mt-1">
          Component failed to render
        </p>
      </div>
    }
  >
    {children}
  </ErrorBoundary>
);
