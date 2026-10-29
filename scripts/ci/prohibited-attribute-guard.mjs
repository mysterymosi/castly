#!/usr/bin/env node
/**
 * CI guard: banned attribute keys must not appear in schema, migrations, or packages/schema.
 * See docs/plans/01-foundations.md §1.7 and TECH_SPEC §7.3.1.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = join(import.meta.dirname, "../..")

const SCAN_ROOTS = [
  // All of db/src: the schema, and the seed where attribute keys are actually defined.
  join(ROOT, "packages/db/src"),
  join(ROOT, "packages/db/drizzle"),
  join(ROOT, "packages/schema/src"),
]

const SKIP_FILES = new Set([
  "packages/db/src/assert-prohibited-tier.ts",
  "scripts/ci/prohibited-attribute-guard.mjs",
])

/** Normalized banned attribute keys (PRD / TECH_SPEC). */
const BANNED_KEYS = [
  "religion",
  "health",
  "disability",
  "marital_status",
  "marital status",
  "sexual_orientation",
  "sexual orientation",
  "pregnancy",
  "hiv",
]

/** Quoted key literals that would define a prohibited attribute. */
function bannedPatterns() {
  return BANNED_KEYS.flatMap((key) => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    return [
      new RegExp(`['"]${escaped}['"]`, "i"),
      new RegExp(`key\\s*[:=]\\s*['"]${escaped.replace(/ /g, "_")}['"]`, "i"),
    ]
  })
}

const patterns = bannedPatterns()

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const rel = relative(ROOT, path)
    if (SKIP_FILES.has(rel)) continue
    const st = statSync(path)
    if (st.isDirectory()) {
      if (name === "meta") continue
      walk(path, files)
    } else if (/\.(ts|tsx|sql|json)$/.test(name) && !name.endsWith("_snapshot.json")) {
      files.push(path)
    }
  }
  return files
}

const violations = []

for (const root of SCAN_ROOTS) {
  for (const file of walk(root)) {
    const rel = relative(ROOT, file)
    const lines = readFileSync(file, "utf8").split("\n")
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.includes("tier <> 'prohibited'") || line.includes('tier <> "prohibited"')) continue
      if (/\battribute_tier\b/.test(line) && /prohibited/.test(line)) continue
      for (const pattern of patterns) {
        if (pattern.test(line)) {
          violations.push(`${rel}:${i + 1}: ${line.trim()}`)
          break
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Prohibited attribute key guard failed:\n")
  for (const v of violations) console.error(`  ${v}`)
  process.exit(1)
}

console.log("Prohibited attribute key guard passed.")
