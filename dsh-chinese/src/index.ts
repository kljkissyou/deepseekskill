/**
 * dsh-chinese host plugin: makes every assistant reply use Chinese for
 * natural-language communication, while leaving code, commands, identifiers,
 * and error text byte-for-byte untouched.
 *
 * It registers ONE convention section (output-format rules, order 106) into
 * the assembled system prompt, right after the bash guidance (104) and the
 * genui fence language (105). Because it is a plain system-prompt section,
 * it applies to EVERY agent / session in the profile with zero per-session
 * state and no pre-step interception.
 *
 * The behavior boundary is deliberate and conservative:
 *   - natural-language prose (explanations, summaries, guidance, why/how) -> 中文
 *   - code, shell commands, tool arguments, file paths, identifiers -> unchanged
 *   - literal error/exception text, log lines, terminal output -> kept as-is,
 *     with the explanation around it in Chinese
 *
 * @module dsh-chinese
 */

import { Context } from '@deepseek-ai/cordis'
// Type-only import: brings the `ctx.systemPrompt` Context merge (declared by
// @deepseek-ai/dsh-system-prompt) into this program's type surface. Without
// it TypeScript cannot resolve `ctx.systemPrompt.section`.
import type {} from '@deepseek-ai/dsh-system-prompt'
// Type-only import: brings the `ctx.settings` Context merge and the
// settingsNamespace / SettingsScope types.
import type {} from '@deepseek-ai/dsh-settings'
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

/** Cordis plugin name (the Loader entry and bundle id). */
export const name = 'dsh-chinese'

/**
 * Service required before load: the system-prompt assembly registry and the
 * settings provider. Injecting them (rather than probing) lets cordis start
 * this plugin at the right point and guarantees both services are bound.
 */
export const inject = ['systemPrompt', 'settings']

/** Settings namespace brand for this plugin's durable document section. */
export const CHINESE_NAMESPACE = settingsNamespace('chinese')

/** The durable settings section schema: a single enable switch. */
export const ChineseSettingsSchema = z.object({
  enabled: z.boolean().default(true),
})

/** The resolved settings value shape. */
export interface ChineseSettings {
  enabled: boolean
}

/**
 * Output-format convention section order. The reserved band for tool/output
 * guidance is 100-199 (bash uses 104, the genui fence uses 105); 106 keeps
 * this right beside the other output rules without colliding.
 */
export const CHINESE_SECTION_ORDER = 106

/**
 * The instruction text injected into every assembled system prompt.
 *
 * Keep it short, imperative, and focused on the *language of communication*,
 * not on restyling content. It explicitly forbids translating or altering any
 * literal content (code, identifiers, paths, error text), so the plugin never
 * degrades reliability for the sake of language.
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
 * output-language system-prompt section in sync with it — registered while
 * enabled, withdrawn while disabled. The toggle takes effect without a
 * restart because `scope.watch` re-runs the sync on every change.
 * @param ctx - host cordis context with `systemPrompt` and `settings` bound.
 */
export function apply(ctx: Context): void {
  const scope = ctx.settings.register<ChineseSettings, typeof ChineseSettingsSchema>(
    CHINESE_NAMESPACE,
    ChineseSettingsSchema,
    { applies: 'live' },
  ) as SettingsScope<ChineseSettings>

  // The section is stateful: keep one disposer and flip it on change. When the
  // plugin's fiber is disposed, the effect below also tears the section down.
  let disposeSection: (() => void) | undefined
  const syncEnabled = (enabled: boolean): void => {
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

  let disposed = false
  const unsubscribe = scope.watch((next) => syncEnabled(next.enabled))
  ctx.effect(() => {
    // Initial state: honour whatever the user document currently holds.
    syncEnabled(scope.get().enabled)
    return () => {
      disposed = true
      unsubscribe()
      disposeSection?.()
      disposeSection = undefined
    }
  }, 'dsh-chinese: settings-gated section')
}
