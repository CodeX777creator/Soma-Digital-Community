"use client";

import Link from "next/link";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { getErrorActionLabel, toAppError } from "@/lib/errors";
import { cn } from "@/lib/utils";

type ErrorStateProps = {
  error?: unknown;
  title?: string;
  message?: string;
  className?: string;
  onRetry?: () => void;
  actionHref?: string;
  actionLabel?: string;
};

type SectionErrorBoundaryProps = {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  className?: string;
};

type SectionErrorBoundaryState = {
  error: unknown;
};

export class SectionErrorBoundary extends Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
  state: SectionErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): SectionErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Keep this local so one broken product widget does not collapse the route.
    console.warn("Section boundary caught an error", { error, componentStack: info.componentStack });
  }

  render() {
    if (this.state.error) {
      return (
        <SectionErrorState
          error={this.state.error}
          title={this.props.fallbackTitle || "This section could not load"}
          message={this.props.fallbackMessage}
          className={this.props.className}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }

    return this.props.children;
  }
}

export function InlineErrorState({ error, title = "Something needs attention", message, className, onRetry, actionHref, actionLabel }: ErrorStateProps) {
  const appError = error ? toAppError(error) : null;
  const label = actionLabel || (appError ? getErrorActionLabel(appError) : "Try Again");
  return (
    <div className={cn("rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-50", className)}>
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-200" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-white">{title}</p>
          <p className="mt-1 leading-6 text-red-50/85">{message || appError?.userMessage || "Please try again."}</p>
          {appError?.requestId ? <p className="mt-2 text-xs text-red-50/65">Reference: {appError.requestId}</p> : null}
        </div>
      </div>
      {onRetry || actionHref ? (
        <div className="mt-3">
          {actionHref ? (
            <Button asChild size="sm" variant="outline" className="border-red-300/25 bg-red-300/10">
              <Link href={actionHref}>
                {label}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onRetry} className="border-red-300/25 bg-red-300/10">
              <RefreshCw className="h-3.5 w-3.5" />
              {label}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function SectionErrorState(props: ErrorStateProps) {
  return (
    <div className={cn("rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-5", props.className)}>
      <InlineErrorState {...props} className="border-white/[0.08] bg-white/[0.04]" />
    </div>
  );
}

export function RecoverableErrorCard(props: ErrorStateProps) {
  const appError = props.error ? toAppError(props.error) : null;
  return (
    <GlassCard className={cn("p-6 text-center", props.className)}>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/10">
        <AlertCircle className="h-6 w-6 text-red-200" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-white">{props.title || "This area could not load"}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#BFC6D4]">
        {props.message || appError?.userMessage || "Please try again. If this keeps happening, contact support with the reference below."}
      </p>
      {appError?.requestId ? <p className="mt-3 text-xs text-[#7E8799]">Reference: {appError.requestId}</p> : null}
      <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
        {props.onRetry ? (
          <Button type="button" onClick={props.onRetry} variant="outline" className="rounded-2xl">
            <RefreshCw className="h-4 w-4" />
            {props.actionLabel || "Try Again"}
          </Button>
        ) : null}
        {props.actionHref ? (
          <Button asChild className="rounded-2xl">
            <Link href={props.actionHref}>
              {props.actionLabel || "Continue"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : null}
      </div>
    </GlassCard>
  );
}

export function ErrorActionButton({ error, href, onClick }: { error?: unknown; href?: string; onClick?: () => void }) {
  const label = getErrorActionLabel(error);
  if (href) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href={href}>{label}</Link>
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" onClick={onClick}>
      {label}
    </Button>
  );
}
