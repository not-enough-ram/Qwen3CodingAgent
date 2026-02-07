import { describe, it, expect } from 'vitest'
import { ReviewerOutputSchema, ReviewIssueSchema } from '../../src/schemas/reviewer.js'

describe('ReviewIssueSchema', () => {
  it('accepts valid issue with all fields', () => {
    const result = ReviewIssueSchema.safeParse({
      severity: 'error',
      file: 'src/test.ts',
      description: 'Missing type annotation',
      suggestedFix: 'Add : string type',
    })
    expect(result.success).toBe(true)
  })

  it('accepts issue without suggestedFix', () => {
    const result = ReviewIssueSchema.safeParse({
      severity: 'warning',
      file: 'src/test.ts',
      description: 'Unused variable',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid severity', () => {
    const result = ReviewIssueSchema.safeParse({
      severity: 'critical',
      file: 'src/test.ts',
      description: 'Test',
    })
    expect(result.success).toBe(false)
  })
})

describe('ReviewerOutputSchema', () => {
  it('accepts passed review with no issues', () => {
    const result = ReviewerOutputSchema.safeParse({
      passed: true,
      issues: [],
      summary: 'All good!',
    })
    expect(result.success).toBe(true)
  })

  it('accepts failed review with issues', () => {
    const result = ReviewerOutputSchema.safeParse({
      passed: false,
      issues: [
        {
          severity: 'error',
          file: 'src/test.ts',
          description: 'Type error',
        },
      ],
      summary: 'Fix type error',
    })
    expect(result.success).toBe(true)
  })

  it('accepts passed review with suggestions', () => {
    const result = ReviewerOutputSchema.safeParse({
      passed: true,
      issues: [
        {
          severity: 'suggestion',
          file: 'src/test.ts',
          description: 'Consider using const',
        },
      ],
      summary: 'Minor suggestion',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing summary', () => {
    const result = ReviewerOutputSchema.safeParse({
      passed: true,
      issues: [],
    })
    expect(result.success).toBe(false)
  })
})
