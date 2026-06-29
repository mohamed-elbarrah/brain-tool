# Project Brain — Design System

> **Project Brain is not a code search engine. It is a project knowledge engine
> that exposes structured architectural knowledge to AI agents, allowing them
> to navigate a codebase without performing repository-wide search.**
>
> This document is the **enforceable** design contract for the Project Brain
> MVP. It is stricter than `PROJECT_BRAIN_PLAN.md`. Where the plan describes
> *what*, this document defines *how* and what is forbidden.
>
> Every rule here is intentional. Breaking one must require an explicit,
> documented exception. "It's just the MVP" is **not** a valid reason to break a
> rule marked **[HARD]**. Rules marked **[SOFT]** are defaults that may be
> revisited with justification.

---

## 1. Core Principles

1. **Separation of responsibilities.** Each concern is owned by exactly one
   module:
   - **Indexer** → understands code (parsing + extraction + reconciliation).
   - **Database** → stores knowledge (persistence layer only).
   - **Query Engine** → answers questions (pure read logic over a port).
   - **MCP Server** → exposes tools (transport only, no logic).
   - **Daemon** → orchestrates everything (lifecycle, watcher, queues).

2. **One writer, many readers.** Only `braind` writes to the database. The MCP
   server and any agent client is read-only.

3. **Database is the single source of truth.** No in-memory caches of
   derivable facts survive a process restart. Caches are an optimization, not
   a source of truth.

4. **Always rebuildable.** The Brain can be fully reconstructed from source via
   `brain rebuild`. The indexer is idempotent: re-indexing a file yields the
   same DB state as a fresh index of that file.

5. **Correctness over speed.** Identity and relationships are resolved
   carefully, even if slower. Perf is a later concern, gated behind a
   [SOFT] revisit.

6. **Fail closed, never corrupt.** Any unexpected error in indexing must
   leave the database in the pre-operation state. Files that fail to parse are
   quarantined, not retried in a hot loop.

7. **No side effects on source.** The Brain never writes to the project's
   source tree. It only reads it and writes to `.brain/`.

8. **Read-only for agents.** Agents can never trigger a write. All MCP tools
   are query-only. No `reindex`, no `rebuild` over MCP — those are CLI-only.

### 1.1 MVP Implementation Policy `[HARD]`

The architecture is strict; the **first implementation is intentionally
minimal.** These rules govern what gets built first and are enforceable:

1. **Working software over perfect abstractions.** Build the minimum that
   reliably answers the five MVP questions (below). Anything not serving those
   is postponed, even if "it would be nice."
2. **Design seams, don't implement futures.** Every extension point is
   *designed* (a port/interface exists, is injected, and is used by exactly
   one concrete implementation) but **not multiplied**. Ship one
   implementation per port. No second implementation is written "to prove the
   seam" unless a test requires it (the in-memory storage adapter is the one
   exception, for unit tests).
3. **One of each, by default.** One storage adapter (SQLite), one parser
   (TypeScript), one worker, one transport (stdio bridge), basic logging,
   basic tests. Concurrency, multiple parsers, vector search, the knowledge
   layer, and advanced logging are designed-in seams, **not** MVP
   deliverables.
4. **Justify each line by an MVP goal.** If a class/file exists only to serve
   an out-of-scope future, it must be a *port/interface/stub with no working
   logic*. Working logic with no MVP caller is a violation. A stub that only
   declares a type and documents the seam is allowed; a half-built feature is
   not.
5. **Simplify, then seal the seam.** Prefer the simple implementation behind
   the strict interface. The interface is the long-term guarantee; the simple
   impl is acceptable for the MVP and replaceable later without touching
   callers.
6. **No premature optimization.** No caching layers, no pooling, no batching,
   no parallelism unless a measured MVP need requires it. The architecture must
   not *block* these later, but must not *build* them now.

The five MVP questions (must work reliably — everything else is secondary):

- Where is this symbol **defined**? → `findSymbol`
- Where is it **used**? → `findUsage`
- What **depends** on it? → `findDependents`
- What **breaks** if it changes? → `impactAnalysis`
- Does **similar** functionality already exist? → `findDuplicate`

`searchComponents` / `searchRoutes` ship because components and routes are
first-class TypeScript symbols, but they are **secondary** to the five
questions.

---

## 2. Agent Contract `[HARD]`

Project Brain is not a code search engine. It is a project knowledge engine
that exposes structured architectural knowledge to AI agents, allowing them
to navigate a codebase without performing repository-wide search.

The Brain exists to become the **primary source of project knowledge.**
Agents that connect to a Brain MUST treat it as the navigation system; source
files are the final authority, **not** the discovery mechanism.

### 2.1 Required interaction order `[HARD]`

1. **Ask Brain.** Query the Brain for symbols, usage, dependents, impact, or
   duplicates *before* touching the file system.
2. **Analyze Brain results.** Use the returned `trust`, `confidence`, and
   freshness fields to decide whether the answer is sufficient.
3. **Read only the files Brain points to.** Open the specific files/locations
   the Brain returned — never a directory listing or a broad glob.
4. **Perform the implementation.**
5. **Never perform project-wide search unless the Brain cannot answer.** If a
   query returns nothing or low confidence, fall back to *targeted* reads —
   not recursive grep.

### 2.2 Forbidden agent behaviors `[HARD]`

- Recursive `grep` / `rg` as a first action.
- Full-repository scans or recursive directory walks "for context."
- Reading dozens of files to build a mental map.
- Building a temporary in-memory symbol index.
- Assuming the Brain is unavailable without first calling `capabilities` /
  `status`.

### 2.3 Correct vs. wrong workflow `[HARD]`

Correct:

```
agent → findSymbol() → read returned file → modify → done
```

Wrong:

```
agent → grep → grep → grep → read 40 files → modify
```

The Brain is the project's navigation system. Source files are the final
authority, not the discovery mechanism. An agent that greps first has
violated this contract even if it eventually produces correct code.

### 2.4 Enforcing the contract

The contract is enforced by **convention and tooling**, not by the daemon
blocking reads (the Brain is read-only and cannot stop an agent). Enforcement
means:

