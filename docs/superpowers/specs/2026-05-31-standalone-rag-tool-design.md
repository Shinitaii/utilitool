# Standalone RAG Tool — Design Spec

**Date:** 2026-05-31
**Status:** Approved (design), pending spec review
**Author:** Richmond Glenn Viloria (with Claude)

---

## Context & Motivation

The current RAG (`index_claude_md.py` + `rag.ts` + `src/utils/rag-query.ts`) was built to retrieve context from this project's `CLAUDE.md` files before planning. An audit surfaced its limits:

- **Docs-only.** It indexes only the four CLAUDE.md files, not source code, so it cannot answer code-level questions and it echoes documentation even when the docs have drifted from the code.
- **Single-stage retrieval.** Embed query → top-K cosine → return. No lexical signal (bad at exact identifiers/error strings), no reranking (coarse precision, more tokens than necessary).
- **Cross-language split.** Python indexer + TypeScript querier means two model runtimes to keep in sync.
- **No staleness control.** A full manual reindex is the only update path; embeddings lag docs, which lag code.
- **Misplaced.** A general-purpose tool lives tangled inside one application repo.

This spec defines a **standalone, reusable retrieval tool** that indexes both docs and code, retrieves with high precision and low token cost, and is designed to scale to many projects globally. The utility-calculator repo becomes its **first test corpus**, not its home.

## Goals

1. **Retrieval quality first.** Surface the *correct* context — including code — for a query, proven on a real codebase the author knows intimately.
2. **Token efficiency.** Return a small, precise set of chunks (retrieve wide, cut hard), not a broad dump.
3. **Code-aware.** Handle exact identifiers and error strings (lexical) *and* conceptual paraphrases (semantic).
4. **Multi-language by construction.** The author has TS, C#, C++, Java, PHP, Flutter, Spring Boot, CodeIgniter projects. Code parsing must not be TS-specific.
5. **Standalone & reusable.** Its own repo, installable, points at any project.
6. **Bounded staleness.** Reindex cost scales with what changed, not project size.

## Non-Goals (YAGNI)

- **Cross-project / multi-DB fan-out.** Designed-*for* (clean seams) but **not built** in the MVP. The MVP is strictly single-project.
- **Shared/curated "blessed snippets" DB.** Explicitly rejected even long-term; it is a separate snippet-library feature, not a scaling step.
- **Vector-index extension (e.g. `sqlite-vec`).** Brute-force cosine is adequate at single-project scale. Can be added later behind the same query interface.
- **`project_id` column.** Redundant under per-project DBs.

