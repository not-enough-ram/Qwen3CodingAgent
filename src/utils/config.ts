import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { type Result, ok, err, tryCatch } from './result.js'

const LLMConfigSchema = z.object({
  baseUrl: z.string().default('http://localhost:11434/v1'),
  model: z.string().default('qwen3-coder:30b'),
  apiKey: z.string().default(''),
  maxTokens: z.number().positive().default(4096),
  temperature: z.number().min(0).max(2).default(0.2),
})

const PipelineConfigSchema = z.object({
  maxReviewRetries: z.number().int().min(0).max(10).default(2),
  maxSchemaRetries: z.number().int().min(1).max(10).default(3),
  applyChangesAutomatically: z.boolean().default(false),
})

const ContextConfigSchema = z.object({
  maxFileSize: z.number().positive().default(10000),
  maxDirectoryDepth: z.number().int().min(1).max(10).default(3),
  ignorePatterns: z.array(z.string()).default(['node_modules', '.git', 'dist', 'build']),
})

const ConfigSchema = z.object({
  llm: LLMConfigSchema.default({}),
  pipeline: PipelineConfigSchema.default({}),
  context: ContextConfigSchema.default({}),
})

export type LLMConfig = z.infer<typeof LLMConfigSchema>
export type PipelineConfig = z.infer<typeof PipelineConfigSchema>
export type ContextConfig = z.infer<typeof ContextConfigSchema>
export type Config = z.infer<typeof ConfigSchema>

export type ConfigError = {
  type: 'file_read' | 'parse' | 'validation'
  message: string
  details?: unknown
}

const CONFIG_FILENAME = '.agent-helper.json'

function getEnvOverrides(): Partial<Config> {
  const overrides: Partial<Config> = {}

  const llmOverrides: Partial<LLMConfig> = {}

  if (process.env['LLM_BASE_URL']) {
    llmOverrides.baseUrl = process.env['LLM_BASE_URL']
  }
  if (process.env['LLM_MODEL']) {
    llmOverrides.model = process.env['LLM_MODEL']
  }
  if (process.env['LLM_API_KEY']) {
    llmOverrides.apiKey = process.env['LLM_API_KEY']
  }
  if (process.env['LLM_MAX_TOKENS']) {
    const parsed = parseInt(process.env['LLM_MAX_TOKENS'], 10)
    if (!isNaN(parsed)) {
      llmOverrides.maxTokens = parsed
    }
  }

  if (Object.keys(llmOverrides).length > 0) {
    overrides.llm = llmOverrides as LLMConfig
  }

  return overrides
}

function mergeConfigs(base: Config, overrides: Partial<Config>): Config {
  return {
    llm: { ...base.llm, ...overrides.llm },
    pipeline: { ...base.pipeline, ...overrides.pipeline },
    context: { ...base.context, ...overrides.context },
  }
}

export function loadConfigFromFile(projectPath: string): Result<Partial<Config>, ConfigError> {
  const configPath = join(projectPath, CONFIG_FILENAME)

  if (!existsSync(configPath)) {
    return ok({})
  }

  const readResult = tryCatch(
    () => readFileSync(configPath, 'utf-8'),
    (e): ConfigError => ({
      type: 'file_read',
      message: `Failed to read config file: ${configPath}`,
      details: e,
    })
  )

  if (!readResult.ok) {
    return readResult
  }

  const parseResult = tryCatch(
    () => JSON.parse(readResult.value) as unknown,
    (e): ConfigError => ({
      type: 'parse',
      message: 'Invalid JSON in config file',
      details: e,
    })
  )

  if (!parseResult.ok) {
    return parseResult
  }

  return ok(parseResult.value as Partial<Config>)
}

export function loadConfig(projectPath: string = process.cwd()): Result<Config, ConfigError> {
  const fileConfigResult = loadConfigFromFile(projectPath)

  if (!fileConfigResult.ok) {
    return fileConfigResult
  }

  const envOverrides = getEnvOverrides()

  const mergedPartial = {
    ...fileConfigResult.value,
    llm: { ...fileConfigResult.value.llm, ...envOverrides.llm },
    pipeline: { ...fileConfigResult.value.pipeline, ...envOverrides.pipeline },
    context: { ...fileConfigResult.value.context, ...envOverrides.context },
  }

  const validationResult = ConfigSchema.safeParse(mergedPartial)

  if (!validationResult.success) {
    return err({
      type: 'validation',
      message: 'Invalid configuration',
      details: validationResult.error.format(),
    })
  }

  return ok(validationResult.data)
}

export function getDefaultConfig(): Config {
  return ConfigSchema.parse({})
}
