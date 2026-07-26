/** Runs every static check. One process, one exit code, readable output. */
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'

const checks = readdirSync('scripts/ci')
  .filter((f) => f.startsWith('check-') && f.endsWith('.mjs'))
  .sort()

let failed = 0
for (const c of checks) {
  try {
    process.stdout.write(execFileSync('node', [`scripts/ci/${c}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }))
  } catch (e) {
    process.stdout.write(e.stdout ?? '')
    process.stderr.write(e.stderr ?? '')
    failed++
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${checks.length} static checks FAILED`)
  process.exit(1)
}
console.log(`\nAll ${checks.length} static checks passed`)
