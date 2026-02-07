import { z } from 'zod'

/**
 * An issue found during review
 */
export const ReviewIssueSchema = z.object({
  severity: z.enum(['error', 'warning', 'suggestion']).describe('How serious the issue is'),
  file: z.string().describe('File path where the issue was found'),
  description: z.string().describe('Description of the issue'),
  suggestedFix: z.string().optional().describe('How to fix the issue'),
})

export type ReviewIssue = z.infer<typeof ReviewIssueSchema>

/**
 * Input to the reviewer agent
 */
export const ReviewerInputSchema = z.object({
  originalRequest: z.string().describe('The original user request'),
  task: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
  }).describe('The task being reviewed'),
  changes: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })).describe('The code changes to review'),
  projectDependencies: z.array(z.string()).optional().describe('List of installed packages'),
})

export type ReviewerInput = z.infer<typeof ReviewerInputSchema>

/**
 * Output from the reviewer agent
 */
export const ReviewerOutputSchema = z.object({
  passed: z.boolean().describe('Whether the review passed'),
  issues: z.array(ReviewIssueSchema).describe('Issues found during review'),
  summary: z.string().describe('Summary of the review'),
})

export type ReviewerOutput = z.infer<typeof ReviewerOutputSchema>