- The MCP server's tool descriptions embed the required order and forbidden
  behaviors, so agents that read tool docs follow the contract.
- `brain status` / `capabilities` are cheap and listed first in tool
  descriptions, so the agent's natural first step is to ask, not to scan.
- A future linter/audit hook (out of scope for MVP) may flag agents that
  issue filesystem globs before any Brain query.

---

## 3. Process Model

### 3.1 Components

```
                  ┌────────────────────────────────────────────┐
                  │                braind (daemon)              │
                  │                                            │
                  │  ┌────────┐   ┌──────────┐   ┌──────────┐   │
                  │  │ Watcher│──▶│  Indexer │──▶│ Storage  │   │
                  │  └────────┘   └──────────┘   │ Adapter  │   │
                  │       │                       └────┬─────┘   │
                  │       │                            │         │
                  │  ┌────▼─────┐   ┌──────────┐        │         │
                  │  │  Queue   │   │ Query    │◀───────┘         │
                  │  │ (debounce)│  │ Engine   │                  │
                  │  └──────────┘   └────┬─────┘                  │
                  │                      │                        │
                  └──────────────────────┼────────────────────────┘
                                         │  local IPC (socket)
                                         │
                  ┌──────────────────────▼────────────────────────┐
                  │           MCP Server (thin client)              │
                  │  read-only tools → Query Engine over IPC        │
                  └─────────────────────────────────────────────────┘
                                         │
                  ┌──────────────────────┼──────────────────────────┐
                  ▼          ▼           ▼
              OpenCode     PI       Claude Code
```

### 3.2 Daemon responsibilities `[HARD]`

- Own the SQLite database file and the **only** write connection.
- Run the file watcher.
- Run the parse/index queue.
- Perform all transactional writes.
- Serve queries to connected MCP clients over local IPC.
- Survive agent disconnects.
- Maintain a PID file, a lock file, and graceful shutdown.

### 3.3 MCP server responsibilities `[HARD]`

- Connect to `braind` over local IPC.
- Never open the SQLite file directly.
- Never write.
- Translate MCP tool calls into Query Engine calls.
- Shape results for the model; add no business logic.
- Embed the Agent Contract (§2) in tool descriptions.

### 3.4 Lifecycle

- `brain init` → create `.brain/`, build initial index, **start or attach to
  daemon**.
- `brain start` → ensure daemon running.
- `brain stop` → graceful daemon shutdown (drain queue, close DB).
- `brain status` → daemon health + indexing state (freshness fields, §8.5).
- `brain rebuild` → wipe index tables, full rescan (CLI-only).
- The MCP server is launched by the agent host (stdio-to-IPC bridge) and
  connects to the already-running daemon.

### 3.5 Single-instance guarantee `[HARD]`

- One daemon per project root, enforced by an advisory lock on
  `.brain/brain.lock` plus PID file `.brain/brain.pid`.
- A second `braind` against the same root must fail fast with a clear error.
- Stale lock (PID not alive) is reclaimable with a forced start flag only.

---

## 4. Transport & IPC

### 4.1 Internal IPC (daemon ↔ MCP server) `[HARD]`

- Use a **local Unix domain socket** on POSIX and a named pipe on Windows,
  located under `.brain/` (`brain.sock` / `\\.\pipe\brain.<hash>`).
- Protocol: **JSON-RPC 2.0** over length-prefixed framing.
- The daemon authenticates the connection by a token written to
  `.brain/token` with restrictive file permissions (0600). No network
  exposure.
- MVP keeps the IPC simple: one socket, length-prefixed JSON-RPC, no batching,
  no binary framing, no multiplexing. Optimization is a later adapter.
- Every request carries an optional client-supplied `id` (JSON-RPC id) usable
  for future cancellation (§4.5).

### 4.2 External transport (agents ↔ MCP server) `[SOFT]`

- Default to **MCP over stdio** for agent compatibility (OpenCode, PI, Claude
  Code all support stdio MCP).
- The stdio MCP server is a *bridge*: it speaks MCP on stdio and JSON-RPC to
  the daemon on the socket. This keeps the daemon agent-agnostic and
  long-lived while remaining compatible with stdio-only agent hosts.
- A future HTTP/SSE transport can be added behind the same Query Engine port.

### 4.3 What crosses the wire `[HARD]`

- Only Query Engine requests and responses.
- No file paths outside the project root are ever returned.
- No source code is returned by default; tools return locations and
  metadata. (A `readSymbolSource` tool may exist but is opt-in and bounded.)
- Internal numeric ids (`file_id`, `symbol_id` rowids) are never returned;
  stable external identities are used instead (§6.2).

### 4.4 Capability negotiation `[HARD]`

The daemon exposes `brain.capabilities` (and the MCP server exposes the
equivalent) returning the set of supported tools and features with their
versions:

```jsonc
{
  "tools": ["findSymbol","findUsage","findDependents","impactAnalysis",
            "findDuplicate","searchComponents","searchRoutes"],
  "features": { "semanticSearch": false, "knowledgeLayer": false,
                "transitiveDepth": 1 },
  "versions": { "format": 1, "schema": 1, "ipcProtocol": 1, "mcpTools": 1 }
}
```

- Agents MUST call `capabilities` before assuming any tool exists.
- Later versions add features without breaking older clients: unknown tools
  are simply absent from the list.
- All four versions are independent (§6.7).

### 4.5 Cancellation & progress (reserved) `[SOFT]` for MVP, `[HARD]` in protocol shape

The IPC protocol **reserves** method names and request fields for
cancellation/progress even though the MVP does not implement the behavior:

- `cancel(id)` — reserved method; the MVP returns `NotImplemented`.
- `progress(id, partial)` — reserved notification; the MVP does not emit it.
- Requests carry an optional `id` the client may use to cancel.

Reserving the shape now means adding cancellation later is non-breaking. Do
**not** implement the behavior in the MVP; just keep the field slots and
method names so the wire shape is stable.

---

## 5. Architecture & Layering

### 5.1 Layers `[HARD]`

Layers may only depend **downward**. No upward or skip-layer imports.

