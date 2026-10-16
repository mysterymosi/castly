import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

const packageRoot = fileURLToPath(new URL("../", import.meta.url))
const repoRoot = join(packageRoot, "../..")

const configPath = join(packageRoot, "drizzle.config.ts")
execSync(`pnpm exec drizzle-kit generate --name _ci_check --config "${configPath}"`, {
  cwd: packageRoot,
  stdio: "inherit",
})

const status = execSync("git status --porcelain drizzle/", {
  cwd: repoRoot,
  encoding: "utf8",
}).trim()

if (status) {
  console.error("Drizzle migrations are out of sync with schema. Run db:generate and commit.")
  console.error(status)
  process.exit(1)
}

console.log("Drizzle migration check passed.")
