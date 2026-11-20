<!-- intent-skills:start -->
## Skill Loading

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before editing files for a substantial task:
- Run `pnpm exec intent list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm exec intent load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

Push back when you disagree; state a recommendation with trade-offs named, not a survey.

## Graphify

For questions about code structure, callers, dependencies, or the impact of a change, query Graphify's code graph (MCP server `graphify`) before using grep:
- `query_graph` / `graphify_find` — locate modules, symbols, and how they relate.
- `graphify_callers` — who calls a function or uses a symbol.
- `graphify_impact` — what breaks if something changes.
- `review_status` — status of Graphify PR reviews.

The graph reflects the default branch (`main`) only — not other branches or uncommitted work. For anything touched on the current branch (check `git status` / `git diff main...`), confirm graph answers with grep or by reading the file.

Use grep for exact-string searches. If the Graphify tools are unavailable, say so and fall back to grep.