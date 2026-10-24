/**
 * dsh-chinese — built runtime entry (hand-written ESM).
 *
 * Make DeepSeek Harness reply in Chinese for natural-language prose while
 * leaving code, commands, paths, identifiers and error text byte-for-byte
 * unchanged. Registers a durable enable switch (`chinese.enabled`, default on)
 * and keeps one convention section (output rules, order 106) in the system
 * prompt in sync with it: added while enabled, withdrawn while disabled. The
 * toggle takes effect without a restart.
 */

import z from '@deepseek-ai/schemastery'

/** Cordis plugin name (the Loader entry and bundle id). */
export const name = 'dsh-chinese'

/** Services required before load: systemPrompt assembly + settings provider. */
export const inject = ['systemPrompt', 'settings']

/** Settings namespace brand (must match the client and src/index.ts). */
export const CHINESE_NAMESPACE = 'chinese'

/** Schemastery schema for the durable document section: one enable switch. */
export const ChineseSettingsSchema = z.object({
  enabled: z.boolean().default(true),
})

/** Output-format convention section order (bash=104, genui fence=105). */
export const CHINESE_SECTION_ORDER = 106

/**
 * Instruction text injected into every assembled system prompt.
 * Boundary: natural-language prose -> 中文; literal content stays untouched.
 */
export const CHINESE_SECTION_TEXT = `Output language rule (applies to every reply):

- Communicate with the user in 中文（简体中文）. Write all natural-language prose
  — explanations, summaries, reasoning that you speak to the user, suggestions,
  follow-up questions, and closing remarks — in Chinese.
- Do NOT translate or rewrite content that must stay literal:
  * code, shell commands, tool arguments, file paths, and identifiers stay
    exactly as written;
  * error / exception text, log lines, and terminal output are quoted verbatim;
  * enum values, keys, URLs, and proper names are left untouched.
- If the user writes to you in a specific language, still reply in Chinese
  unless they explicitly ask otherwise (or the task requires output in another
  language, e.g. an English document being authored or a translation).`

/**
 * Mount the plugin: register the enable-switch settings namespace and keep the
 * output-language section in sync with its `enabled` field.
 * @param {import('@deepseek-ai/cordis').Context} ctx - harness context with `systemPrompt` and `settings` bound.
 */
export function apply(ctx) {
  let scope
  try {
    scope = ctx.settings.register(CHINESE_NAMESPACE, ChineseSettingsSchema, { applies: 'live' })
  } catch (error) {
    // No settings provider on this host: fall back to always-on.
    ctx.logger?.warn?.(`[dsh-chinese] settings unavailable; defaulting to on (${error?.message ?? error})`)
    ctx.systemPrompt.section({
      name: 'dsh-chinese:output-language',
      order: CHINESE_SECTION_ORDER,
      text: CHINESE_SECTION_TEXT,
    })
    return
  }

  let disposed = false
  let disposeSection
  const syncEnabled = (enabled) => {
    if (disposed) return
    if (enabled && disposeSection === undefined) {
      disposeSection = ctx.systemPrompt.section({
        name: 'dsh-chinese:output-language',
        order: CHINESE_SECTION_ORDER,
        text: CHINESE_SECTION_TEXT,
      })
    } else if (!enabled && disposeSection !== undefined) {
      disposeSection()
      disposeSection = undefined
    }
  }

  ctx.effect(() => {
    syncEnabled(scope.get()?.enabled ?? true)
    const unsubscribe = typeof scope.watch === 'function'
      ? scope.watch((next) => syncEnabled(!!next?.enabled))
      : undefined
    return () => {
      disposed = true
      if (typeof unsubscribe === 'function') unsubscribe()
      if (disposeSection !== undefined) disposeSection()
      disposeSection = undefined
    }
  }, 'dsh-chinese: settings-gated section')
}
