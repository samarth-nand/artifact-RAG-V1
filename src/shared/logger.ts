import { getEnv } from "./env";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let envCache: any = null;

function getLogLevel(): number {
  try {
    if (!envCache) {
      envCache = getEnv();
    }
    const level = envCache.LOG_LEVEL as LogLevel;
    return LOG_LEVELS[level] ?? LOG_LEVELS.info;
  } catch {
    return LOG_LEVELS.info; // Default to info if env validation fails
  }
}

class Logger {
  private level: number;

  constructor() {
    this.level = getLogLevel();
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= this.level;
  }

  private formatLog(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    if (data) {
      return `${prefix} ${message} ${JSON.stringify(data)}`;
    }
    return `${prefix} ${message}`;
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog("debug")) {
      console.log(this.formatLog("debug", message, data));
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog("info")) {
      console.log(this.formatLog("info", message, data));
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatLog("warn", message, data));
    }
  }

  error(message: string, error?: unknown): void {
    if (this.shouldLog("error")) {
      let errorData = error;
      if (error instanceof Error) {
        const causeValue = (error as any).cause;
        errorData = {
          message: error.message,
          stack: error.stack,
          cause:
            causeValue instanceof Error
              ? { message: causeValue.message, stack: causeValue.stack }
              : causeValue ?? undefined,
        };
      }
      console.error(this.formatLog("error", message, errorData));
    }
  }
}

export const logger = new Logger();
