# Project Brain MVP

## Overview

Project Brain is a standalone tool that builds and maintains a structured knowledge base for any software project. Instead of forcing AI agents to repeatedly scan source files, Project Brain continuously indexes the codebase and exposes a shared, up-to-date understanding of the project.

Every project owns its own Brain.

```
Project A
└── .brain/

Project B
└── .brain/

Project C
└── .brain/
```

The Brain is independent from AI agents.

Its only responsibility is to understand the project and answer questions about it.

Agents never inspect the entire codebase directly. They communicate only with Project Brain.

---

# Goals

* Support any TypeScript/JavaScript project.
* Maintain an always up to date project knowledge base.
* Detect project changes automatically.
* Avoid duplicated code generation.
* Understand relationships between project elements.
* Expose a simple API (MCP) for any AI agent.
* Remain lightweight and fast.
* Be completely independent from any AI workflow.

---

# MVP Architecture

```
                Source Code
                     │
                     ▼
              File Watcher
                     │
                     ▼
               AST Parser
                     │
                     ▼
          Metadata Extractor
                     │
                     ▼
              SQLite Database
                     │
                     ▼
               Query Engine
                     │
                     ▼
                 MCP Server
                     │
      ┌──────────────┼──────────────┐
      ▼              ▼              ▼
   OpenCode         PI         Claude Code
```

---

# Project Structure

```
project/
│
├── src/
├── package.json
│
└── .brain/
    ├── brain.db
    ├── metadata.json
    ├── config.json
    └── cache/
```

The `.brain` directory is automatically created and managed by Project Brain.

It should never be edited manually.

---

# First Run

When executed inside a project:

```
brain init
```

Project Brain must:

1. Detect the project root.
2. Validate the supported project type.
3. Create the `.brain` directory.
4. Create `brain.db`.
5. Create configuration files.
6. Scan the entire project.
7. Parse every supported source file.
8. Build the initial knowledge database.
9. Start the watcher.
10. Start the MCP server.

After initialization the Brain becomes a background service for that project.

---

# Continuous Synchronization

Project Brain must continuously monitor the project.

Whenever:

* a file is created
* a file is modified
* a file is renamed
* a file is deleted

the Brain must:

* reparse only affected files
* update metadata
* update relationships
* update indexes
* remove invalid entries

The entire project must never be rescanned unless explicitly requested.

---

# Metadata to Store (MVP)

For every file:

* path
* exports
* imports
* last modified

For every class:

* name
* methods
* properties
* inheritance

For every function:

* name
* parameters
* return type
* exported
* file
* callers
* callees

For components:

* component name
* props
* imported components

For API routes:

* route
* method
* controller

---

# Supported Queries

The Brain must answer questions like:

* Where is this function defined?
* Where is this function used?
* What depends on this module?
* What files will be affected by this change?
* Is similar functionality already implemented?
* Which components use this hook?
* Which API uses this service?

---

# Design Principles

The The Brain must never:

* generate code
* modify source files
* make engineering decisions
* implement features

Its only responsibility is to provide accurate project knowledge.

---

# Architecture Rules

* Single responsibility per module.
* Incremental indexing only.
* Database is the single source of truth.
* All relationships must be explicit.
* Every update must be atomic.
* Failures must never corrupt the database.
* Rebuilding the Brain must always be possible.
* The system must remain stateless except for the `.brain` directory.

---

# Public API

The MVP should expose tools such as:

```
findSymbol()

findUsage()

findDependents()

impactAnalysis()

findDuplicate()

searchComponents()

searchRoutes()
```

The transport layer should be MCP so any AI client can consume it.

---

# Future Extensions

Not part of the MVP:

* Graph database (Neo4j)
* Vector search
* Semantic search
* Git history understanding
* Architecture decision records
* Documentation indexing
* Multi-language support
* Performance analysis
* Security analysis

---

# Success Criteria

The MVP is successful when:

* It supports any TypeScript project.
* It builds its knowledge automatically.
* It updates itself automatically.
* Multiple AI agents can query the same Brain.
* Agents stop scanning the entire codebase.
* Duplicate implementations are significantly reduced.
* The Brain becomes the single source of project knowledge.