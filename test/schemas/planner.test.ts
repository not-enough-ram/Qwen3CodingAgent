import { describe, it, expect } from 'vitest'
import { PlannerOutputSchema, TaskSchema } from '../../src/schemas/planner.js'

describe('TaskSchema', () => {
  it('accepts valid task', () => {
    const result = TaskSchema.safeParse({
      id: 'task-1',
      title: 'Create user model',
      description: 'Define User type with validation',
    })
    expect(result.success).toBe(true)
  })

  it('accepts task with all fields', () => {
    const result = TaskSchema.safeParse({
      id: 'task-1',
      title: 'Create user model',
      description: 'Define User type with validation',
      dependsOn: ['task-0'],
      estimatedFiles: ['src/models/user.ts'],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.dependsOn).toEqual(['task-0'])
      expect(result.data.estimatedFiles).toEqual(['src/models/user.ts'])
    }
  })

  it('provides defaults for optional arrays', () => {
    const result = TaskSchema.safeParse({
      id: 'task-1',
      title: 'Test',
      description: 'Test',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.dependsOn).toEqual([])
      expect(result.data.estimatedFiles).toEqual([])
    }
  })

  it('rejects task without id', () => {
    const result = TaskSchema.safeParse({
      title: 'Test',
      description: 'Test',
    })
    expect(result.success).toBe(false)
  })
})

describe('PlannerOutputSchema', () => {
  it('accepts valid output with one task', () => {
    const result = PlannerOutputSchema.safeParse({
      tasks: [
        {
          id: 'task-1',
          title: 'Test task',
          description: 'Description',
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid output with multiple tasks', () => {
    const result = PlannerOutputSchema.safeParse({
      tasks: [
        { id: 'task-1', title: 'First', description: 'First task' },
        { id: 'task-2', title: 'Second', description: 'Second task', dependsOn: ['task-1'] },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tasks.length).toBe(2)
    }
  })

  it('rejects empty tasks array', () => {
    const result = PlannerOutputSchema.safeParse({
      tasks: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing tasks', () => {
    const result = PlannerOutputSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