## Scope Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Consumer | Both manual CLI and Claude-invoked | Must be fast & scriptable *and* human-runnable |
| Home | **Its own repo** (`rag-tool/`) | It's a product, not part of the billing app |
| Language | **Consolidate to Python** | One runtime for index + query; CLI was TS, now unified |
| Project model | **Per-project DBs** | Clean isolation; one project's change doesn't rebuild others |
| Cross-project | **Deferred (#2)** behind clean seams | Prove single-project quality first; fan-out is a later, isolated add |
| Index content | **Docs + code**, tagged by `source_type` | Tag, don't filter; control the *mix* at query time |
| Retrieval | **Hybrid (semantic + lexical) → RRF → rerank → mix** | Lexical gets a vote not a veto; cross-encoder for precision |
| Code chunking | **Tree-sitter** (multi-language) | Only choice that survives 7 language ecosystems without a rewrite |
| DB location | **Centralized** `~/.rag/<project-id>/index.db` + `registry.json` | Indexed projects stay pristine; registry enables future fan-out |
| Tool install | On PATH via `pip install -e .` (`rag` command) | Invocation convenience, separate from data location |

### Build sequence (Approach 1 — quality-first vertical slice)

1. Scaffold standalone Python package; consolidate (retire the TS query duplication conceptually — old files in utility-calculator are left untouched as a working prototype).
2. Schema + SQLite FTS5.
3. Tree-sitter code chunker + doc chunker.
4. Hybrid query + RRF fusion + reranker, controlled doc/code mix.
5. Incremental reindex by file hash.

---

## Architecture

Standalone Python package, single runtime for indexing and querying.

```
rag-tool/
├── rag/
│   ├── __init__.py
│   ├── cli.py            # entry: `rag index <path>`, `rag query "..." [--no-rerank]`
│   ├── config.py         # paths, model names, chunk sizes, mix ratios, retrieval widths
│   ├── db.py             # SQLite schema, FTS5, connection mgmt
│   ├── embed.py          # embedding model wrapper (singleton load)
│   ├── rerank.py         # cross-encoder reranker wrapper (singleton load)
│   ├── registry.py       # project path -> db path mapping (~/.rag/registry.json)
│   ├── chunkers/
│   │   ├── docs.py       # markdown/heading chunker (port of current logic)
│   │   └── code.py       # tree-sitter symbol chunker (multi-language)
│   ├── index.py          # orchestrates: walk files -> chunk -> embed -> store
│   └── query.py          # hybrid retrieve -> fuse (RRF) -> rerank -> mix
├── tests/
├── pyproject.toml
└── README.md
```

### Module boundaries (each has one job, testable in isolation)

- **chunkers/**: `file content -> list[Chunk]`. No DB, no model.
- **embed**: `text -> float32 vector`. Singleton model load.
- **rerank**: `(query, [chunks]) -> [scored chunks]`. Singleton model load.
- **db**: pure storage + FTS sync + incremental bookkeeping. No model.
- **registry**: project-path ↔ db-path resolution. Pure file I/O.
- **index / query**: orchestrators that compose the above.

### Seams that make future fan-out (#2) free

1. **DB addressed by path.** `query.py` accepts a **list of DB paths** and merges results, even though the MVP always passes exactly one. Fan-out later = pass more than one.
2. **Registry already maps every project → its DB**, so "search projects A and B" is just multiple lookups + the existing merge.

---

## Data Model

One SQLite DB per project at `~/.rag/<project-id>/index.db`.

**`<project-id>` derivation** — `f"{dir_name}-{hash_suffix}"`, e.g. `new-utility-calculator-a1b2c3`:
- `dir_name` = the project folder's basename, for human readability when browsing `~/.rag/`.
- `hash_suffix` = first 6 hex chars of a **stable** hash of the normalized absolute path (`hashlib.sha1(norm_path.encode()).hexdigest()[:6]` — NOT Python's built-in `hash()`, which is per-process randomized). This guarantees uniqueness so two projects with the same folder name (e.g. `client-a/api` and `client-b/api`) never collide on the same DB.

**Path normalization (must happen before hashing).** Resolve to a canonical form so the same project accessed via different path spellings maps to one DB:
- `os.path.realpath()` to resolve symlinks and trailing-slash/relative differences.
- On Windows, case-fold the result (the filesystem is case-insensitive; `C:\Users` and `c:\users` are the same project).
- Cross-platform note: the *same* logical project on Windows vs Linux has genuinely different absolute paths (`C:\Users\rgvil\…` vs `/home/rgvil/…`) and correctly resolves to separate DBs per machine — `~/.rag` is not shared across OSes.

Absolute path is the single source of truth (git remote is not used, so non-git projects and multiple clones are handled uniformly). The `registry.json` stores the full mapping `normalized_absolute_path -> {project_id, db_path}`. Indexed projects are never written to.

```sql
-- Primary chunk store
CREATE TABLE chunks (
    id           INTEGER PRIMARY KEY,
    chunk_text   TEXT NOT NULL,       -- the actual content retrieved
    embedding    BLOB NOT NULL,       -- float32 vector, packed bytes (not JSON)
    source_type  TEXT NOT NULL,       -- 'doc' | 'code'
    file_path    TEXT NOT NULL,       -- relative to project root
    lang         TEXT,                -- 'python','typescript','markdown', ...
    symbol_name  TEXT,                -- function/class name (code); NULL for docs
    symbol_kind  TEXT,                -- 'function'|'class'|'method' (code); NULL for docs
    section_name TEXT,                -- heading (docs); NULL for code
    start_line   INTEGER,
    end_line     INTEGER,
    file_hash    TEXT NOT NULL        -- content hash of source file
);

-- Lexical index (external-content FTS5, kept in sync with chunks)
CREATE VIRTUAL TABLE chunks_fts USING fts5(
    chunk_text,
    symbol_name,
    content='chunks',
    content_rowid='id'
);

-- Drives incremental reindex
CREATE TABLE files (
    file_path  TEXT PRIMARY KEY,
    file_hash  TEXT NOT NULL,
    indexed_at TEXT NOT NULL
);
```

### Deliberate changes from the current schema

1. **Embeddings as packed `BLOB`** (float32 bytes), not `json.dumps`. Smaller, faster to load — matters once code multiplies chunk counts.
2. **`files` table → incremental reindex.** On reindex, hash each file; matching hash → skip entirely (no re-chunk, no re-embed). Reindex cost scales with what changed.
3. **Rich per-chunk metadata** powers doc/code mix control, `file:line` output, and future filtering — without schema changes.

### Embedding model note

The MVP uses the same family as today (`all-MiniLM-L6-v2`, 384-dim) for the bi-encoder and `ms-marco-MiniLM-L-6-v2` as the cross-encoder reranker. Both run locally. Model names live in `config.py`. Changing the embedder requires a reindex (enforced via dimension check — see Error Handling).

---

## Query Pipeline

```
query string
   ↓
[1] embed query ONCE
   ↓
[2a] semantic search                 [2b] lexical search (FTS5 BM25)
     cosine vs all embeddings              over chunk_text + symbol_name
     → top ~25                             → top ~25
   ↓                                        ↓
[3] RRF fusion → single merged ranked list
   ↓
[4] rerank — cross-encoder scores (query, chunk) pairs jointly  (skippable: --no-rerank)
   ↓
[5] mix + return — top N doc + top N code, each with file:line + metadata
```

1. **Embed once.** Query embedded a single time; both stages reuse it. (This is why multi-DB fan-out later is cheap: embedding is the costly part and happens once regardless of DB count.)
2. **Retrieve wide, two ways.**
   - *Semantic:* brute-force cosine over chunk embeddings, top ~25.
   - *Lexical:* FTS5 BM25 over `chunk_text` + `symbol_name`, top ~25. Catches exact identifiers (`validateMeterRollback`) and error strings.
3. **RRF fusion.** Combine by *rank position*, not raw score (cosine and BM25 are different scales): `score(chunk) = Σ 1/(k + rank_in_list)`. High in either list surfaces; high in both wins.
4. **Rerank.** Cross-encoder reads each `(query, chunk)` jointly over the fused top ~15–20 and emits a true relevance score. Source of most precision and token savings. **On by default; `--no-rerank` flag** for fast raw queries and for A/B debugging ("what is reranking buying me?").
5. **Mix + return.** Controlled blend from the reranked list (e.g. top 3 doc + top 3 code; ratios in `config.py`) so code volume can't drown docs. Each result carries `file_path:start_line`, `source_type`, `symbol_name`/`section_name`, score.

### Tunable knobs (config.py, not hardcoded)

- Retrieval width (the ~25 per stage).
- Final doc/code mix ratio and total N.
- Model names.
- RRF `k` constant.

### Cost profile (informs the --no-rerank decision)

- **Indexing** cost grows with corpus size (embeds every chunk) — but the incremental `files` table makes the full cost a one-time event; later reindexes touch only changed files.
- **Reranking** cost is ~constant: it scores only the ~15–20 fused candidates, independent of project size. Per-query cost is dominated by one-time model load (singleton-amortized within a process), then a few hundred ms for the candidate passes. Acceptable for both manual and Claude-invoked use.

---

## Error Handling & Edge Cases

**Principle:** library modules (`index`, `query`, chunkers, db) **raise typed exceptions**; only `cli.py` catches them and sets exit codes. No `process.exit`/`sys.exit` inside the library — it must be safely callable by Claude or any host.

| Case | Behavior |
|---|---|
| DB missing on query | raise `IndexNotFoundError("No index for <project>. Run: rag index <path>")`; CLI prints, exits non-zero |
| Tree-sitter grammar missing for a language | skip file, log warning, continue; record as skipped. One unknown language never aborts a run |
| File fails to parse (syntax error/partial) | fall back to a single whole-file chunk rather than dropping it |
| Empty/whitespace chunk | filtered before embedding |
| Embedding dimension mismatch (model changed) | detect on query; raise "reindex required" rather than returning garbage cosine |
| Binary / oversized file | skip via extension allowlist + max-file-size guard (config) |
| FTS5 unavailable in SQLite build | detect at startup; raise clear error rather than failing mid-query |

---

## Testing Approach (TDD — tests authored before implementation)

**Discipline:** red-green-refactor, enforced via the test-driven-development skill during implementation. Every test below is written as a falsifiable contract with concrete input → expected output *before* the corresponding code exists. The test suite is the executable specification of correctness.

### Non-negotiable, pure-logic tests (where subtle bugs hide)

**RRF fusion** (`query.py`, pure function):
- Given list A = `[c1, c2, c3]` and list B = `[c2, c4, c1]` with known `k`, assert exact fused order and that `c2` (high in both) ranks first. Deterministic, no I/O.
- Edge: a chunk present in only one list still appears; empty list on one side degrades to the other's order.

**Incremental reindex** (`index.py` + `db.py`):
- Index a 3-file fixture; record embed-call count = N chunks.
- Modify one file's content; reindex; assert embed is called **only** for that file's chunks (spy on `embed`), and the `files` row hash updated.
- Unchanged files: assert zero re-embeds.

### Chunker tests (no DB, no model)

**Docs chunker** (`chunkers/docs.py`):
- Given markdown with two `##` headings, assert two chunks with correct `section_name` and that an oversized section splits by paragraph (mirrors current 800-char logic).

**Code chunker** (`chunkers/code.py`, tree-sitter):
- Python fixture with two functions + one class → assert one chunk per symbol, correct `symbol_name`, `symbol_kind`, `start_line`/`end_line`.
- TypeScript fixture (functions, `export const x = () => {}`, a class with methods) → assert symbol extraction.
- Syntax-error fixture → assert single whole-file fallback chunk (not dropped).
- Unsupported-extension fixture → assert skipped (not indexed).

### DB layer tests (in-memory SQLite, no model)

- Insert chunk → assert retrievable; assert `chunks_fts` row stays in sync (insert and delete).
- FTS5 BM25 query for an exact `symbol_name` returns the right chunk.
- Dimension-mismatch guard raises on query when stored dim ≠ query dim.

### Model wrapper tests

- `embed` / `rerank` mocked in unit tests (as current `rag-query.test.ts` mocks the pipeline).
- One **slow-marked integration test**: load real models, run end-to-end on a tiny fixture corpus, assert a known query returns the expected top chunk.

### End-to-end acceptance test (proves the whole point)

- Index the utility-calculator repo (docs + code) into a temp DB.
- Query `"meter rollback"` → assert `validateMeterRollback` (code) is in the top results.
- Query a conceptual phrase with **no** exact keyword overlap (e.g. `"prevent meter reading going backwards"`) → assert the same function still surfaces (semantic path works).
- Query an exact error string → assert lexical path returns the exact chunk.
- This trio proves hybrid retrieval: concept-only, identifier-only, and error-string queries all land the right code.

---

## Open Questions / Future Work

- **#2 fan-out:** add multi-DB query + registry-driven project selection once single-project quality is proven.
- **Contextual retrieval:** prepend a generated one-line "what/where" summary to each chunk before embedding for a precision boost (post-MVP polish).
- **Larger embedding / code-specialized model:** revisit if MiniLM recall proves weak on code.
- **`sqlite-vec`:** adopt if a single project's corpus grows large enough that brute-force cosine latency matters.
