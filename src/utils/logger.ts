export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type LogData = Record<string, unknown>

type LogEntry = {
  timestamp: string
  level: LogLevel
  scope: string
  message?: string
  data?: LogData
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',  // gray
  info: '\x1b[36m',   // cyan
  warn: '\x1b[33m',   // yellow
  error: '\x1b[31m',  // red
}

const RESET_COLOR = '\x1b[0m'

export type LoggerOptions = {
  level: LogLevel
  jsonOutput: boolean
  colorize: boolean
}

export type Logger = {
  debug: (scope: string, data?: LogData, message?: string) => void
  info: (scope: string, data?: LogData, message?: string) => void
  warn: (scope: string, data?: LogData, message?: string) => void
  error: (scope: string, data?: LogData, message?: string) => void
  child: (scope: string) => ScopedLogger
}

export type ScopedLogger = {
  debug: (data?: LogData, message?: string) => void
  info: (data?: LogData, message?: string) => void
  warn: (data?: LogData, message?: string) => void
  error: (data?: LogData, message?: string) => void
}

function formatHumanReadable(entry: LogEntry, colorize: boolean): string {
  const color = colorize ? LOG_LEVEL_COLORS[entry.level] : ''
  const reset = colorize ? RESET_COLOR : ''
  const levelStr = entry.level.toUpperCase().padEnd(5)
  const time = entry.timestamp.split('T')[1]?.slice(0, 8) ?? entry.timestamp

  let line = `${color}[${time}] ${levelStr}${reset} [${entry.scope}]`

  if (entry.message) {
    line += ` ${entry.message}`
  }

  if (entry.data && Object.keys(entry.data).length > 0) {
    const dataStr = Object.entries(entry.data)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ')
    line += ` ${dataStr}`
  }

  return line
}

function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry)
}

export function createLogger(options: Partial<LoggerOptions> = {}): Logger {
  const opts: LoggerOptions = {
    level: options.level ?? 'info',
    jsonOutput: options.jsonOutput ?? false,
    colorize: options.colorize ?? process.stdout.isTTY ?? false,
  }

  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[opts.level]
  }

  const log = (level: LogLevel, scope: string, data?: LogData, message?: string): void => {
    if (!shouldLog(level)) return

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      scope,
      ...(message && { message }),
      ...(data && Object.keys(data).length > 0 && { data }),
    }

    const output = opts.jsonOutput
      ? formatJson(entry)
      : formatHumanReadable(entry, opts.colorize)

    if (level === 'error' || level === 'warn') {
      process.stderr.write(output + '\n')
    } else {
      process.stdout.write(output + '\n')
    }
  }

  const logger: Logger = {
    debug: (scope, data, message) => log('debug', scope, data, message),
    info: (scope, data, message) => log('info', scope, data, message),
    warn: (scope, data, message) => log('warn', scope, data, message),
    error: (scope, data, message) => log('error', scope, data, message),
    child: (scope: string): ScopedLogger => ({
      debug: (data, message) => log('debug', scope, data, message),
      info: (data, message) => log('info', scope, data, message),
      warn: (data, message) => log('warn', scope, data, message),
      error: (data, message) => log('error', scope, data, message),
    }),
  }

  return logger
}

// Default logger instance
let defaultLogger: Logger | undefined

export function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger()
  }
  return defaultLogger
}

export function setDefaultLogger(logger: Logger): void {
  defaultLogger = logger
}
