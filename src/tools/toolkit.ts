import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve, relative, isAbsolute } from 'node:path'
import { spawnSync } from 'node:child_process'
import { type Result, ok, err, tryCatch } from '../utils/result.js'
import type { ToolError } from '../schemas/common.js'

export type CommandResult = {
  stdout: string
  stderr: string
  exitCode: number
}

export type ToolKit = {
  readFile: (path: string) => Result<string, ToolError>
  writeFile: (path: string, content: string) => Result<void, ToolError>
  listDirectory: (path: string) => Result<string[], ToolError>
  fileExists: (path: string) => boolean
  runCommand: (cmd: string, args: string[]) => Result<CommandResult, ToolError>
  getProjectRoot: () => string
}

const ALLOWED_COMMANDS = new Set([
  'tsc',
  'npm',
  'pnpm',
  'yarn',
  'node',
  'npx',
  'git',
])

const SHELL_META = /[;&|`$(){}!<>\\'"\n\r]/

const SENSITIVE_PATHS = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.git',
  '.gitignore',
  'package-lock.json',
  'pnpm-lock.yaml',
  '.qwen-agent-consent.json',
  '.agent-helper.json',
])

function isPathSafe(basePath: string, targetPath: string): boolean {
  const resolvedBase = resolve(basePath)
  const resolvedTarget = resolve(basePath, targetPath)
  return resolvedTarget.startsWith(resolvedBase)
}

function normalizePath(basePath: string, inputPath: string): string {
  if (isAbsolute(inputPath)) {
    return relative(basePath, inputPath)
  }
  return inputPath
}

function isSensitivePath(normalizedPath: string): boolean {
  const segments = normalizedPath.split('/')
  const firstSegment = segments[0] ?? ''
  return SENSITIVE_PATHS.has(normalizedPath) || SENSITIVE_PATHS.has(firstSegment)
}

export function createToolKit(projectRoot: string): ToolKit {
  const root = resolve(projectRoot)

  const readFile = (path: string): Result<string, ToolError> => {
    const normalizedPath = normalizePath(root, path)

    if (!isPathSafe(root, normalizedPath)) {
      return err({
        type: 'invalid_path',
        message: 'Path traversal not allowed',
        path,
      })
    }

    const fullPath = join(root, normalizedPath)

    if (!existsSync(fullPath)) {
      return err({
        type: 'not_found',
        message: `File not found: ${path}`,
        path,
      })
    }

    return tryCatch(
      () => readFileSync(fullPath, 'utf-8'),
      (): ToolError => ({
        type: 'permission_denied',
        message: `Cannot read file: ${path}`,
        path,
      })
    )
  }

  const writeFile = (path: string, content: string): Result<void, ToolError> => {
    const normalizedPath = normalizePath(root, path)

    if (!isPathSafe(root, normalizedPath)) {
      return err({
        type: 'invalid_path',
        message: 'Path traversal not allowed',
        path,
      })
    }

    if (isSensitivePath(normalizedPath)) {
      return err({
        type: 'permission_denied',
        message: `Writing to protected path is not allowed: ${path}`,
        path,
      })
    }

    const fullPath = join(root, normalizedPath)
    const dir = dirname(fullPath)

    return tryCatch(
      () => {
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true })
        }
        writeFileSync(fullPath, content, 'utf-8')
      },
      (): ToolError => ({
        type: 'permission_denied',
        message: `Cannot write file: ${path}`,
        path,
      })
    )
  }

  const listDirectory = (path: string): Result<string[], ToolError> => {
    const normalizedPath = normalizePath(root, path)

    if (!isPathSafe(root, normalizedPath)) {
      return err({
        type: 'invalid_path',
        message: 'Path traversal not allowed',
        path,
      })
    }

    const fullPath = join(root, normalizedPath)

    if (!existsSync(fullPath)) {
      return err({
        type: 'not_found',
        message: `Directory not found: ${path}`,
        path,
      })
    }

    return tryCatch(
      () => {
        const entries = readdirSync(fullPath)
        return entries.map((entry) => {
          const entryPath = join(fullPath, entry)
          const stat = statSync(entryPath)
          return stat.isDirectory() ? `${entry}/` : entry
        })
      },
      (): ToolError => ({
        type: 'permission_denied',
        message: `Cannot list directory: ${path}`,
        path,
      })
    )
  }

  const fileExists = (path: string): boolean => {
    const normalizedPath = normalizePath(root, path)
    if (!isPathSafe(root, normalizedPath)) {
      return false
    }
    return existsSync(join(root, normalizedPath))
  }

  const runCommand = (cmd: string, args: string[]): Result<CommandResult, ToolError> => {
    if (!ALLOWED_COMMANDS.has(cmd)) {
      return err({
        type: 'execution_failed',
        message: `Command not allowed: ${cmd}. Allowed: ${[...ALLOWED_COMMANDS].join(', ')}`,
      })
    }

    for (const arg of args) {
      if (SHELL_META.test(arg)) {
        return err({
          type: 'execution_failed',
          message: `Argument contains disallowed shell characters: ${arg}`,
        })
      }
    }

    const result = spawnSync(cmd, args, {
      cwd: root,
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    if (result.error) {
      const message = result.error.message
      if (message.includes('ETIMEDOUT') || message.includes('TIMEOUT')) {
        return err({
          type: 'timeout',
          message: 'Command timed out',
        })
      }
      if (message.includes('ENOENT')) {
        return err({
          type: 'execution_failed',
          message: `Command not found: ${cmd}`,
        })
      }
      return err({
        type: 'execution_failed',
        message: `Command failed: ${message}`,
      })
    }

    return ok({
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.status ?? 1,
    })
  }

  const getProjectRoot = (): string => root

  return {
    readFile,
    writeFile,
    listDirectory,
    fileExists,
    runCommand,
    getProjectRoot,
  }
}