```
Layer 4: Transport        (MCP server, CLI commands)
Layer 3: Query Engine     (pure read functions over a port)
Layer 2: Indexing         (watcher, parser port + registry, extractors,
                           reconciler, pipeline)
Layer 1: Storage (port)   (StoragePort interface + SQLite adapter)
Layer 0: Domain / Core     (entities, value objects, types — no I/O)
```

- Domain (Layer 0) depends on nothing.
- Storage adapter implements the StoragePort; the daemon depends on the port,
  not the adapter. Swapping SQLite for Neo4j only adds an adapter.
- The Indexer depends on `ParserPort`, `StoragePort`, and Domain, never on the
  daemon or transport.
- The Query Engine depends on `ReadStoragePort` and Domain, never on transport.
- Transport depends on Query Engine + Domain result types only.

### 5.2 Module boundaries `[HARD]`

Each module exports a small, documented surface. No reaching into another
module's internals. No `*` barrels that re-export implementation details; only
public types/values are re-exported.

### 5.3 Forbidden couplings `[HARD]`

- No import of `better-sqlite3` / `node:sqlite` outside the SQLite adapter.
- No import of MCP SDK outside the transport layer.
- No import of a concrete parser (e.g. the TypeScript compiler API) outside the
  `parsers/` directory and extractors. The pipeline reaches parsers only via
  `ParserPort`.
- No transport code imports storage code directly.

### 5.4 Dependency injection

- The daemon assembles the object graph at startup: construct the storage
  adapter, construct the parser registry, inject into indexer and query
  engine, inject query engine into the IPC server, inject MCP bridge into the
  stdio entrypoint.
- No module constructs its own dependencies via globals or singletons.
  Exception: logging, which may be a process-wide singleton with an injectable
  sink for tests.

---

## 6. Data Model & Identity

### 6.1 Internal identity strategy `[HARD]`

- A **Symbol** is internally identified by `(file_id, local_name, kind)`. This
  is the primary unit of "where is this defined."
- A **Reference** is a raw, unresolved mention of a name in a file (import
  specifier, call expression, type reference). It is stored as-is during
  parsing.
- Resolution of References to Symbols happens in a **reconciliation pass**,
  not during parsing. Unresolved references are retained (not dropped), so a
  later import change can resolve them.
- Names are **not** globally unique. Resolution is scoped by the importing
  file's import bindings, then by file-local declarations, then by the
  project's exported symbols. Order matters and is documented in the indexer.

### 6.2 Stable external identities `[HARD]`

Internal `file_id` / `symbol_id` are DB rowids and may change after a rebuild.
External surfaces (query results, MCP tools, IPC) MUST expose **stable**
identities instead:

- **File:** `relativePath` (project-relative, forward-slash normalized). This
  is the stable external file identity; `fileId` is internal only.
- **Symbol:** a stable `symbolId` string formed deterministically from
  `(relativePath, localName, kind)` via a documented hash, plus
  `signatureHash` (a hash of the symbol signature). Agents reference symbols
  by `symbolId` once discovered, not by bare name.

Query results always include `relativePath`, `symbolId`, `kind`, `name`, and
`signatureHash`. Internal numeric ids are never returned across the IPC
boundary (§4.3).

### 6.3 Core tables (logical model)

> Physical schema is owned by the SQLite adapter. This logical model is the
> contract other layers reason about.

- `projects` — root path, schema version, config hash.
- `files` — `id`, `path` (relative to root), `language`, `mtime`, `hash`,
  `parse_state` (ok|error|quarantined), `last_indexed_at`.
- `symbols` — `id`, `file_id`, `name`, `kind` (function|class|component|hook|
  type|interface|enum|const|route|var), `local_name`, `exported`, `location`
  (start/end offsets or line/col), `signature`, `signature_hash`.
- `symbol_members` — `symbol_id`, `kind` (method|property|param), `name`,
  `type`, `order`.
- `references` — `id`, `file_id`, `kind` (import|call|type|jsx|reexport),
  `specifier` (raw text), `target_file_hint`, `target_symbol_id` (nullable,
  filled by reconciliation), `location`.
- `edges` — `source_symbol_id`, `kind` (calls|callees-of|imports|extends|
  implements|uses-component|route-handler), `target_symbol_id` (nullable
  pre-resolution), `target_reference_id` (nullable). Explicit only.
- `components` — `symbol_id`, `props` (structured), `imported_component_ids`
  (via edges).
- `routes` — `symbol_id` (or file_id), `path`, `method`, `controller_symbol_id`.
- `schema_migrations` — version, applied_at.

### 6.4 Integrity rules `[HARD]`

- Foreign keys ON, `PRAGMA foreign_keys = ON`.
- All writes inside explicit transactions.
- File replacement is **delete-then-insert** within one transaction:
  - delete rows for `file_id` (symbols, members, references, edges, component,
    route) via `ON DELETE CASCADE`.
  - insert fresh rows for the new parse.
  - commit once. A failure rolls back to the previous state of that file.
- This makes per-file updates atomic and idempotent at the file level.
- `parse_state` records outcome; quarantined files are excluded from queries
  but retained so a subsequent edit retries them.

### 6.5 Migrations `[HARD]`

- Forward-only, versioned migrations stored as code, applied by the daemon on
  startup inside a transaction.
- No down migrations in the MVP. `brain rebuild` recreates content; schema
  migrations only evolve structure.
- A migration that fails aborts startup with the DB untouched (run inside a
  single transaction; SQLite DDL is transactional).

### 6.6 SQLite operational settings `[HARD]`

- WAL mode for concurrent readers + single writer.
- `synchronous = NORMAL` (safe with WAL, fast enough).
- `temp_store = MEMORY`.
- One write connection (daemon); read connections are short-lived or pooled,
  opened read-only.
- `PRAGMA busy_timeout` set to a few seconds.

### 6.7 Versioning surfaces `[HARD]`

Four independent versions, each evolved on its own schedule:

1. **Brain format** — on-disk `.brain/` contract (in `version.json`).
2. **Schema** — SQLite table/index DDL (migration level).
3. **IPC protocol** — JSON-RPC method names + field shapes.
4. **MCP tools** — tool names + Zod input/output schemas.

