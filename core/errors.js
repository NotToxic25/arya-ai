/**
 * core/errors.js
 * Standardized error hierarchy for Arya. All modules should throw/catch
 * these instead of raw Error/string, so the UI and logger can present
 * meaningful, consistent messages and never fabricate success.
 */

export class AryaError extends Error {
  /**
   * @param {string} message - human-readable message
   * @param {Object} [options]
   * @param {string} [options.code] - machine-readable error code
   * @param {Error} [options.cause] - underlying error, if any
   * @param {Object} [options.context] - extra debugging context
   */
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code ?? 'ARYA_ERROR';
    this.cause = options.cause;
    this.context = options.context ?? {};
    this.timestamp = new Date().toISOString();
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      cause: this.cause ? String(this.cause.message ?? this.cause) : undefined,
    };
  }
}

/** Configuration is missing or invalid (e.g., required API key not set). */
export class ConfigError extends AryaError {
  constructor(message, options = {}) {
    super(message, { code: 'CONFIG_ERROR', ...options });
  }
}

/** Network/API call failed (fetch error, non-2xx, timeout, etc.). */
export class NetworkError extends AryaError {
  constructor(message, options = {}) {
    super(message, { code: 'NETWORK_ERROR', ...options });
  }
}

/** A required browser permission (mic, notifications, etc.) was denied or unavailable. */
export class PermissionError extends AryaError {
  constructor(message, options = {}) {
    super(message, { code: 'PERMISSION_ERROR', ...options });
  }
}

/** A tool call failed validation or execution. */
export class ToolError extends AryaError {
  constructor(message, options = {}) {
    super(message, { code: 'TOOL_ERROR', ...options });
  }
}

/** Something the user requested is not technically possible in this environment (browser). */
export class UnsupportedFeatureError extends AryaError {
  constructor(message, options = {}) {
    super(message, { code: 'UNSUPPORTED_FEATURE', ...options });
  }
}

/** Local storage / persistence layer failed. */
export class StorageError extends AryaError {
  constructor(message, options = {}) {
    super(message, { code: 'STORAGE_ERROR', ...options });
  }
}

/** Browser voice capture, recognition, synthesis, or playback failed. */
export class VoiceError extends AryaError {
  constructor(message, options = {}) {
    super(message, { code: 'VOICE_ERROR', ...options });
    this.kind = options.kind ?? 'unknown';
    this.recoverable = options.recoverable ?? false;
  }
}

/**
 * Wraps an async function so thrown errors are normalized to AryaError
 * subclasses instead of leaking raw exceptions. Never swallows errors.
 */
export async function safeAsync(fn, { errorClass = AryaError, message = 'Operation failed', context = {} } = {}) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AryaError) throw err;
    throw new errorClass(message, { cause: err, context });
  }
}
