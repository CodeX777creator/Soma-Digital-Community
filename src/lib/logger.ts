/**
 * Production logging utility
 * In development: logs to console
 * In production: can be configured to send to logging service
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: Error;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === "development";
  private logs: LogEntry[] = [];
  private readonly maxLogs = 1000;

  private createEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      error,
    };
  }

  private store(entry: LogEntry) {
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // In production, send to logging service
    if (!this.isDevelopment && typeof window !== "undefined") {
      // Send to your logging service (e.g., Sentry, LogRocket, DataDog)
      // this.sendToLoggingService(entry);
    }
  }

  debug(message: string, context?: Record<string, unknown>) {
    if (this.isDevelopment) {
      const entry = this.createEntry("debug", message, context);
      this.store(entry);
      console.debug(`[DEBUG] ${message}`, context);
    }
  }

  info(message: string, context?: Record<string, unknown>) {
    const entry = this.createEntry("info", message, context);
    this.store(entry);
    if (this.isDevelopment) {
      console.info(`[INFO] ${message}`, context);
    }
  }

  warn(message: string, context?: Record<string, unknown>) {
    const entry = this.createEntry("warn", message, context);
    this.store(entry);
    if (this.isDevelopment) {
      console.warn(`[WARN] ${message}`, context);
    }
  }

  error(message: string, error?: Error, context?: Record<string, unknown>) {
    const entry = this.createEntry("error", message, context, error);
    this.store(entry);
    if (this.isDevelopment) {
      console.error(`[ERROR] ${message}`, error, context);
    }
  }

  getLogs(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.logs.filter((log) => log.level === level);
    }
    return [...this.logs];
  }

  clear() {
    this.logs = [];
  }
}

export const logger = new Logger();

// React error boundary helper
export function logError(error: Error, errorInfo?: { componentStack?: string }) {
  logger.error("React component error", error, {
    componentStack: errorInfo?.componentStack,
  });
}

// API error helper
export function logApiError(
  endpoint: string,
  error: Error,
  requestData?: unknown
) {
  logger.error(`API Error: ${endpoint}`, error, {
    endpoint,
    requestData: requestData ? JSON.stringify(requestData) : undefined,
  });
}

// Firestore error helper
export function logFirestoreError(
  operation: string,
  error: Error,
  path?: string
) {
  logger.error(`Firestore Error: ${operation}`, error, {
    operation,
    path,
    code: (error as { code?: string }).code,
  });
}
/**
 * Production logging utility
 * In development: logs to console
 * In production: can be configured to send to logging service
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: Error;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === "development";
  private logs: LogEntry[] = [];
  private readonly maxLogs = 1000;

  private createEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      error,
    };
  }

  private store(entry: LogEntry) {
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // In production, send to logging service
    if (!this.isDevelopment && typeof window !== "undefined") {
      // Send to your logging service (e.g., Sentry, LogRocket, DataDog)
      // this.sendToLoggingService(entry);
    }
  }

  debug(message: string, context?: Record<string, unknown>) {
    if (this.isDevelopment) {
      const entry = this.createEntry("debug", message, context);
      this.store(entry);
      console.debug(`[DEBUG] ${message}`, context);
    }
  }

  info(message: string, context?: Record<string, unknown>) {
    const entry = this.createEntry("info", message, context);
    this.store(entry);
    if (this.isDevelopment) {
      console.info(`[INFO] ${message}`, context);
    }
  }

  warn(message: string, context?: Record<string, unknown>) {
    const entry = this.createEntry("warn", message, context);
    this.store(entry);
    // Always print warnings — Vercel/most hosts capture stdout/stderr in every
    // environment, and gating this on isDevelopment meant production warnings
    // were silently discarded (never sent anywhere else either).
    console.warn(`[WARN] ${message}`, context ?? "");
  }

  error(message: string, error?: Error, context?: Record<string, unknown>) {
    const entry = this.createEntry("error", message, context, error);
    this.store(entry);
    // Always print errors, in every environment. This was previously gated on
    // isDevelopment, which meant production errors (like unhandled API 500s)
    // were never written anywhere — not to the console, not to a logging
    // service (that call was commented out) — making them undebuggable.
    console.error(`[ERROR] ${message}`, error ?? "", context ?? "");
  }

  getLogs(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.logs.filter((log) => log.level === level);
    }
    return [...this.logs];
  }

  clear() {
    this.logs = [];
  }
}

export const logger = new Logger();

// React error boundary helper
export function logError(error: Error, errorInfo?: { componentStack?: string }) {
  logger.error("React component error", error, {
    componentStack: errorInfo?.componentStack,
  });
}

// API error helper
export function logApiError(
  endpoint: string,
  error: Error,
  requestData?: unknown
) {
  logger.error(`API Error: ${endpoint}`, error, {
    endpoint,
    requestData: requestData ? JSON.stringify(requestData) : undefined,
  });
}

// Firestore error helper
export function logFirestoreError(
  operation: string,
  error: Error,
  path?: string
) {
  logger.error(`Firestore Error: ${operation}`, error, {
    operation,
    path,
    code: (error as { code?: string }).code,
  });
}