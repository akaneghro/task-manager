// Tool result helpers: compact JSON text (+ structuredContent) and actionable error results.

import type { CallToolResult } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { isServiceError } from '../services/context'
import type { ConflictDto } from '../../shared/types/dto'
import { compactProjectDetail, compactTaskDetail, isProjectDetail, isTaskDetail } from './tools/format'

/** JSON without whitespace; `null` and `undefined` properties are omitted. */
export function compactJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => (v === null ? undefined : v)) ?? 'null'
}

/** Plain object with nulls/undefined removed (same shape `compactJson` prints). */
export function toPlainObject(value: unknown): Record<string, unknown> {
  const parsed: unknown = JSON.parse(compactJson(value))
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : { value: parsed }
}

export interface JsonResultOptions {
  /** Also return the payload as `structuredContent`. */
  structured?: boolean
  /** Text line prepended to the JSON (a hint for Claude). */
  note?: string
}

export function jsonResult(data: unknown, options: JsonResultOptions = {}): CallToolResult {
  const json = compactJson(data)
  const result: CallToolResult = {
    content: [{ type: 'text', text: options.note ? `${options.note}\n${json}` : json }],
  }
  if (options.structured) result.structuredContent = toPlainObject(data)
  return result
}

export function errorText(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] }
}

function compactConflictState(details: unknown): unknown {
  if (isTaskDetail(details)) return compactTaskDetail(details)
  if (isProjectDetail(details)) return compactProjectDetail(details)
  return details
}

function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues.map(i => `${i.path.map(String).join('.') || 'input'}: ${i.message}`).join('; ')
}

/** Converts any thrown value into an `isError` tool result. Never includes stack traces or secrets. */
export function errorResult(error: unknown): CallToolResult {
  if (isServiceError(error)) {
    if (error.code === 'conflict' && error.details !== undefined) {
      const conflict: ConflictDto<unknown> = {
        error: 'version_conflict',
        message: error.message,
        current: compactConflictState(error.details),
      }
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `Conflict: ${error.message}. Someone else changed it since your last read. Current state below; `
            + `merge your intended change with it (never blindly overwrite the user's edits) and retry with `
            + `expectedVersion=${versionOf(conflict.current) ?? 'the current version'}.\n${compactJson(conflict)}`,
        }],
        structuredContent: toPlainObject(conflict),
      }
    }
    return errorText(`${labelOf(error.code)}: ${error.message}`)
  }
  if (error instanceof z.ZodError) {
    return errorText(`Invalid input: ${formatIssues(error.issues)}`)
  }
  console.error('[mcp] tool failed:', error instanceof Error ? error.message : 'unknown error')
  return errorText('Internal error while running the tool. Retry later or report it to the user.')
}

function versionOf(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const version = (value as { version?: unknown }).version
  return typeof version === 'number' ? version : undefined
}

function labelOf(code: string): string {
  switch (code) {
    case 'not_found':
      return 'Not found'
    case 'forbidden':
      return 'Forbidden'
    case 'invalid':
      return 'Invalid input'
    case 'unauthorized':
      return 'Unauthorized'
    default:
      return 'Error'
  }
}

/** Runs a tool body, turning thrown errors into `isError` results. */
export async function runTool(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn()
  }
  catch (error) {
    return errorResult(error)
  }
}
