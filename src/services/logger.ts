/**
 * Structured Logging Service
 * Provides consistent logging with levels, timestamps, and structured metadata
 * Can be extended for remote logging in production
 */

import { Platform } from 'react-native';

// Log levels in order of severity
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Log level names for output
const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

// Log entry structure
export interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  timestamp: string;
  data?: Record<string, any>;
  error?: Error;
}

// Logger configuration
interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  enableRemote: boolean;
  remoteEndpoint?: string;
  includeTimestamps: boolean;
  isDevelopment: boolean;
}

// Default configuration
const defaultConfig: LoggerConfig = {
  minLevel: __DEV__ ? LogLevel.DEBUG : LogLevel.INFO,
  enableConsole: true,
  enableRemote: false,
  remoteEndpoint: undefined,
  includeTimestamps: true,
  isDevelopment: __DEV__,
};

class LoggerService {
  private config: LoggerConfig;
  private logBuffer: LogEntry[] = [];
  private maxBufferSize = 100;

  constructor() {
    this.config = { ...defaultConfig };
  }

  /**
   * Configure the logger
   */
  configure(options: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...options };
  }

  /**
   * Set minimum log level
   */
  setMinLevel(level: LogLevel): void {
    this.config.minLevel = level;
  }

  /**
   * Enable remote logging
   */
  enableRemoteLogging(endpoint: string): void {
    this.config.enableRemote = true;
    this.config.remoteEndpoint = endpoint;
  }

  /**
   * Create a module-specific logger
   */
  createLogger(module: string): ModuleLogger {
    return new ModuleLogger(module, this);
  }

  /**
   * Internal log method
   */
  log(entry: LogEntry): void {
    // Check log level
    if (entry.level < this.config.minLevel) {
      return;
    }

    // Add to buffer
    this.addToBuffer(entry);

    // Console output
    if (this.config.enableConsole) {
      this.outputToConsole(entry);
    }

    // Remote logging
    if (this.config.enableRemote && this.config.remoteEndpoint) {
      this.sendToRemote(entry);
    }
  }

  /**
   * Output to console with proper formatting
   */
  private outputToConsole(entry: LogEntry): void {
    const prefix = this.config.includeTimestamps
      ? `[${entry.timestamp}] `
      : '';
    const moduleTag = `[${entry.module}]`;
    const formattedMessage = `${prefix}${moduleTag} ${entry.message}`;

    // Choose console method based on level
    switch (entry.level) {
      case LogLevel.DEBUG:
        if (this.config.isDevelopment) {
          // eslint-disable-next-line no-console
          console.debug(formattedMessage, entry.data || '');
        }
        break;
      case LogLevel.INFO:
        // eslint-disable-next-line no-console
        console.log(formattedMessage, entry.data || '');
        break;
      case LogLevel.WARN:
        // eslint-disable-next-line no-console
        console.warn(formattedMessage, entry.data || '');
        break;
      case LogLevel.ERROR:
        // eslint-disable-next-line no-console
        console.error(formattedMessage, entry.data || '', entry.error || '');
        break;
    }
  }

  /**
   * Send log to remote endpoint
   */
  private async sendToRemote(entry: LogEntry): Promise<void> {
    if (!this.config.remoteEndpoint) return;

    try {
      const payload = {
        ...entry,
        levelName: LOG_LEVEL_NAMES[entry.level],
        platform: Platform.OS,
        version: Platform.Version,
      };

      await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      // Silently fail - don't log errors about logging
    }
  }

  /**
   * Add entry to buffer (for later retrieval/debugging)
   */
  private addToBuffer(entry: LogEntry): void {
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }
  }

  /**
   * Get recent log entries (for debugging)
   */
  getRecentLogs(count: number = 50): LogEntry[] {
    return this.logBuffer.slice(-count);
  }

  /**
   * Clear log buffer
   */
  clearBuffer(): void {
    this.logBuffer = [];
  }
}

/**
 * Module-specific logger with bound module name
 */
class ModuleLogger {
  private module: string;
  private service: LoggerService;

  constructor(module: string, service: LoggerService) {
    this.module = module;
    this.service = service;
  }

  private createEntry(
    level: LogLevel,
    message: string,
    data?: Record<string, any>,
    error?: Error
  ): LogEntry {
    return {
      level,
      module: this.module,
      message,
      timestamp: new Date().toISOString(),
      data,
      error,
    };
  }

  /**
   * Log debug message (only in development)
   */
  debug(message: string, data?: Record<string, any>): void {
    this.service.log(this.createEntry(LogLevel.DEBUG, message, data));
  }

  /**
   * Log info message
   */
  info(message: string, data?: Record<string, any>): void {
    this.service.log(this.createEntry(LogLevel.INFO, message, data));
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: Record<string, any>): void {
    this.service.log(this.createEntry(LogLevel.WARN, message, data));
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | unknown, data?: Record<string, any>): void {
    const errorObj = error instanceof Error ? error : undefined;
    const errorData = error && !(error instanceof Error) ? { errorValue: error } : {};
    this.service.log(
      this.createEntry(LogLevel.ERROR, message, { ...data, ...errorData }, errorObj)
    );
  }
}

// Singleton instance
export const loggerService = new LoggerService();

// Pre-configured module loggers for common services
export const logger = {
  // Create a logger for any module
  create: (module: string) => loggerService.createLogger(module),

  // Pre-configured loggers for common modules
  app: loggerService.createLogger('App'),
  auth: loggerService.createLogger('Auth'),
  api: loggerService.createLogger('API'),
  chat: loggerService.createLogger('Chat'),
  health: loggerService.createLogger('HealthData'),
  calendar: loggerService.createLogger('Calendar'),
  medication: loggerService.createLogger('Medication'),
  weather: loggerService.createLogger('Weather'),
  contacts: loggerService.createLogger('Contacts'),
  proactive: loggerService.createLogger('Proactive'),
  vault: loggerService.createLogger('Vault'),
  careCircle: loggerService.createLogger('CareCircle'),
  sync: loggerService.createLogger('Sync'),
  storage: loggerService.createLogger('Storage'),
  tts: loggerService.createLogger('TTS'),
  notifications: loggerService.createLogger('Notifications'),
};

export default logger;
