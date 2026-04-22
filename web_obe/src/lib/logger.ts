/**
 * Client-Side Logger for Go Lightly
 *
 * Provides structured console logging for browser-based debugging.
 * Logs are visible in browser dev tools (F12 → Console).
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('User logged in', { email: user.email });
 *   logger.error('API call failed', { error: err.message });
 */

type LogLevel = 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: any;
}

class ClientLogger {
  private appName = 'GoLightly';
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NEXT_PUBLIC_MODE === 'development';
  }

  /**
   * Get formatted timestamp
   */
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Sanitize data to remove sensitive information
   */
  private sanitize(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = { ...data };
    const sensitiveKeys = [
      'password',
      'token',
      'accessToken',
      'idToken',
      'credential',
      'authorization',
      'secret',
      'apiKey',
    ];

    // Remove sensitive keys
    for (const key of sensitiveKeys) {
      if (key in sanitized) {
        sanitized[key] = '[REDACTED]';
      }
    }

    // Recursively sanitize nested objects
    for (const key in sanitized) {
      if (sanitized[key] && typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitize(sanitized[key]);
      }
    }

    return sanitized;
  }

  /**
   * Format log message
   */
  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = this.getTimestamp();
    const prefix = `[${this.appName}] [${level.toUpperCase()}]`;

    if (context && Object.keys(context).length > 0) {
      const sanitizedContext = this.sanitize(context);
      return `${prefix} ${timestamp} - ${message} ${JSON.stringify(sanitizedContext)}`;
    }

    return `${prefix} ${timestamp} - ${message}`;
  }

  /**
   * Log informational message
   */
  info(message: string, context?: LogContext): void {
    const formatted = this.formatMessage('info', message, context);
    console.log(formatted);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    const formatted = this.formatMessage('warn', message, context);
    console.warn(formatted);
  }

  /**
   * Log error message
   */
  error(message: string, context?: LogContext): void {
    const formatted = this.formatMessage('error', message, context);
    console.error(formatted);
  }

  /**
   * Log debug message (only in development)
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      const formatted = this.formatMessage('info', `[DEBUG] ${message}`, context);
      console.log(formatted);
    }
  }

  /**
   * Group related logs together
   */
  group(label: string): void {
    console.group(`[${this.appName}] ${label}`);
  }

  /**
   * End log group
   */
  groupEnd(): void {
    console.groupEnd();
  }
}

// Export singleton instance
export const logger = new ClientLogger();
