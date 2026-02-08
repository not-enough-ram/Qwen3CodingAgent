import type { Message } from '../llm/client.js'

const SYSTEM_PROMPT = `You are a software coder agent. Your job is to generate code changes based on an architecture plan.

RESPOND ONLY WITH JSON matching this schema:
{
  "changes": [
    {
      "path": "string — file path relative to project root",
      "content": "string — full file content"
    }
  ]
}

RULES:
1. Generate complete, working code for each file
2. Follow the architecture plan exactly
3. Use proper imports and exports
4. Follow existing code conventions in the project
5. Include appropriate error handling
6. Do NOT include explanatory comments unless they add value
7. Make sure all types are properly defined

EXAMPLE OUTPUT:
{
  "changes": [
    {
      "path": "src/models/user.ts",
      "content": "import { z } from 'zod'\\n\\nexport const UserSchema = z.object({\\n  id: z.string(),\\n  email: z.string().email(),\\n  name: z.string(),\\n})\\n\\nexport type User = z.infer<typeof UserSchema>\\n"
    }
  ]
}

Do NOT include markdown fences. Do NOT include explanation text. ONLY valid JSON.`

export type CoderPromptInput = {
  taskTitle: string
  taskDescription: string
  plan: {
    files: Array<{
      path: string
      operation: string
      description: string
    }>
    reasoning: string
  }
  relevantFiles?: Array<{
    path: string
    content: string
  }> | undefined
  reviewFeedback?: {
    issues: Array<{
      severity: string
      file: string
      description: string
      suggestedFix?: string | undefined
    }>
    summary: string
  } | undefined
  dependencyContext?: string | undefined
  importValidationFeedback?: string | undefined
}

export function buildCoderPrompt(input: CoderPromptInput): Message[] {
  let systemContent = SYSTEM_PROMPT
  if (input.dependencyContext) {
    systemContent += `\n\n${input.dependencyContext}`
  }

  let userContent = `Task: ${input.taskTitle}\n`
  userContent += `Description: ${input.taskDescription}\n\n`

  userContent += `Architecture Plan:\n`
  userContent += `Reasoning: ${input.plan.reasoning}\n`
  userContent += `Files to change:\n`
  for (const file of input.plan.files) {
    userContent += `- ${file.path} (${file.operation}): ${file.description}\n`
  }

  if (input.relevantFiles && input.relevantFiles.length > 0) {
    userContent += `\nExisting file contents:\n`
    for (const file of input.relevantFiles) {
      userContent += `\n--- ${file.path} ---\n${file.content}\n`
    }
  }

  if (input.reviewFeedback) {
    userContent += `\n\nPREVIOUS REVIEW FEEDBACK (fix these issues):\n`
    userContent += `Summary: ${input.reviewFeedback.summary}\n`
    for (const issue of input.reviewFeedback.issues) {
      userContent += `- [${issue.severity}] ${issue.file}: ${issue.description}`
      if (issue.suggestedFix) {
        userContent += ` (Suggested fix: ${issue.suggestedFix})`
      }
      userContent += '\n'
    }
  }

  if (input.importValidationFeedback) {
    userContent += `\n\nIMPORT VALIDATION FAILURE (you MUST fix these):\n`
    userContent += input.importValidationFeedback
    userContent += '\n\nRewrite the code using ONLY installed packages and Node.js built-in modules.\n'
  }

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ]
}
