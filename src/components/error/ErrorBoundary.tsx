"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";
import { logger } from "@/lib/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetOnPropsChange?: boolean;
  resetKeys?: Array<string | number>;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  private resetTimeoutId: NodeJS.Timeout | null = null;
  private previousResetKeys: Array<string | number> = [];

  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });
    
    // Log to error tracking service in production
    logger.error(
      `ErrorBoundary caught error${this.props.componentName ? ` in ${this.props.componentName}` : ''}`,
      error,
      { 
        componentStack: errorInfo.componentStack,
        componentName: this.props.componentName,
      }
    );

    this.props.onError?.(error, errorInfo);
  }

  public componentDidUpdate(prevProps: Props) {
    const { resetOnPropsChange, resetKeys } = this.props;
    const { hasError } = this.state;

    // Reset error state if resetKeys change
    if (hasError && resetKeys && resetKeys.length > 0) {
      const hasResetKeyChanged = resetKeys.some(
        (key, index) => key !== this.previousResetKeys[index]
      );

      if (hasResetKeyChanged) {
        this.previousResetKeys = [...resetKeys];
        this.handleReset();
      }
    }
  }

  public componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleRetry = () => {
    // Small delay to allow state to settle
    this.resetTimeoutId = setTimeout(() => {
      this.handleReset();
    }, 100);
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <GlassCard className="max-w-md w-full p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-6 border border-red-500/20">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground text-sm mb-6">
              We&apos;ve encountered an unexpected error. Please try refreshing the page.
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={this.handleRetry}
                variant="outline"
                className="border-white/10"
              >
                Try Again
              </Button>
              <Button
                onClick={() => window.location.reload()}
                className="bg-primary hover:bg-primary/90"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Reload Page
              </Button>
            </div>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <div className="mt-6 p-4 bg-red-500/5 rounded-lg border border-red-500/10 text-left">
                <p className="text-xs font-mono text-red-300 break-all">
                  {this.state.error.toString()}
                </p>
              </div>
            )}
          </GlassCard>
        </div>
      );
    }

    return this.props.children;
  }
}

// Section-level error boundary with smaller UI footprint
interface SectionErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  title?: string;
  className?: string;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class SectionErrorBoundary extends Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
  public state: SectionErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('SectionErrorBoundary caught error', error, { componentStack: errorInfo.componentStack });
    this.props.onError?.(error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className={`p-4 rounded-xl bg-red-500/5 border border-red-500/20 ${this.props.className || ''}`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-medium text-red-300">
              {this.props.title || 'Failed to load content'}
            </span>
          </div>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={this.handleReset}
            className="text-xs border-red-500/30 hover:bg-red-500/10"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook for functional components to catch async errors
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  const handleError = React.useCallback((err: unknown) => {
    if (err instanceof Error) {
      setError(err);
    } else {
      setError(new Error(String(err)));
    }
  }, []);

  return handleError;
}

// Higher-order component for wrapping components with error boundary
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
): React.FC<P> {
  return function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary {...errorBoundaryProps}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
