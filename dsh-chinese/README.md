# dsh-chinese

A tiny DeepSeek Harness plugin that makes **every reply communicate in Chinese**
— while keeping code, shell commands, file paths, identifiers, and error text
**byte-for-byte unchanged**.

## How it works

It registers **one convention section** (output-format rules, `order 106`) into
the assembled system prompt, right after the bash guidance (104) and the genui
fence language (105). Because it is a plain `system-prompt` section it applies
to **every agent / session** in the profile — no per-session state, no
pre-step interception, no custom tooling.

The injected instruction:

- Communicate all natural-language prose with the user in **中文（简体中文）**.
- **Do not** translate or rewrite literal content:
  - code, commands, tool args, paths, identifiers — keep as written;
  - error / exception text, log lines, terminal output — quote verbatim;
  - enum values, keys, URLs, proper names — untouched.

## Install

1. Build the plugin:

   ```bash
   cd plugins/dsh-chinese
   npm install
   npm run build
   ```

2. Add it to the profile as a bundle, or drop the patch into the profile's
   cordis composition. See `README.zh.md` for step-by-step profile wiring.

## Uninstall

Remove the `dsh-chinese` bundle entry (and its patch rows) from the active
profile, then restart the harness.

## License

MIT
