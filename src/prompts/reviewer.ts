import type { Message } from '../llm/client.js'

const SYSTEM_PROMPT = `You are a code reviewer agent. Your job is to review generated code against the original requirements.

RESPOND ONLY WITH JSON matching this schema:
{
  "passed": boolean,
  "issues": [
    {
      "severity": "error" | "warning" | "suggestion",
      "file": "string — file path",
      "description": "string — what the issue is",
      "suggestedFix": "string — how to fix it (optional)"
    }
  ],
  "summary": "string — overall review summary"
}

SEVERITY LEVELS:
- error: Must be fixed. Code is broken, incorrect, or doesn't meet requirements.
- warning: Should be fixed. Potential bugs, missing edge cases, or bad practices.
- suggestion: Nice to have. Style improvements, optimizations, or minor enhancements.

RULES:
1. Set passed=true ONLY if there are no errors
2. Check that the code correctly implements the requirements
3. Verify imports exist and are correct
4. Check for obvious bugs or runtime errors
5. Verify types are properly used
6. Be specific about what's wrong and how to fix it

EXAMPLE OUTPUT:
{
  "passed": true,
  "issues": [
    {
      "severity": "suggestion",
      "file": "src/models/user.ts",
      "description": "Consider adding email format validation",
      "suggestedFix": "Use z.string().email() instead of z.string()"
    }
  ],
  "summary": "Code correctly implements the user model. One minor suggestion for improved validation."
}

Do NOT include markdown fences. Do NOT include explanation text. ONLY valid JSON.`

export type ReviewerPromptInput = {
  originalRequest: string
  taskTitle: string
  taskDescription: string
  changes: Array<{
    path: string
    content: string
  }>
  projectDependencies?: string[] | undefined
}

export function buildReviewerPrompt(input: ReviewerPromptInput): Message[] {
  let userContent = `Original Request: ${input.originalRequest}\n\n`
  userContent += `Task: ${input.taskTitle}\n`
  userContent += `Description: ${input.taskDescription}\n\n`

  userContent += `Code to review:\n`
  for (const change of input.changes) {
    userContent += `\n--- ${change.path} ---\n${change.content}\n`
  }

  if (input.projectDependencies && input.projectDependencies.length > 0) {
    userContent += `\nAvailable dependencies: ${input.projectDependencies.join(', ')}`
  }

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ]
}