Bumping one must not require bumping the others. Capability negotiation
(§4.4) reports all four. Adding a tool is an MCP-tools bump only; adding a
column is a schema bump only. Renaming an IPC method is an IPC-protocol bump
that MUST be **additive** (new method added, old method kept) within the
MVP's lifetime to avoid breaking deployed daemons.

### 6.8 Brain versioning `[HARD]`

- `.brain/version.json` records the Brain **format version** and the
  **schema version** (the two on-disk surfaces from §6.7).
- On startup the daemon compares `version.json` to the built-in supported
  versions:
  - **Compatible** (format equal, schema ≤ current) → run pending migrations.
  - **Incompatible format** (older or unknown major) → the daemon refuses to
    start with a clear message and instructs `brain rebuild`. The index is
    cheap to recreate and forward-only migrations do not guarantee reads of
    old formats.
  - **Schema newer than binary** → refuse to start (downgrade not supported).
- `brain rebuild` regenerates `version.json` from the current binary and
  reindexes. This is the automatic recovery path for incompatible versions —
  the daemon may surface a one-shot "version mismatch, rebuild required"
  state instead of silently proceeding.
- `metadata.json` keeps operational stats (last scan, root hash); it is
  advisory, not a compatibility gate.

---

## 7. Indexing Pipeline

### 7.0 Parser seam (ParserPort) `[HARD]`

The pipeline is **not** coupled to TypeScript. Parsing sits behind a port:

```ts
type LanguageTag = "typescript" | "javascript"; // extensible

interface ParserPort {
  readonly language: LanguageTag;
  readonly extensions: readonly string[]; // e.g. [".ts", ".tsx"]
  parse(source: string, filePath: string): Result<FileParse, ParseError>;
}
```

- The pipeline depends on `ParserPort`, never on a specific parser.
- The MVP ships **exactly one** implementation: `TypeScriptParser` (`.ts` +
  `.tsx`, including React component extraction). `.js`/`.jsx`, if shipped,
  reuse it with `language: "javascript"`.
- A `ParserRegistry` maps `LanguageTag → ParserPort`. Adding Python/Go later
  is a new implementation + registry entry; the pipeline is unchanged.
- Extractors in the MVP are **TypeScript-aware** (they consume the TS AST
  inside `FileParse`). A parser-agnostic extractor seam is **not** built in the
  MVP — it is a documented future seam, not a present abstraction. Do not
  build extractor polymorphism now; build it when the second parser is real.
  This is the deliberate line between "keep the seam" and "don't
  overengineer."

### 7.1 Stages

```
FS event → debounce (per-file, ~150ms) → enqueue
→ Parser (AST) → Extractor (symbols/refs) → Reconciler (resolve refs→symbols)
→ StoragePort.upsertFile(transaction) → mark file ok / quarantine
```

### 7.2 Rules `[HARD]`

- Parsing is per-file, independent, and pure given (source, language).
- Extraction produces a serializable `FileIndex` value object. No DB access
  during extraction.
- Reconciliation reads existing project symbols (via StoragePort reads) and
  writes only `target_symbol_id` updates plus new edges. Reconciliation is
  idempotent: running it twice yields identical DB state.
- The full file update (symbols + members + refs + edges + component/route)
  is one transaction, one `upsertFile` call.
- A file that errors at parse time is marked `parse_state = error` with the
  error message; its previous rows (if any) are removed. It is not retried
  automatically until the file changes again.
- Partial project states are valid: indexing file B must not assume file A is
  already indexed. Reconciliation tolerates unresolved targets.

### 7.3 Queue discipline `[HARD]`

- Single in-flight parse worker (MVP). Concurrency can be added later behind
  the same queue interface.
- Debounce is per-path: rapid save storms coalesce into one parse.
- Renames are handled as delete(old) + add(new) events sequenced correctly by
  the queue.
- The queue is in-memory; on graceful shutdown it drains. On crash it is
  empty; the next startup reconciles file `mtime`/`hash` vs DB and re-enqueues
  changed files.

### 7.4 Initial scan / rebuild `[HARD]`

- Full scan iterates files and enqueues them; it does not bypass the queue.
- This guarantees the same code path for incremental and initial indexing.
- `brain rebuild` truncates content tables (preserving schema) and runs a full
  scan. Always safe because the indexer is idempotent.

---

## 8. Query Engine

### 8.1 Rules `[HARD]`

- Pure functions: `(storagePort, params) → Result<T>`.
- No writes. No side effects. No logging of user data at info level.
- All queries return structured results; stringification is the transport's
  job.
- Deterministic: same DB state + params → same result (and same order, §8.7).
- Never throw for expected conditions (not found → `Result.ok(null)`). Throw
  only for programmer errors / invariant violations.

### 8.2 Result & error model `[HARD]`

- Use a `Result<T, E>` discriminated union (`{ok: true, value}` |
  `{ok: false, error: BrainError}`). No `try/catch` for control flow in the
  engine or transport.
- `BrainError` has a typed `code` (e.g. `SymbolNotFound`, `BadInput`,
  `LimitExceeded`, `Internal`) and a message. Internal errors never leak file
  paths or stack to the agent; they are logged with a correlation id.

### 8.3 Trust levels `[HARD]`

Every query result carries a `trust` field so the agent can distinguish exact
answers from inferred ones:

- `exact` — derived directly from indexed facts (definitions, imports, raw
  references). Examples: `findSymbol`, `findUsage` (direct references).
- `estimated` — derived from graph traversal that may be incomplete due to
  unresolved references or partial indexing. Examples: `impactAnalysis`,
  `findDependents`.
- `approximate` — heuristic / structural match, not a semantic proof.
  Example: `findDuplicate` (same name+kind across files).

Default trust per tool is fixed by the engine and documented in §8.10. Agents
must not assume all results are `exact`.

### 8.4 Confidence score `[HARD]`

Every result includes `confidence: number` in `[0,1]`:

- `1.0` — exact, fully resolved, fresh.
- `<1.0` — reduced by: unresolved references in the result set, stale data
  (pending queue, §8.5), partial indexing, or heuristic matching.

