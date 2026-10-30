import { describe, expect, it } from 'vitest'
import type { ProjectSummaryDto } from '#shared/types/dto'
import type { ProjectStatus } from '#shared/utils/enums'
import { groupProjectsByStatus, PROJECT_STATUS_ORDER } from '../useProjects'

function project(name: string, status: ProjectStatus, isInbox = false): ProjectSummaryDto {
  return {
    id: name,
    slug: name.toLowerCase(),
    key: name.slice(0, 3).toUpperCase(),
    name,
    description: '',
    status,
    client: null,
    color: null,
    isInbox,
    version: 1,
    counts: { backlog: 0, todo: 0, in_progress: 0, in_review: 0, blocked: 0, done: 0, cancelled: 0 },
    openCount: 0,
    updatedAt: '2026-10-30T00:00:00.000Z',
  }
}

describe('groupProjectsByStatus', () => {
  it('groups by status, excludes the inbox and sorts by name', () => {
    const groups = groupProjectsByStatus([
      project('Inbox', 'development', true),
      project('Zeta', 'development'),
      project('Alpha', 'development'),
      project('Shop', 'production'),
      project('Old', 'archived'),
    ])
    expect(groups.development.map(p => p.name)).toEqual(['Alpha', 'Zeta'])
    expect(groups.production.map(p => p.name)).toEqual(['Shop'])
    expect(groups.archived.map(p => p.name)).toEqual(['Old'])
    expect(groups.idea).toEqual([])
  })

  it('orders groups with archived last', () => {
    expect(PROJECT_STATUS_ORDER[0]).toBe('development')
    expect(PROJECT_STATUS_ORDER.at(-1)).toBe('archived')
    expect(PROJECT_STATUS_ORDER).toHaveLength(6)
  })
})
