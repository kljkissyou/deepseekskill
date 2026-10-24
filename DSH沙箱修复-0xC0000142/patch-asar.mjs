// Same-length in-place byte patch for DSH's windows-acl sandbox default-DACL bug.
//
// Symptom it fixes: every shell command run under the "workspace-write" file policy
// dies instantly with exit code 3221225794 (0xC0000142, STATUS_DLL_INIT_FAILED),
// while "read-only" and "danger-full-access" work fine.
//
// Root cause (upstream report: DSH issue #9507, 2026-10-12):
//   dsh-sandbox-windows-acl/lib/types-*.js
//     setTokenDefaultDaclGrant(api, restrictedToken, this.tempWriteSidPtr ?? this.writeSidPtr ?? worldSid);
//   The third argument merges a WRITE_RESTRICTED-only capability SID (S-1-4-x-y) into the
//   restricted token's DEFAULT DACL. Objects the sandboxed child creates then inherit a DACL
//   whose ACE names a SID that is not in the token's normal group list, so the child fails its
//   own access check during early loader/DLL initialisation and dies with 0xC0000142.
//   read-only mode is unaffected because it falls through to worldSid (Everyone), which every
//   token carries in its normal group list.
//
// Fix: always grant worldSid, i.e. drop the capability-SID branch. This is exactly the
// behaviour read-only mode already has, so it is a known-good DACL shape.
// The edit is length-preserving (100 bytes -> 100 bytes) so no asar offset changes.
//
// Usage (must run under Electron-as-node, e.g. the bundled DSH Desktop.exe):
//   set ELECTRON_RUN_AS_NODE=1
//   "<DSH Desktop.exe>" patch-asar.mjs            # dry run, shows what would change
//   "<DSH Desktop.exe>" patch-asar.mjs --apply    # back up, patch, verify
//
// Re-run after every DSH Desktop update: an update replaces app.asar and the patch is lost.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// Electron's asar-aware fs wrapper would treat app.asar itself as an archive and try to
// read a file inside it; disable that so paths are literal.
process.noAsar = true

const ASAR = process.env.DSH_ASAR
  || 'E:\\Program Files\\DeepSeek\\DSH Desktop\\resources\\app.asar'
const BACKUP_DIR = process.env.DSH_ASAR_BACKUP_DIR
  || 'E:\\Deepseek\\_backup-asar'
const apply = process.argv.includes('--apply')

const TARGET = 'setTokenDefaultDaclGrant(api, restrictedToken, this.tempWriteSidPtr ?? this.writeSidPtr ?? worldSid)'
const REPLACEMENT = 'setTokenDefaultDaclGrant(api, restrictedToken, worldSid' + ' '.repeat(44) + ')'

if (TARGET.length !== REPLACEMENT.length) {
  console.error(`LENGTH MISMATCH target=${TARGET.length} replacement=${REPLACEMENT.length}`)
  process.exit(2)
}
console.log(`target length = ${TARGET.length}  replacement length = ${REPLACEMENT.length}  (equal: ${TARGET.length === REPLACEMENT.length})`)

const stat = fs.statSync(ASAR)
console.log(`asar = ${ASAR}`)
console.log(`asar size = ${stat.size}`)

const buf = fs.readFileSync(ASAR)

const needle = Buffer.from(TARGET, 'utf8')
const patched = Buffer.from(REPLACEMENT, 'utf8')

const hitPatched = buf.indexOf(patched)
if (hitPatched >= 0 && buf.indexOf(needle) < 0) {
  console.log(`ALREADY PATCHED at byte offset ${hitPatched} — nothing to do.`)
  process.exit(0)
}

const first = buf.indexOf(needle)
if (first < 0) { console.error('TARGET NOT FOUND — DSH version differs; re-check the source before patching.'); process.exit(3) }
const second = buf.indexOf(needle, first + 1)
if (second >= 0) { console.error(`TARGET NOT UNIQUE (offsets ${first}, ${second}) — refusing to patch.`); process.exit(4) }
console.log(`target found exactly once at byte offset ${first}`)
console.log(`bytes at offset  : ${JSON.stringify(buf.subarray(first, first + needle.length).toString('utf8'))}`)

if (!apply) {
  console.log('DRY RUN — no write. Re-run with --apply to patch.')
  process.exit(0)
}

fs.mkdirSync(BACKUP_DIR, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backup = path.join(BACKUP_DIR, `app.asar.orig-${stamp}`)
console.log('hashing original ...')
const beforeHash = crypto.createHash('sha256').update(buf).digest('hex')
console.log(`sha256(original) = ${beforeHash}`)
fs.copyFileSync(ASAR, backup)
const backupHash = crypto.createHash('sha256').update(fs.readFileSync(backup)).digest('hex')
console.log(`backup written   = ${backup}`)
console.log(`sha256(backup)   = ${backupHash}  match=${backupHash === beforeHash}`)
if (backupHash !== beforeHash) { console.error('BACKUP HASH MISMATCH — aborting'); process.exit(5) }

fs.writeFileSync(path.join(BACKUP_DIR, `patch-record-${stamp}.json`), JSON.stringify({
  asar: ASAR, offset: first, length: needle.length,
  original: buf.subarray(first, first + needle.length).toString('utf8'),
  patched: REPLACEMENT,
  sha256Original: beforeHash, backupFile: backup, appliedAt: new Date().toISOString(),
}, null, 2))

const fd = fs.openSync(ASAR, 'r+')
try {
  const written = fs.writeSync(fd, patched, 0, patched.length, first)
  fs.fsyncSync(fd)
  console.log(`wrote ${written} bytes at offset ${first}`)
} finally {
  fs.closeSync(fd)
}

const after = fs.readFileSync(ASAR)
const verify = after.subarray(first, first + patched.length).toString('utf8')
console.log(`verify bytes     : ${JSON.stringify(verify)}`)
console.log(`verify OK        : ${verify === REPLACEMENT}`)
console.log(`size unchanged   : ${after.length === buf.length}`)
console.log(`sha256(patched)  = ${crypto.createHash('sha256').update(after).digest('hex')}`)
console.log(`sha256(backup)   = ${backupHash}`)
console.log(`backup kept at   : ${backup}`)
console.log('DONE')