The engine computes confidence from a documented formula per tool. Agents use
it to decide whether to verify by reading the pointed-to files. Confidence is
**not** a substitute for `trust`; `trust` says *what kind* of answer it is,
`confidence` says *how reliable this instance* is.

### 8.5 Freshness `[HARD]`

Every response (and `brain status`) exposes:

- `lastIndexed` — timestamp of the most recent successful file index.
- `queueSize` — number of pending files in the indexer queue.
- `dirtyFiles` — count of files known to be changed but not yet reindexed.
- `indexVersion` — schema/format version of the index that produced these
  results.

If `queueSize > 0` or `dirtyFiles > 0`, results may be stale; the response
MUST set `possiblyStale: true` and reduce `confidence` accordingly. Agents
must not treat a possibly-stale result as authoritative without checking the
pointed-to files.

### 8.6 Resource limits `[HARD]`

All queries enforce limits to prevent an LLM from accidentally requesting the
whole repository. Defaults are configurable in `config.json`; hard ceilings
are enforced by the engine:

- `maxResults` — cap on rows returned per query.
- `maxTraversalDepth` — max edge-hops for graph queries (1 in MVP).
- `maxReturnedSymbols` — cap on symbols in one response.
- `maxPayloadSize` — byte cap on the serialized response.

Exceeding a limit returns a `Result` error with code `LimitExceeded`, the
limit value, and a hint to narrow the query. The response never silently
truncates.

### 8.7 Deterministic ordering `[HARD]`

Every multi-row result has a defined, stable order:

1. by file `relativePath` (ascending),
2. by line (ascending),
3. by column (ascending),
4. by `symbolId` (ascending) as the final tiebreaker.

No query may return rows in insertion or DB-rowid order. Identical DB state +
params always produce identical, byte-comparable result ordering. This is
what makes rebuild idempotency provable (§19.6).

### 8.8 Query cost `[HARD]`

Every query response includes `estimatedCost: "FAST" | "MEDIUM" |
"EXPENSIVE"` so an LLM can avoid hammering expensive traversals:

- `FAST` — single-table lookup / direct reference read (`findSymbol`).
- `MEDIUM` — bounded multi-row scan (`findUsage`, `searchComponents`).
- `EXPENSIVE` — graph traversal (`impactAnalysis`, `findDependents` with
  depth>1 in future).

The engine sets cost from the query plan, not from timing. The MVP does not
measure; it classifies statically per tool.

### 8.9 MVP tools (Query Engine functions → MCP tools)

- `findSymbol(name, kind?)` → symbol(s) + file + location.
- `findUsage(symbolId)` → referencing files + reference kinds + locations.
- `findDependents(fileId | symbolId)` → reverse dependency closure (one level
  for MVP; transitive optional).
- `impactAnalysis(symbolId | fileId)` → affected files/symbols via edges.
- `findDuplicate(name, kind)` → symbols with same name+kind across files
  (structural name match for MVP; semantic similarity is future).
- `searchComponents(query?)` → components with props + imported components.
- `searchRoutes(query?)` → routes with method + controller.

Each tool's input/output schema is defined once (Zod) and shared by the Query
Engine validation and the MCP tool definition. No duplicated schemas.

### 8.10 Per-tool metadata defaults `[HARD]`

| Tool | trust | confidence base | estimatedCost | notes |
|------|-------|-----------------|---------------|-------|
| `findSymbol` | exact | 1.0 | FAST | reduced if `possiblyStale` |
| `findUsage` | exact | 1.0 (resolved), lower if unresolved refs present | MEDIUM | — |
| `findDependents` | estimated | 0.9 | MEDIUM | depth 1 |
| `impactAnalysis` | estimated | 0.8 | EXPENSIVE | depth 1; lower with unresolved refs |
| `findDuplicate` | approximate | 0.6 | MEDIUM | structural name match only |
| `searchComponents` | exact | 1.0 | MEDIUM | — |
| `searchRoutes` | exact | 1.0 | MEDIUM | — |

All `confidence` values are further reduced by `possiblyStale` per §8.5.
These are the MVP defaults; the formula per tool is documented in code.

---

## 9. Storage Port (the swappability seam)

### 9.1 Interface `[HARD]`

`StoragePort` is a TypeScript interface in Layer 1 with no implementation. It
exposes only what the Indexer and Query Engine need:

- Read methods: `getFiles`, `getFile`, `getSymbolsInFile`, `getSymbol`,
  `resolveReference`, `querySymbols`, `queryReferences`, `getEdges`,
  `getComponent`, `getRoute`, etc.
- Write methods (indexer only): `upsertFile(fileIndex)`, `deleteFile(path)`,
  `markFileState(path, state)`, `runMigrations`, `beginTransaction`,
  `commit`, `rollback` (or a `tx(fn)` helper).

The Query Engine sees **only** read methods. The indexer sees read + write.
Enforce this at the type level: the Query Engine is constructed with a
`ReadStoragePort` (a read-only supertype), the indexer with the full
`StoragePort`.

### 9.2 Swappability contract `[HARD]`

- Adding Neo4j means writing a `Neo4jStorageAdapter` implementing `StoragePort`.
- No other layer changes. This is the success criterion for the seam.
- The MVP ships only the SQLite adapter, but unit tests run against the
  interface using an in-memory adapter, so a second adapter is plausible.

---

## 10. Configuration & Project Detection

### 10.1 Project root detection `[HARD]`

- Walk upward from CWD to the nearest directory containing `package.json` with
  a project name, OR a `tsconfig.json`. That is the root.
- The root must be explicitly confirmed for `brain init`. `brain` subcommands
  resolve root from CWD automatically and error if none found.

### 10.2 Supported project `[HARD]`

- MVP supports TypeScript (`.ts`, `.tsx`) and JavaScript (`.js`, `.jsx`).
- **First implementation must ship `.ts` and `.tsx`** including React component
  extraction.
- `.js`/`.jsx` support is implemented by the same parser pipeline with a
  language tag; if it must ship later, it is a flag flip + testing, not a
  rewrite. The parser is selected by `LanguageTag` via `ParserRegistry`, never
  by file-extension branching scattered in code.

### 10.3 `.brain/` layout

