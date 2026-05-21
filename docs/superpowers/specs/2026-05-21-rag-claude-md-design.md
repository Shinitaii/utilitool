# RAG over CLAUDE.md — Design Spec

**Date**: 2026-05-21  
**Status**: Approved

---

## Problem

Claude Code sessions on Utilitool start cold. When answering architecture questions or making refactoring decisions, Claude must re-read the CLAUDE.md files from scratch each time. A RAG system lets us retrieve only the relevant sections, reducing token usage and improving focus.

---

## Scope

Two deliverables:

1. **Python indexing script** (`index_claude_md.py`) — one-time or on-demand, run manually
2. **TypeScript query module** (`api/functions/src/utils/rag-query.ts`) — called programmatically before heavy prompts

---

## Files Indexed

- `CLAUDE.md` (repo root) — project overview, business rules, stack
- `api/functions/CLAUDE.md` — API architecture, endpoints, patterns
- `ui/CLAUDE.md` — frontend architecture, component map

---

## Architecture

```
index_claude_md.py
  ↓  reads all 3 CLAUDE.md files
  ↓  chunks by ## / ### headers (max ~800 chars per chunk; split by paragraph if over)
  ↓  embeds with sentence-transformers/all-MiniLM-L6-v2 (384-dim)
  ↓  writes to utilitool.db (SQLite)

rag-query.ts
  ↓  better-sqlite3 reads all chunks + embeddings from utilitool.db
  ↓  @huggingface/transformers embeds the query with Xenova/all-MiniLM-L6-v2 (ONNX)
  ↓  cosine similarity against every chunk
  ↓  returns top-k sorted descending
```

---

## Python Indexing Script

**File**: `index_claude_md.py` (repo root)

**Dependencies**: `sentence-transformers`, `python-dotenv` (optional)

**Algorithm**:
1. Walk `CLAUDE_MD_FILES = ["CLAUDE.md", "api/functions/CLAUDE.md", "ui/CLAUDE.md"]`
2. For each file, split on `\n## ` and `\n### ` to get sections
3. For each section, if `len(text) > 800`, split into paragraph chunks
4. Embed all chunks in one batch call: `SentenceTransformer("all-MiniLM-L6-v2").encode(texts)`
5. Write to `utilitool.db` (create/replace table on each run)
6. Print: `"Indexed X chunks from Y files → utilitool.db"`

**SQLite schema**:
```sql
CREATE TABLE chunks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  chunk_text  TEXT    NOT NULL,
  embedding   TEXT    NOT NULL,  -- JSON float array, 384 dims
  section_name TEXT   NOT NULL,
  source_file  TEXT   NOT NULL
);
```

---

## TypeScript Query Module

**File**: `api/functions/src/utils/rag-query.ts`

**Dependencies added to `api/functions/package.json`**:
- `better-sqlite3` + `@types/better-sqlite3` (dev)
- `@huggingface/transformers` (ESM, Node 24 compatible)

**Signature**:
```ts
export async function queryRAG(
  question: string,
  topK: number = 5
): Promise<{ text: string; section: string; source: string; similarity: number }[]>
```

**Algorithm**:
1. Load `utilitool.db` from repo root (path resolved using `fileURLToPath(import.meta.url)` — no `__dirname` in ESM NodeNext)
2. Use `@huggingface/transformers` pipeline `feature-extraction` with `Xenova/all-MiniLM-L6-v2` to embed `question` — model cached on first call
3. Fetch all rows from `chunks` table
4. For each row, parse `embedding` JSON, compute cosine similarity with query vector
5. Sort descending, return top `topK`

**Cosine similarity** (inline, no deps):
```ts
function cosineSim(a: number[], b: number[]): number {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return dot / (normA * normB);
}
```

**Error handling**:
- If `utilitool.db` doesn't exist → throw descriptive error: `"Run index_claude_md.py first"`
- If `@huggingface/transformers` model download fails → propagate error (caller responsibility)

---

## Integration Workflow (Task 3)

Not code to build — a usage pattern:

```ts
import { queryRAG } from './utils/rag-query';

const context = await queryRAG("How does billing validation work?", 5);
const contextText = context.map(c => `[${c.source} / ${c.section}]\n${c.text}`).join('\n\n---\n\n');

// Prepend to Claude prompt:
// System: You are a Utilitool engineer. Relevant context:\n\n${contextText}
// User: Should we refactor the billing calculation?
```

---

## .gitignore

Add `utilitool.db` to root `.gitignore`.

---

## Out of Scope

- No HTTP endpoint — purely a local dev utility
- No auto-reindex on file change — run the script manually after editing CLAUDE.md
- No UI in the SvelteKit app
- No integration into the live API server

---

## Compatibility Note

`@huggingface/transformers` v3 uses the ONNX-quantized `Xenova/all-MiniLM-L6-v2`. Embeddings are numerically close (within FP32 rounding) to Python's `sentence-transformers` output. Cosine similarity cross-language is reliable for retrieval purposes.
