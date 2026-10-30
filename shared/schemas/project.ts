import { z } from 'zod'
import { MEMBER_ROLES, PROJECT_LINK_KINDS, PROJECT_STATUSES } from '../utils/enums'
import { projectKeySchema, slugSchema, urlSchema, versionSchema } from './common'

export const projectLinkInputSchema = z.object({
  kind: z.enum(PROJECT_LINK_KINDS).default('other'),
  label: z.string().trim().min(1).max(80),
  url: urlSchema,
})
export type ProjectLinkInput = z.infer<typeof projectLinkInputSchema>

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  key: projectKeySchema,
  slug: slugSchema.optional(),
  status: z.enum(PROJECT_STATUSES).default('idea'),
  description: z.string().max(5000).default(''),
  notes: z.string().max(200_000).default(''),
  client: z.string().trim().max(120).nullish(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).nullish(),
  links: z.array(projectLinkInputSchema).max(30).optional(),
})
export type CreateProjectInput = z.input<typeof createProjectSchema>

export const updateProjectSchema = z.object({
  expectedVersion: versionSchema,
  name: z.string().trim().min(1).max(120).optional(),
  slug: slugSchema.optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  description: z.string().max(5000).optional(),
  notes: z.string().max(200_000).optional(),
  client: z.string().trim().max(120).nullable().optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
})
export type UpdateProjectInput = z.input<typeof updateProjectSchema>

export const replaceProjectLinksSchema = z.object({
  links: z.array(projectLinkInputSchema).max(30),
})

export const updateProjectNotesSchema = z.object({
  mode: z.enum(['append', 'replace']),
  content: z.string().max(200_000),
  expectedVersion: versionSchema.optional(),
}).refine(v => v.mode === 'append' || v.expectedVersion !== undefined, {
  message: 'expectedVersion is required when mode is "replace"',
  path: ['expectedVersion'],
})
export type UpdateProjectNotesInput = z.input<typeof updateProjectNotesSchema>

export const listProjectsQuerySchema = z.object({
  status: z.array(z.enum(PROJECT_STATUSES)).optional(),
  includeArchived: z.boolean().default(false),
})

export const inviteMemberSchema = z.object({
  githubLogin: z.string().trim().regex(/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i, 'Invalid GitHub username'),
  role: z.enum(MEMBER_ROLES).default('viewer'),
})
export type InviteMemberInput = z.input<typeof inviteMemberSchema>

export const updateMemberSchema = z.object({
  role: z.enum(MEMBER_ROLES),
})

export const createShareLinkSchema = z.object({
  label: z.string().trim().max(80).nullish(),
})

export const createAccountSchema = z.object({
  service: z.string().trim().min(1).max(120),
  url: urlSchema.nullish(),
  username: z.string().trim().max(200).nullish(),
  notes: z.string().max(5000).default(''),
  secret: z.string().max(10_000).nullish(),
  shareWithClaude: z.boolean().default(false),
})
export type CreateAccountInput = z.input<typeof createAccountSchema>

export const updateAccountSchema = z.object({
  service: z.string().trim().min(1).max(120).optional(),
  url: urlSchema.nullable().optional(),
  username: z.string().trim().max(200).nullable().optional(),
  notes: z.string().max(5000).optional(),
  /** `undefined` keeps the secret, `null` removes it, a string replaces it. */
  secret: z.string().max(10_000).nullable().optional(),
  shareWithClaude: z.boolean().optional(),
})
export type UpdateAccountInput = z.input<typeof updateAccountSchema>