```
.brain/
├── brain.db            # SQLite database (WAL: brain.db-wal, brain.db-shm)
├── version.json        # Brain format + schema version (compatibility gate)
├── config.json         # user-overridable config (ignores, parser opts, limits)
├── metadata.json       # last scan, project root hash (advisory)
├── brain.pid           # daemon PID
├── brain.lock          # single-instance advisory lock
├── brain.sock          # local IPC socket (POSIX)
├── token               # IPC auth token (0600)
└── cache/              # optional derived caches (never source of truth)
```

- `.brain/` is created by the daemon and is **append/rebuild-only** for users.
  Document "never edit manually" in `metadata.json` as a header.
- Add `.brain/` to the project's ignore expectations in docs (user adds to
  `.gitignore` themselves; the daemon prints a reminder on `init`).

### 10.4 Ignore rules `[HARD]`

- Always ignore: `.brain/`, `node_modules/`, `.git/`, build output dirs from
  tsconfig (`outDir`), and patterns from `.gitignore` (parsed) unless
  overridden in `config.json`.
- Binary files and files > a configurable size cap are skipped.

### 10.5 Resource limit defaults `[HARD]`

`config.json` carries the limit defaults from §8.6 with hard ceilings the
engine enforces regardless of config (preventing a user from disabling
protection):

- `maxResults` default 200, ceiling 5000.
- `maxTraversalDepth` default 1, ceiling 5.
- `maxReturnedSymbols` default 100, ceiling 2000.
- `maxPayloadSize` default 256KiB, ceiling 2MiB.

---

## 11. Concurrency & Integrity

- `[HARD]` Single writer: only the daemon holds the write connection.
- `[HARD]` Read connections are read-only; query engine never writes.
- `[HARD]` Every file update is one transaction with cascading deletes + fresh
  inserts.
- `[HARD]` Reconciliation updates are batched in the same transaction where
  possible; cross-file edge updates that depend on not-yet-indexed files are
  deferred and reconciled again on the next affected change (eventually
  consistent, never lost).
- `[HARD]` Crash recovery: on startup, compare each tracked file's `mtime` +
  content hash to the DB; enqueue mismatches. This is the safety net for
  crashes mid-update.
- `[HARD]` No `await` between a delete and its corresponding insert across a
  transaction boundary. The transaction is opened, all writes issued, then
  committed — no interleaving with other file updates.

---

## 12. Error Handling & Logging

### 12.1 Error policy `[HARD]`

- Expected failures (file unreadable, parse error, symbol not found, bad
  input, limit exceeded) → `Result`/`BrainError`, not exceptions.
- Unexpected failures (DB corruption, invariant violation) → throw, log with
  stack + correlation id, and the daemon continues if possible (quarantine the
  file) or exits cleanly if the failure is systemic.
- The daemon must not crash the whole service on one bad file. Bad files are
  quarantined and reported via `brain status`.

### 12.2 Logging `[SOFT]` for MVP; the seam is `[HARD]`

- The MVP ships **basic** logging: simple structured lines (JSON or
  key=value) to `.brain/logs/brain.log` and stderr. No rotation, no
  transports, no remote sinks, no sampling, no distributed tracing. Levels
  limited to info/warn/error in the first cut (debug via `--verbose`).
- The logger is behind a `Logger` interface — **this seam is `[HARD]`**. The
  MVP impl is a plain file+stderr writer. Advanced logging (rotation,
  sampling, structured transports) is a later adapter behind the same
  interface, not an MVP deliverable.
- Never log source code bodies. Log file paths (relative), symbol names,
  counts, error codes. A simple integer correlation id per indexing job and
  per query is enough for MVP.

---

## 13. Coding Conventions `[HARD]` unless noted

- **Language:** TypeScript, `strict: true`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
  `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`.
- **Modules:** ESM only (`"type": "module"`), `.js` extensions in relative
  imports.
- **Runtime:** Node 20+. Engine pinned in `package.json` `engines`.
- **No `any`.** No `// @ts-ignore` without a comment explaining the escape and
  a follow-up. `unknown` + narrowing preferred.
- **Errors:** `Result` for expected, `throw` only for bugs. No swallowed
  errors (`catch {}` is forbidden; `catch (e) { log... }` is fine).
- **Naming:** files `kebab-case.ts`, types/interfaces `PascalCase`, functions
  and vars `camelCase`, constants `SCREAMING_SNAKE`, types prefixed by role
  only where helpful (no `IInterface` prefix).
- **Imports:** order = (1) node builtins, (2) external, (3) internal absolute,
  (4) relative. No default exports from library code (named exports only);
  default exports allowed only at framework entrypoints (MCP tool handlers).
- **Barrels:** `index.ts` re-exports public surface only. No re-export of
  internals.
- **No globals / singletons** except logger.
- **Schemas:** Zod for all external boundaries (CLI args, MCP input, config).
  Domain types derived from Zod where it's a boundary.
- **Tests live next to code** (`foo.test.ts`) co-located.
- **Async:** prefer `async`/`await`; no `.then` chains; no fire-and-forget
  promises (every promise is awaited or `void`-tagged with justification).
- **Determinism:** query result shaping and ordering (§8.7) must be enforced
  in code, not left to DB default order. No `SELECT * ... ` without an
  `ORDER BY` for any multi-row query that crosses the IPC boundary.

### 13.1 Forbidden dependencies `[HARD]`

- No ORM in the MVP (Prisma/Drizzle/TypeORM). Raw parameterized SQL via the
  SQLite adapter only. An ORM would leak its model into Layer 0 and break the
  swap seam. (Revisit for scale.)
- No global state libraries, no DI frameworks. Manual composition at the
  daemon root.
- No `lodash`/`underscore` for things TS/Node already do.

---

## 14. Testing Strategy

The MVP ships **basic, high-value tests only.** Exhaustive property testing
and full contract suites are deferred — the seams let them be added later
without rework, so they are not justified by the MVP goals now.

**Must exist for MVP:**

- **Unit tests** against `StoragePort` using the in-memory adapter — highest
  value. Every public Query Engine function and every `StoragePort` read
  method gets a happy-path and a not-found/failure-path test.
