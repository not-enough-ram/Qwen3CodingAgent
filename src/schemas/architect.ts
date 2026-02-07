import { z } from 'zod'

/**
 * A file operation planned by the architect
 */
export const FileOperationSchema = z.object({
  path: z.string().describe('File path relative to project root'),
  operation: z.enum(['create', 'modify', 'delete']).describe('Type of operation'),
  description: z.string().describe('What changes will be made to this file'),
  interfaces: z.array(z.string()).optional().describe('Key type/interface names defined or used'),
  dependencies: z.array(z.string()).optional().describe('Imports needed from other modules'),
})

export type FileOperation = z.infer<typeof FileOperationSchema>

/**
 * Input to the architect agent
 */
export const ArchitectInputSchema = z.object({
  task: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
  }).describe('The task to plan'),
  projectContext: z.string().describe('Summary of the project structure'),
  existingFiles: z.array(z.string()).optional().describe('List of relevant existing file paths'),
})

export type ArchitectInput = z.infer<typeof ArchitectInputSchema>

/**
 * Output from the architect agent
 */
export const ArchitectOutputSchema = z.object({
  files: z.array(FileOperationSchema).min(1).describe('File-level plan for the task'),
  reasoning: z.string().describe('Brief explanation of structural decisions'),
})

export type ArchitectOutput = z.infer<typeof ArchitectOutputSchema>
