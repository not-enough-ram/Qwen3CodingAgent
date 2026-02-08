import { z } from 'zod'

/**
 * A file change produced by the coder
 */
export const FileChangeSchema = z.object({
  path: z.string().describe('File path relative to project root'),
  content: z.string().describe('Full file content for creates, or new content for modifications'),
  diff: z.string().optional().describe('Optional unified diff for modifications'),
})

export type FileChange = z.infer<typeof FileChangeSchema>

/**
 * Input to the coder agent
 */
export const CoderInputSchema = z.object({
  task: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
  }).describe('The task being implemented'),
  plan: z.object({
    files: z.array(z.object({
      path: z.string(),
      operation: z.enum(['create', 'modify', 'delete']),
      description: z.string(),
    })),
    reasoning: z.string(),
  }).describe('The architect\'s file plan'),
  relevantFiles: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })).optional().describe('Contents of existing files that may need to be referenced'),
  reviewFeedback: z.object({
    issues: z.array(z.object({
      severity: z.enum(['error', 'warning', 'suggestion']),
      file: z.string(),
      description: z.string(),
      suggestedFix: z.string().optional(),
    })),
    summary: z.string(),
  }).optional().describe('Feedback from a previous review attempt'),
  dependencyContext: z.string().optional().describe('Dependency whitelist context for the coder prompt'),
  importValidationFeedback: z.string().optional().describe('Feedback about forbidden imports that must be fixed'),
})

export type CoderInput = z.infer<typeof CoderInputSchema>

/**
 * Output from the coder agent
 */
export const CoderOutputSchema = z.object({
  changes: z.array(FileChangeSchema).min(1).describe('File changes to apply'),
})

export type CoderOutput = z.infer<typeof CoderOutputSchema>