- **Adapter smoke tests** against the real SQLite adapter (tmp DB per test):
  migrations apply, `upsertFile` is atomic, cascades delete correctly, WAL
  opens read-only for queries.
- **Pipeline tests** with one or two fixture projects under `test-fixtures/`
  covering the must-work scenarios:
  - first index correctness
  - incremental add / modify / delete
  - reconciliation resolves cross-file references
  - parse error quarantine
  - rebuild idempotency (index → rebuild → identical, order-stable query
    results per §8.7)
- **Query-metadata tests**: each tool returns the required fields
  (`trust`, `confidence`, freshness, `estimatedCost`, stable identities) and
  respects limits with `LimitExceeded`.
- **MCP smoke test**: one end-to-end call through the stdio bridge to a stub
  daemon returns a correct result, and `capabilities` reports the expected
  tool list + versions.

**Deferred (seam preserved, not MVP):**

- Property-based idempotency tests, full MCP contract matrix, partial-project
  permutations, crash-recovery fault injection, rename sequencing,
  transitive-closure exhaustive cases, cancellation/progress behavior. These
  are valuable but not required for the success criterion.

### 14.1 What must not be tested `[SOFT]`

- Implementation details of the SQLite adapter (SQL strings). Test behavior
  via the port.

---

## 15. Project Layout

```
brain-tool/
├── package.json
├── tsconfig.json
├── README.md
├── PROJECT_BRAIN_PLAN.md
├── DESIGN_SYSTEM.md            # this file
├── src/
│   ├── domain/                  # Layer 0: entities, value objects, BrainError
│   │   ├── symbol.ts
│   │   ├── reference.ts
│   │   ├── edge.ts
│   │   ├── component.ts
│   │   ├── route.ts
│   │   ├── file-index.ts        # the serializable per-file extraction result
│   │   ├── identity.ts          # stable symbolId + signatureHash helpers
│   │   ├── result.ts            # Result<T,E>
│   │   └── errors.ts
│   ├── storage/                 # Layer 1: port + adapters
│   │   ├── port.ts              # StoragePort, ReadStoragePort interfaces
│   │   ├── sqlite/
│   │   │   ├── adapter.ts
│   │   │   ├── schema.ts
│   │   │   ├── migrations/
│   │   │   └── statements.ts
│   │   └── in-memory/adapter.ts # for unit tests
│   ├── indexing/                # Layer 2
│   │   ├── watcher.ts
│   │   ├── queue.ts
│   │   ├── parser-port.ts      # ParserPort interface + LanguageTag
│   │   ├── parser-registry.ts  # LanguageTag -> ParserPort (one entry: TS)
│   │   ├── parsers/
│   │   │   └── typescript.ts   # MVP: the only parser implementation
│   │   ├── extractors/         # TS-aware in MVP (extractor seam deferred)
│   │   │   ├── symbols.ts
│   │   │   ├── components.ts
│   │   │   └── routes.ts
│   │   ├── reconciler.ts
│   │   └── pipeline.ts        # orchestrates parse→extract→reconcile→store
│   ├── query/                    # Layer 3
│   │   ├── engine.ts
│   │   ├── metadata.ts        # trust/confidence/freshness/cost helpers
│   │   ├── limits.ts          # resource limits + LimitExceeded
│   │   ├── ordering.ts        # deterministic ordering (§8.7)
│   │   └── queries/
│   │       ├── find-symbol.ts
│   │       ├── find-usage.ts
│   │       ├── find-dependents.ts
│   │       ├── impact-analysis.ts
│   │       ├── find-duplicate.ts
│   │       ├── search-components.ts
│   │       └── search-routes.ts
│   ├── transport/               # Layer 4
│   │   ├── ipc/
│   │   │   ├── server.ts        # daemon side
│   │   │   ├── client.ts        # MCP bridge side
│   │   │   └── protocol.ts     # JSON-RPC method defs + reserved cancel/progress
│   │   └── mcp/
│   │       ├── server.ts        # stdio MCP bridge
│   │       ├── tools.ts         # tool schemas (Zod) + handlers + Agent Contract docs
│   │       └── schemas.ts
│   ├── daemon/
│   │   ├── daemon.ts            # lifecycle, composition root
│   │   ├── lock.ts
│   │   ├── pid.ts
│   │   ├── version.ts          # version.json compat gate + auto-rebuild
│   │   └── recovery.ts         # startup mtime/hash reconciliation
│   ├── config/
│   │   ├── config.ts
│   │   ├── detection.ts         # project root detection
│   │   └── schema.ts            # Zod config schema (incl. limits)
│   ├── knowledge/               # RESERVED seam (no MVP logic): KnowledgePort
│   │   └── port.ts             # interface only; documents the future layer
│   ├── cli/
│   │   ├── index.ts             # bin entry: brain <command>
│   │   ├── commands/
│   │   │   ├── init.ts
│   │   │   ├── start.ts
│   │   │   ├── stop.ts
│   │   │   ├── status.ts
│   │   │   └── rebuild.ts
│   └── logging/
│       └── logger.ts
└── test-fixtures/
    ├── ts-react/
    └── ts-lib/
```

---

## 16. Reserved Seams & Scaling (designed, not built)

These seams are explicitly designed so future extensions do not require
restructuring. Each is a port/interface + exactly one MVP implementation (or
none). Building a second implementation now is a violation of §1.1.

- **Knowledge layer** → a reserved `KnowledgePort` + `src/knowledge/`
  namespace. The MVP indexes source only. The place for future non-source
  knowledge — architecture decisions, coding standards, project glossary,
  business terminology, development rules — is reserved as an interface with
  **no MVP implementation**. The Query Engine and Indexer do not depend on it
  yet; it is a standalone seam to be wired when the knowledge layer becomes
  real.
- **Parser plugins** → `ParserPort` + `ParserRegistry`. Adding a language is
  a new `ParserPort` implementation + registry entry; the pipeline is
  unchanged. (See §7.0.)
- **Extractor polymorphism** → extractors are TS-specific in the MVP. The seam
  is **not** abstracted now; it materializes when a second parser is real.
