/**
 * Simple logger utility for pg-agent-memory
 * Provides structured logging with minimal overhead
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

export interface LoggerConfig {
  level?: LogLevel;
  prefix?: string;
}

class Logger {
  private level: LogLevel;
  private readonly prefix: string;

  constructor(config: LoggerConfig = {}) {
    this.level =
      config.level ?? (process.env.NODE_ENV === 'production' ? LogLevel.WARN : LogLevel.INFO);
    this.prefix = config.prefix ?? '[pg-agent-memory]';
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `${timestamp} ${this.prefix} ${level} ${message}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      // eslint-disable-next-line no-console
      console.debug(this.formatMessage('[DEBUG]', message), ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      // eslint-disable-next-line no-console
      console.log(this.formatMessage('[INFO]', message), ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      // eslint-disable-next-line no-console
      console.warn(this.formatMessage('[WARN]', message), ...args);
    }
  }

  error(message: string, error?: Error): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      // eslint-disable-next-line no-console
      console.error(this.formatMessage('[ERROR]', message), error);
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

// Export singleton instance
export const logger = new Logger();

// Also export constructor for custom instances
export { Logger };
