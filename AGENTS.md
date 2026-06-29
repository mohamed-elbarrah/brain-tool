# Project Brain — Agent Standing Rules

> This file is loaded by pi automatically and stays in context for every turn.
> It is the **condensed** operating contract for working on this project.
> The authoritative, enforceable design contract is **`DESIGN_SYSTEM.md`**;
> `PROJECT_BRAIN_PLAN.md` is the intent. Where they conflict on a `[HARD]`
> rule, `DESIGN_SYSTEM.md` wins.

## What we are building

**Project Brain is not a code search engine.** It is a project knowledge engine
that exposes structured architectural knowledge to AI agents, letting them
navigate a codebase without repository-wide search. We are building the tool
itself, from scratch, to MVP.

## The two working modes (provided by the `.pi/extensions/brain-agent` extension)

- `/plan` — **read-only**. Discuss ideas, read code, produce a numbered plan.
  No edits, no writes, bash restricted to read-only commands.
- `/execute` — **build**. Full tools. Implement the agreed plan (or a direct
  request). Mark finished plan steps with `[DONE:n]`.
- `/mode` — show current mode. `Ctrl+Alt+P` toggles. `--plan` starts in plan mode.

Default flow: discuss in `/plan` → approve the plan → switch to `/execute`.
Never start writing code in plan mode. Never ignore the design rules in
execute mode.

## The five MVP questions (everything serves these)

1. Where is a symbol **defined**? → `findSymbol`
2. Where is it **used**? → `findUsage`
3. What **depends** on it? → `findDependents`
4. What **breaks** if it changes? → `impactAnalysis`
5. Does **similar** functionality already exist? → `findDuplicate`

`searchComponents` / `searchRoutes` are secondary. Anything not serving the
above is out of scope for the MVP (§1.1).

## Layering (§5.1) — downward-only dependencies, no skips

```
Layer 4: Transport        (MCP server, CLI)
Layer 3: Query Engine     (pure reads over ReadStoragePort)
Layer 2: Indexing         (watcher, ParserPort + registry, extractors, reconciler)
Layer 1: Storage (port)   (StoragePort interface + SQLite adapter)
Layer 0: Domain / Core     (entities, value objects — no I/O)
```

## Forbidden couplings (§5.3) — never violate

- No `better-sqlite3` / `node:sqlite` import outside `src/storage/sqlite/`.
- No MCP SDK import outside `src/transport/`.
- No concrete parser (TypeScript compiler API) import outside `src/indexing/parsers/` and `extractors/`. The pipeline reaches parsers only via `ParserPort`.
- No transport code importing storage code directly.
- No ORM (Prisma/Drizzle/TypeORM) — raw parameterized SQL in the SQLite adapter only.
- No DI framework, no global state libs, no `lodash`/`underscore`.

## Non-negotiable [HARD] invariants

- **One writer**: only `braind` writes; the MCP server and agents are read-only.
- **Transactional file upsert**: delete-then-insert per file in one transaction
  with `ON DELETE CASCADE`. Idempotent indexer.
- **Lazy identity**: store raw references, resolve to symbols in a
  reconciliation pass. Unresolved references are retained, not dropped.
- **Stable external identities**: expose `relativePath`, `symbolId`, and
  `signatureHash`; never return internal rowids across IPC (§6.2).
- **Deterministic ordering** (§8.7): relativePath → line → column → symbolId.
  Every multi-row query needs an `ORDER BY`.
- **Result-based errors**: `Result<T, BrainError>` for expected failures; throw
  only for bugs. No `catch {}`.
- **Query metadata**: every result carries `trust`, `confidence`, freshness,
  `estimatedCost`; resource limits return `LimitExceeded` (never silent
  truncation).
- **Versioning**: `.brain/version.json` gates startup; incompatible format →
  guided `brain rebuild` (§5.6/§6.8).
- **Parser seam**: `ParserPort` + `ParserRegistry`; one impl (TypeScript) in MVP.
- **Capability negotiation**: `brain.capabilities` reports tools/features/4 versions.

## Coding conventions (§13)

TypeScript `strict` (+ `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`,
`noUnusedLocals`, `noUnusedParameters`). ESM only (`.js` extensions in
relative imports). Node 20+. No `any`; no `@ts-ignore` without justification.
Files `kebab-case.ts`; named exports only (default exports only at framework
entrypoints). Zod at all boundaries (CLI args, MCP input, config). Tests
co-located as `foo.test.ts`. `async`/`await`, no `.then` chains, no
fire-and-forget promises.

## Build order (§14/§15) — follow this sequence

1. `src/domain/` — entities, `Result`, `BrainError`, identity helpers
   (`symbolId`, `signatureHash`). Zero deps.
2. `src/storage/port.ts` — `StoragePort` + `ReadStoragePort` interfaces.
3. `src/storage/sqlite/` — adapter, schema, forward-only migrations.
4. `src/storage/in-memory/adapter.ts` — for unit tests (proves the seam).
5. `src/indexing/` — `ParserPort`, `ParserRegistry`, `parsers/typescript.ts`,
   extractors, reconciler, pipeline, queue, watcher.
6. `src/query/` — engine + the seven queries + metadata/limits/ordering helpers.
7. `src/transport/ipc/` — JSON-RPC server/client/protocol (reserve cancel/progress).
8. `src/transport/mcp/` — stdio bridge + Zod tool schemas (embed Agent Contract).
9. `src/daemon/` — lifecycle, lock, pid, version gate, recovery.
10. `src/config/` + `src/cli/` — detection, config, `brain init/start/stop/status/rebuild`.

`src/knowledge/port.ts` is a **reserved** interface-only seam (no MVP logic).

## How to work on a task

- Before nontrivial decisions, read the relevant `DESIGN_SYSTEM.md` section and
  cite it (e.g. "§8.7") when a rule constrains the decision.
- Implement one layer/module at a time, with tests, against the ports.
- After changes: typecheck (`tsc --noEmit`) then run the relevant tests.
  Report failures honestly; do not "fix" by relaxing strictness or `any`.
- Never violate a `[HARD]` rule to unblock. If a request forces one, stop and
  explain the conflict with the section reference.
- Keep commits small and scoped to one layer/module.

## Out of scope for MVP (do not build)

Neo4j, vector/semantic search, git-history indexing, ADR/docs indexing,
multi-language beyond TS/JS, performance analysis, security analysis, the full
knowledge layer, cancellation/progress *behavior* (protocol shape only),
extractor polymorphism, worker concurrency, advanced logging/caching.