- **Storage adapter** → swap SQLite for Neo4j / vector store behind
  `StoragePort`.
- **Concurrency** → the queue interface can grow a worker pool without
  changing the pipeline.
- **Semantic search** → a derived index populated by an indexer extension
  reading from `StoragePort`; queries add a new engine method; surfaces in
  `capabilities.features.semanticSearch`.
- **Transitive graph queries** → `findDependents` returns one level in MVP;
  the interface can add a `depth` param later (bounded by
  `maxTraversalDepth`).
- **Transport** → MCP-over-stdio now; HTTP/SSE later behind the same Query
  Engine.
- **Cancellation & progress** → protocol shape reserved (§4.5); behavior
  deferred.

Anything **not** in this list is out of scope for the MVP seam design and may
require rework later — that's an accepted tradeoff, not a gap.

---

## 17. Performance Budgets `[SOFT]`

Budgets (not benchmarks). They keep future optimizations grounded in UX. The
MVP should meet these on a mid-size project (~5k files) on commodity
hardware. Missed budgets are a tracked issue, not a release blocker, but
persistent breaches require design attention.

| Operation | Budget |
|-----------|--------|
| `findSymbol` | < 50ms |
| `findUsage` | < 100ms |
| `findDependents` (depth 1) | < 100ms |
| `impactAnalysis` (depth 1) | < 500ms |
| `findDuplicate` | < 200ms |
| `searchComponents` / `searchRoutes` | < 100ms |
| Incremental single-file update (watcher → indexed) | < 1s |
| Initial scan throughput | ≥ 200 files/s |
| Daemon idle RSS | < 120MB |

The MVP does not ship a benchmark harness. Budgets are validated by a single
smoke-benchmark in CI (optional). `estimatedCost` (§8.8) is a static
classification, **not** a measured value, and is independent of these
budgets.

---

## 18. Frozen vs. Allowed for MVP

### Frozen `[HARD]`
- The vision: Brain is a project knowledge engine, not a code search engine
  (§0 blockquote), and the Agent Contract (§2).
- Process model: daemon + thin MCP client.
- Transport: local IPC (Unix socket / named pipe) + stdio MCP bridge; protocol
  shape including reserved cancel/progress slots.
- Capability negotiation (`brain.capabilities`) and the four independent
  version surfaces (§6.7).
- Languages: `.ts`, `.tsx` (with React components).
- Node 20+, TS strict, ESM.
- Layering and dependency direction.
- `StoragePort` as the only storage seam; raw SQL in the SQLite adapter.
- `ParserPort` + `ParserRegistry` as the parser seam; one implementation
  (TypeScript) in the MVP.
- Result-based error model; no exceptions for control flow.
- WAL, single writer, transactional file upserts.
- Internal identity `(file_id, name, kind)` + lazy reference resolution;
  stable external identities (`relativePath`, `symbolId`, `signatureHash`).
- Query result metadata: `trust`, `confidence`, freshness, `estimatedCost`,
  deterministic ordering, resource limits with `LimitExceeded`.
- Brain versioning via `.brain/version.json` with auto-rebuild on
  incompatibility.

### Allowed to evolve `[SOFT]`
- Debounce timing and queue scheduling defaults.
- Exact `.brain/cache/` contents (may be empty / absent in MVP).
- Logging sophistication — MVP is basic; rotation/sampling/tracing are later
  adapters behind the `Logger` interface.
- Test exhaustiveness — MVP is basic high-value tests; property/contract
  suites are deferred (seam preserved).
- IPC optimization — MVP is a simple length-prefixed JSON-RPC socket; pooling,
  batching, binary framing are later.
- Whether read DB connections are pooled or short-lived.
- `.js`/`.jsx` shipping in the first cut or immediately after (architecture
  must support it regardless).
- Performance budgets (§17) are targets, not gates.
- The exact per-tool `confidence` formulas (§8.10); the *fields* are frozen,
  the *numbers* may be tuned with justification.

### Explicitly out of scope for MVP
- Neo4j, vector search, semantic search, git history, ADR indexing, docs
  indexing, multi-language (beyond TS/JS), performance analysis, security
  analysis, the full knowledge layer, cancellation/progress *behavior*
  (shape is reserved). (Per the plan + refinements.)

---

## 19. Success Criteria for the MVP Implementation

**Primary objective:** the MVP is successful when an AI agent can **stop
searching the project blindly** and instead rely on Project Brain to quickly
obtain accurate project context before implementation. Everything below is in
service of that single objective; everything else is secondary.

The MVP is done when:

1. `brain init` on a real TS/TSX project builds a complete index in one pass.
2. Editing, adding, renaming, or deleting a file updates the index
   incrementally and correctly within debounce time.
3. All seven Query Engine tools return correct results over the local IPC,
   with the **five MVP questions** (defined / used / depends / impact /
   duplicate) answered accurately.
4. Every query result carries `trust`, `confidence`, freshness,
   `estimatedCost`, stable identities, and respects resource limits; ordering
   is deterministic.
5. `brain.capabilities` reports the supported tools, features, and the four
   versions; agents call it before assuming any tool exists.
6. A stdio MCP server bridges the tools and is consumable by at least one
   agent host (PI or Claude Code), so the agent queries the Brain instead of
   scanning source, following the Agent Contract (§2).
7. Killing and restarting the daemon recovers to a consistent state via
   mtime/hash reconciliation; an incompatible `version.json` is detected and
   triggers a guided rebuild.
8. `brain rebuild` produces a byte-for-byte equivalent, order-stable
   query-result set as a fresh `init` (idempotency proof, §8.7).
9. A second `StoragePort` adapter (in-memory) passes the same query/indexer
   unit tests, proving the swap seam.
10. The daemon never crashes the service on a single bad file (quarantine
    works), and `.brain/` is never edited by hand.

---

## 20. Rule Precedence

1. This `DESIGN_SYSTEM.md` (enforceable contract).
2. `PROJECT_BRAIN_PLAN.md` (intent; where it conflicts with this doc on a
   [HARD] rule, this doc wins).
3. Code. Code that violates a [HARD] rule is a bug, not a precedent.

Any change to a [HARD] rule requires updating this document first, then code.