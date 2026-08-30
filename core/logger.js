/**
 * core/logger.js
 * Centralized logging with levels: DEBUG, INFO, WARN, ERROR.
 * No external dependencies. Safe for browser environments.
 */

export const LogLevel = Object.freeze({
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4,
});

const LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'SILENT'];

const STYLES = {
  DEBUG: 'color:#888',
  INFO: 'color:#2b8a3e',
  WARN: 'color:#e8590c',
  ERROR: 'color:#c92a2a;font-weight:bold',
};

class Logger {
  /**
   * @param {Object} options
   * @param {number} options.level - minimum LogLevel to emit
   * @param {string} options.namespace - label prefix for this logger instance
   * @param {number} options.maxHistory - max number of log entries to retain in memory
   */
  constructor(options = {}) {
    this.level = options.level ?? LogLevel.INFO;
    this.namespace = options.namespace ?? 'Arya';
    this.maxHistory = options.maxHistory ?? 500;
    this.history = [];
    this._sinks = [];
  }

  /** Register an additional sink: fn(entry) => void. Errors in sinks are swallowed. */
  addSink(fn) {
    if (typeof fn === 'function') this._sinks.push(fn);
  }

  setLevel(level) {
    if (typeof level === 'string') {
      const idx = LEVEL_NAMES.indexOf(level.toUpperCase());
      if (idx === -1) throw new Error(`Unknown log level: ${level}`);
      this.level = idx;
    } else if (typeof level === 'number') {
      this.level = level;
    } else {
      throw new TypeError('level must be a string or number');
    }
  }

  child(namespace) {
    const c = new Logger({ level: this.level, namespace: `${this.namespace}:${namespace}`, maxHistory: this.maxHistory });
    c._sinks = this._sinks;
    c.history = this.history; // share history buffer with parent
    return c;
  }

  _log(levelIdx, levelName, args) {
    if (levelIdx < this.level) return;
    const entry = {
      time: new Date().toISOString(),
      level: levelName,
      namespace: this.namespace,
      message: args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack ?? ''}` : a)),
    };
    this.history.push(entry);
    if (this.history.length > this.maxHistory) this.history.shift();

    const prefix = `[${entry.time}] [${levelName}] [${this.namespace}]`;
    if (typeof window !== 'undefined' && typeof console.log === 'function' && STYLES[levelName]) {
      // Browser: styled console output
      const consoleFn = levelName === 'ERROR' ? console.error : levelName === 'WARN' ? console.warn : console.log;
      consoleFn(`%c${prefix}`, STYLES[levelName], ...entry.message);
    } else {
      const consoleFn = levelName === 'ERROR' ? console.error : levelName === 'WARN' ? console.warn : console.log;
      consoleFn(prefix, ...entry.message);
    }

    for (const sink of this._sinks) {
      try {
        sink(entry);
      } catch (_) {
        // Never let a sink crash the logger.
      }
    }
  }

  debug(...args) { this._log(LogLevel.DEBUG, 'DEBUG', args); }
  info(...args) { this._log(LogLevel.INFO, 'INFO', args); }
  warn(...args) { this._log(LogLevel.WARN, 'WARN', args); }
  error(...args) { this._log(LogLevel.ERROR, 'ERROR', args); }

  /** Returns a shallow copy of recent log history, optionally filtered by level. */
  getHistory(levelFilter) {
    if (!levelFilter) return [...this.history];
    return this.history.filter((e) => e.level === levelFilter.toUpperCase());
  }

  clearHistory() {
    this.history.length = 0;
  }
}

// Singleton root logger used across the app; modules can call .child('name') for a namespaced logger.
export const rootLogger = new Logger({ level: LogLevel.INFO, namespace: 'Arya' });

export default Logger;
