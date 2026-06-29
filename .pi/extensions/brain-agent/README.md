# Brain Builder — project-local pi extension

A custom agent for building **Project Brain** from scratch to MVP, with two
switchable modes that enforce the design system in `DESIGN_SYSTEM.md`.

## Modes

| Mode | Tools | Purpose |
|------|-------|---------|
| **plan** (`/plan`) | read-only: `read`, `bash` (allowlisted), `grep`, `find`, `ls` | Discuss ideas, read code, produce a numbered plan. No edits. |
| **execute** (`/execute`) | full: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls` | Build. Implement the agreed plan, run checks, mark `[DONE:n]`. |

## Commands & keys

- `/plan` — enter plan mode (read-only)
- `/execute` — enter execute mode (full build)
- `/mode` — show current mode + quick rules
- `/brain-todos` — show the active plan and progress
- `Ctrl+Alt+P` — toggle plan ↔ execute
- `--plan` — start pi already in plan mode

## How the rules get enforced without repeating them

- **`AGENTS.md`** (project root) is auto-loaded by pi and stays in context every
  turn. It holds the condensed design rules: vision, five MVP questions,
  layering, forbidden couplings, `[HARD]` invariants, coding conventions, build
  order, out-of-scope list.
- **`DESIGN_SYSTEM.md`** is the authoritative `[HARD]` contract; the agent reads
  the relevant section before nontrivial decisions and cites it (e.g. "§5.3").
- The extension injects a **short mode reminder** each turn (`PLAN_CONTEXT` /
  `EXECUTE_CONTEXT` in `context.ts`) so behavior is pinned without the user
  re-pasting rules.
- Plan-mode enforcement is hard: `edit`/`write` are disabled **and** bash is
  filtered through an allowlist (`utils.ts`); destructive commands are blocked.

## Plan workflow

1. `/plan` and ask the agent to plan a chunk of work. It must read
   `DESIGN_SYSTEM.md` and emit a numbered plan under a `Plan:` header, mapping
   steps to the build order and naming the `[HARD]` rules that apply.
2. When the plan is ready, pi offers: **Execute the plan** / **Stay** / **Refine**.
3. Choosing *Execute* switches to execute mode, tracks the steps, and the agent
   marks each `[DONE:n]`. A progress widget shows completion.
4. When all steps are done, the extension announces completion and clears the
   plan. Resume across sessions is supported.

## Files

- `index.ts` — extension (modes, commands, enforcement, plan lifecycle, state)
- `utils.ts` — pure helpers (bash allowlist, plan/todo extraction)
- `context.ts` — baked-in mode context strings (never repeated by the user)

## Notes

- This is a project-local extension (`.pi/extensions/brain-agent/`). It loads
  after the project is trusted. Run `/reload` after editing it.
- The extension does **not** import `@earendil-works/pi-agent-core`; it uses
  structural typing for messages to avoid an extra dependency.
- Default mode is `execute`; use `/plan` or `--plan` for read-only planning.