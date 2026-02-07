import { z } from 'zod'

/**
 * A single task in the plan
 */
export const TaskSchema = z.object({
  id: z.string().describe('Unique task identifier'),
  title: z.string().describe('Short description of the task'),
  description: z.string().describe('Detailed requirements for the task'),
  dependsOn: z.array(z.string()).default([]).describe('IDs of tasks that must complete first'),
  estimatedFiles: z.array(z.string()).default([]).describe('File paths this task will likely touch'),
})

export type Task = z.output<typeof TaskSchema>

/**
 * Input to the planner agent
 */
export const PlannerInputSchema = z.object({
  request: z.string().describe('The user\'s development request'),
  projectContext: z.string().describe('Summary of the project structure and configuration'),
})

export type PlannerInput = z.infer<typeof PlannerInputSchema>

/**
 * Output from the planner agent
 */
export const PlannerOutputSchema = z.object({
  tasks: z.array(TaskSchema).min(1).describe('Ordered list of tasks to complete the request'),
})

export type PlannerOutput = z.output<typeof PlannerOutputSchema>
