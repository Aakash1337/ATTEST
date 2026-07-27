/**
 * CI guard: packages/core has ZERO AWS imports.
 *
 * This is not style. The chunker, fusion, budget packer and agent loop are the
 * interesting logic; keeping them free of AWS SDK types is what makes them testable in
 * milliseconds with plain objects and no mocks. The constraint is load-bearing for the
 * whole testing strategy (docs/12-engineering-practices.md §1).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = 'packages/core/src'
const FORBIDDEN = [
  /@aws-sdk\//,
  /\baws-lambda\b/,
  /\baws-cdk-lib\b/,
  /\bfrom ['"]aws/,
  /\bprocess\.env\.AWS_/,
]

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

const violations = []
for (const file of walk(ROOT)) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) return
    for (const re of FORBIDDEN) {
      if (re.test(line)) {
        violations.push(`${relative('.', file)}:${i + 1}  ${line.trim()}`)
      }
    }
  })
}

if (violations.length > 0) {
  console.error('FAIL: packages/core must have no AWS imports.\n')
  for (const v of violations) console.error('  ' + v)
  console.error('\nMove the AWS-touching code into packages/adapters and inject it.')
  process.exit(1)
}

console.log('PASS  core-no-aws: packages/core is free of AWS imports')
