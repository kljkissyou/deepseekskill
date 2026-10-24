/**
 * Type declarations for dsh-chinese.
 *
 * This is the Cordis plugin surface the harness hosts: `name`, `inject`, and
 * `apply`. The runtime `ctx` (with the `systemPrompt` merge) is injected by
 * the harness, so the module itself has no runtime dependencies.
 */

import type { Context } from '@deepseek-ai/cordis'

/** Cordis plugin name (the Loader entry and bundle id). */
export const name: 'dsh-chinese'

/** System-prompt assembly registry required before this plugin starts. */
export const inject: ['systemPrompt']

/** Output-format convention section order (bash=104, genui fence=105). */
export const CHINESE_SECTION_ORDER: 106

/** Instruction text injected into every assembled system prompt. */
export const CHINESE_SECTION_TEXT: string

/**
 * Mount the plugin: register the single output-language section on the
 * system-prompt assembly registry for every agent in the profile.
 * @param ctx - harness context with `systemPrompt` bound.
 */
export function apply(ctx: Context): void
