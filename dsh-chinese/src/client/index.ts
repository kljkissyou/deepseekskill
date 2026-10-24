/**
 * dsh-chinese client plugin: the browser half. Puts one enable switch into the
 * Settings page (a `settings.section` slot near the top, order 5 — just below
 * General order 0 and above Models/Plugin-inventory order 10), bound to the
 * `chinese` settings namespace registered by the host half. Toggling it writes
 * `chinese.enabled`; the host reacts live and adds/removes the Chinese-language
 * system-prompt section without a restart.
 *
 * The switch is plain DOM (no UI framework component) — a labelled native
 * checkbox — so the client stays dependency-light and easy to hand-verify.
 *
 * @module dsh-chinese/client
 */

// Type-only: client Context merges (slots, settingsScope declared by
// dsh-client-ui-settings/client, locale).
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'

/** This plugin's settings namespace (must match the host registration). */
export const CHINESE_NAMESPACE = 'chinese'

/** Settings-page section order: near the top, just under "General". */
export const CHINESE_SECTION_ORDER = 5

/** Locale namespace for the section copy. */
const NS = 'dsh-chinese'

const zh = {
  'section.label': '中文回复',
  'section.description': '让 DeepSeek Harness 用中文跟你交流（代码、命令、报错原文不变）。随时可关。',
  'section.enabled': '开启中文回复',
}
const en = {
  'section.label': 'Chinese replies',
  'section.description': 'Make every reply communicate in Chinese (code, commands and error text stay as-is). Toggle any time.',
  'section.enabled': 'Enable Chinese replies',
}

/**
 * Client plugin entry.
 * @param ctx - client root context with `slots`, `settingsScope`, `locale`.
 */
export const inject = ['slots', 'settingsScope', 'locale']

export function apply(ctx: any): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-chinese: dictionaries')

  // Bind the `chinese` namespace scope: loads current value from host and
  // stays in sync. `value?.enabled` (default true) drives the switch.
  const scope = ctx.settingsScope.bind({ namespace: CHINESE_NAMESPACE })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'dsh-chinese',
    order: CHINESE_SECTION_ORDER,
    label: () => ctx.locale.bind(NS)('section.label'),
    locale: NS,
    inject: () => ({ scope }),
  }, ChineseSection))
}

/**
 * The enable-switch section. Uses the injected `scope` (a
 * SettingsScopeController bound to `chinese`) for live value and writes.
 * @param props - injected section props.
 */
function ChineseSection({ scope, t }: any): any {
  const enabled = scope.getSnapshot().value?.enabled ?? true
  const [checked, setChecked] = ReactState(enabled)

  // Subscribe once; keep local checked state in sync with remote changes.
  ReactUseEffect(() => {
    const off = scope.subscribe(() => {
      const v = scope.getSnapshot().value
      if (v !== undefined) setChecked(!!v.enabled)
    })
    return off
  }, [scope])

  return h('section', { className: 'dsh-chinese-section' },
    h('label', { className: 'dsh-chinese-row' },
      h('input', {
        type: 'checkbox',
        checked,
        onChange: (e: Event) => {
          const next = (e.target as HTMLInputElement).checked
          setChecked(next)
          void scope.set('enabled', next)
        },
      }),
      h('span', {}, t('section.enabled')),
    ),
    h('p', { className: 'dsh-chinese-desc' }, t('section.description')),
  )
}

/* Minimal React shims kept local so the section never touches a bundle-bound
   renderer; the host ModuleLoader supplies React via `require('react')`. */
import * as React from 'react'
import { useState as ReactState, useEffect as ReactUseEffect } from 'react'
// `h` = React.createElement convenience.
const h = React.createElement
