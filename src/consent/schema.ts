import { z } from 'zod'

/** Scope of a consent decision */
export const ConsentScopeSchema = z.enum(['once', 'session', 'project'])
export type ConsentScope = z.infer<typeof ConsentScopeSchema>

/** A single consent decision record */
export const ConsentDecisionSchema = z.object({
  package: z.string().describe('npm package name'),
  scope: ConsentScopeSchema,
  timestamp: z.string().datetime().describe('ISO 8601 datetime'),
  reason: z.string().optional().describe('Why the package is needed'),
})
export type ConsentDecision = z.infer<typeof ConsentDecisionSchema>

/** Persisted project-level consent configuration */
export const ProjectConsentSchema = z.object({
  version: z.literal(1).describe('Schema version for future migrations'),
  approvedPackages: z.array(z.string()).describe('Packages approved at project scope'),
  decisions: z.array(ConsentDecisionSchema).describe('Audit log of consent decisions'),
})
export type ProjectConsent = z.infer<typeof ProjectConsentSchema>
