import { loadConfig } from '../../utils/config.js'
import { createLLMClient } from '../../llm/client.js'

type DoctorOptions = {
  project: string
}

export async function doctorCommand(options: DoctorOptions): Promise<void> {
  console.log('Agent Helper Doctor')
  console.log('===================\n')

  // Check configuration
  console.log('Checking configuration...')
  const configResult = loadConfig(options.project)

  if (!configResult.ok) {
    console.error(`\u274c Configuration error: ${configResult.error.message}`)
    if (configResult.error.details) {
      console.error(`   Details: ${JSON.stringify(configResult.error.details, null, 2)}`)
    }
    process.exit(1)
  }

  const config = configResult.value
  console.log(`\u2705 Configuration loaded`)
  console.log(`   LLM Base URL: ${config.llm.baseUrl}`)
  console.log(`   Model: ${config.llm.model}`)
  console.log(`   Max Tokens: ${config.llm.maxTokens}`)
  console.log('')

  // Check LLM connectivity
  console.log('Checking LLM connectivity...')
  const llm = createLLMClient(config.llm)

  const testResult = await llm.generate([
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Say "hello" and nothing else.' },
  ])

  if (!testResult.ok) {
    console.error(`\u274c LLM connection failed: ${testResult.error.message}`)
    if (testResult.error.type === 'connection') {
      console.error(`\n   Make sure your LLM server is running at: ${config.llm.baseUrl}`)
      console.error('   Common fixes:')
      console.error('   - Start your local LLM server (vLLM, Ollama, etc.)')
      console.error('   - Check the LLM_BASE_URL environment variable')
      console.error('   - Verify the port number is correct')
    }
    process.exit(1)
  }

  console.log(`\u2705 LLM connection successful`)
  console.log(`   Response: "${testResult.value.trim()}"`)
  console.log('')

  // Check JSON output capability
  console.log('Checking structured output capability...')
  const jsonResult = await llm.generate([
    { role: 'system', content: 'Respond ONLY with valid JSON: {"status": "ok"}' },
    { role: 'user', content: 'Test' },
  ])

  if (!jsonResult.ok) {
    console.error(`\u274c JSON test failed: ${jsonResult.error.message}`)
    process.exit(1)
  }

  try {
    const parsed = JSON.parse(jsonResult.value.trim().replace(/```json?\n?|\n?```/g, ''))
    if (parsed.status === 'ok') {
      console.log(`\u2705 Structured output working`)
    } else {
      console.log(`\u26a0\ufe0f  Structured output returned unexpected value: ${JSON.stringify(parsed)}`)
    }
  } catch {
    console.log(`\u26a0\ufe0f  LLM did not return valid JSON. Response: "${jsonResult.value.trim()}"`)
    console.log('   The agent will retry with error feedback, but this may impact performance.')
  }

  console.log('')
  console.log('\u2705 All checks passed! Agent Helper is ready to use.')
}
