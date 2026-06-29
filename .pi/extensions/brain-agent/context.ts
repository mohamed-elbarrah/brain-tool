/**
 * Baked-in mode context for the brain-builder extension.
 *
 * These strings are injected once per turn (display: false) so the agent always
 * has the mode behavior in context without the user re-pasting rules. The
 * standing rules live in AGENTS.md (auto-loaded); these are short reminders.
 */

export const PLAN_CONTEXT = `[BRAIN BUILDER — PLAN MODE (read-only)]
You are building Project Brain. Authoritative contract: DESIGN_SYSTEM.md
([HARD]). Intent: PROJECT_BRAIN_PLAN.md. Standing rules are in AGENTS.md.

In PLAN mode you MUST:
- If you are not already familiar, READ DESIGN_SYSTEM.md and the relevant src/
  before planning. Do not invent rules.
- Respect every [HARD] rule. When a rule constrains a decision, cite the
  section (e.g. "§5.3 forbidden couplings").
- Produce a numbered plan under a "Plan:" header. Map each step to the build
  order (AGENTS.md "Build order") and name the files/dirs it touches.
- For each step, note which layer (0-4) and which of the five MVP questions /
  tools it serves, and which [HARD] invariants apply.
- Ask clarifying questions in chat when requirements are ambiguous.
- Do NOT write, edit, or run mutating commands. Output the plan + rationale only.
- Never propose anything that violates forbidden couplings or skips layers.`;

export const EXECUTE_CONTEXT = `[BRAIN BUILDER — EXECUTE MODE]
You are building Project Brain. Contract: DESIGN_SYSTEM.md ([HARD]). Intent:
PROJECT_BRAIN_PLAN.md. Standing rules are in AGENTS.md — follow them always.

In EXECUTE mode you MUST:
- Implement only the agreed plan (or the user's direct request). If a tracked
  plan is active, mark each finished step with [DONE:n] in your response.
- Respect layering (§5.1) and forbidden couplings (§5.3): no sqlite imports
  outside src/storage/sqlite; no MCP imports outside src/transport; no concrete
  parser imports outside src/indexing/parsers + extractors; no transport→storage
  imports; no ORM.
- Use Result<T,BrainError> for expected errors. No any. TS strict. ESM. Named
  exports. Zod at boundaries.
- Transactional per-file upsert (delete-then-insert, cascade). Idempotent
  indexer. Deterministic ordering (§8.7). Stable external identities (§6.2).
- After changes: run tsc --noEmit, then the relevant tests. Report failures
  honestly; never fix by relaxing strictness or using any/suppress.
- Never violate a [HARD] rule. If a request forces one, STOP and explain the
  conflict with the section reference before proceeding.`;

export const RULES_SUMMARY = `Project Brain — quick rules
- Vision: knowledge engine, not a code search engine.
- Contract: DESIGN_SYSTEM.md ([HARD]) > PROJECT_BRAIN_PLAN.md > code.
- Five MVP questions: defined/used/depends/impact/duplicate.
- Layers 0-4 downward only; forbidden couplings in §5.3; no ORM.
- [HARD]: single writer, transactional upsert, idempotent indexer, lazy
  identity, stable external ids, deterministic ordering, Result-based errors,
  query metadata (trust/confidence/freshness/cost/limits), version.json gate,
  ParserPort seam, brain.capabilities.
- Modes: /plan (read-only), /execute (build). Ctrl+Alt+P toggles.`;