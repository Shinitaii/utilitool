# RAG over CLAUDE.md Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local RAG system that chunks and embeds all CLAUDE.md files via Python, then exposes a `queryRAG()` TypeScript function that returns semantically similar chunks for a given question.

**Architecture:** Python script (`index_claude_md.py`) reads all three CLAUDE.md files, chunks by headers, embeds with `sentence-transformers/all-MiniLM-L6-v2`, and stores text + JSON embeddings in `utilitool.db` (SQLite). The TypeScript module (`rag-query.ts`) reads stored embeddings via `better-sqlite3`, embeds the query with `@huggingface/transformers` (`Xenova/all-MiniLM-L6-v2` ONNX, same model), computes cosine similarity inline, and returns top-k results.

**Tech Stack:** Python 3 + sentence-transformers + sqlite3 (stdlib); Node 24 + TypeScript (NodeNext) + better-sqlite3 + @huggingface/transformers v3

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `index_claude_md.py` | Index all CLAUDE.md files into utilitool.db |
| Create | `requirements.txt` | Python deps for the indexer |
| Create | `api/functions/src/utils/rag-query.ts` | queryRAG() — read DB, embed query, cosine sim |
| Create | `api/functions/src/utils/rag-query.test.ts` | Unit tests for rag-query |
| Modify | `.gitignore` | Exclude utilitool.db |
| Modify | `api/functions/package.json` | Add better-sqlite3 + @huggingface/transformers |

---

## Task 1: Python environment setup

**Files:**
- Create: `requirements.txt` (repo root)

- [ ] **Step 1: Create requirements.txt**

```
sentence-transformers==3.4.1
```

- [ ] **Step 2: Install dependencies**

Run from repo root:
```bash
pip install -r requirements.txt
```

Expected: `Successfully installed sentence-transformers-3.4.1` (and its transitive deps). The `all-MiniLM-L6-v2` model downloads on first use, not here.

- [ ] **Step 3: Commit**

```bash
git add requirements.txt
git commit -m "chore: add Python requirements for CLAUDE.md RAG indexer"
```

---

## Task 2: Write the Python indexing script

**Files:**
- Create: `index_claude_md.py` (repo root)

- [ ] **Step 1: Write index_claude_md.py**

```python
import json
import os
import sqlite3

from sentence_transformers import SentenceTransformer

CLAUDE_MD_FILES = [
    "CLAUDE.md",
    "api/functions/CLAUDE.md",
    "ui/CLAUDE.md",
]

MAX_CHUNK_CHARS = 800


def chunk_file(text: str, source_file: str) -> list[tuple[str, str, str]]:
    """Split text into (chunk_text, section_name, source_file) tuples."""
    chunks: list[tuple[str, str, str]] = []
    current_section = "Preamble"
    current_lines: list[str] = []

    def flush(section: str, lines: list[str]) -> None:
        body = "\n".join(lines).strip()
        if not body:
            return
        if len(body) <= MAX_CHUNK_CHARS:
            chunks.append((body, section, source_file))
        else:
            paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
            for i, para in enumerate(paragraphs):
                label = f"{section} (part {i + 1})"
                chunks.append((para, label, source_file))

    for line in text.splitlines():
        if line.startswith("## ") or line.startswith("### "):
            flush(current_section, current_lines)
            current_section = line.lstrip("#").strip()
            current_lines = []
        else:
            current_lines.append(line)

    flush(current_section, current_lines)
    return chunks


def main() -> None:
    all_chunks: list[tuple[str, str, str]] = []

    for filepath in CLAUDE_MD_FILES:
        if not os.path.exists(filepath):
            print(f"  Skipping {filepath} (not found)")
            continue
        with open(filepath, encoding="utf-8") as f:
            text = f.read()
        file_chunks = chunk_file(text, filepath)
        all_chunks.extend(file_chunks)
        print(f"  {filepath}: {len(file_chunks)} chunks")

    if not all_chunks:
        print("No chunks found — aborting.")
        return

    print(f"\nEmbedding {len(all_chunks)} chunks...")
    model = SentenceTransformer("all-MiniLM-L6-v2")
    texts = [c[0] for c in all_chunks]
    embeddings = model.encode(texts, show_progress_bar=True, normalize_embeddings=True)

    conn = sqlite3.connect("utilitool.db")
    conn.execute("DROP TABLE IF EXISTS chunks")
    conn.execute(
        """
        CREATE TABLE chunks (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            chunk_text   TEXT NOT NULL,
            embedding    TEXT NOT NULL,
            section_name TEXT NOT NULL,
            source_file  TEXT NOT NULL
        )
        """
    )

    for (chunk_text, section_name, source_file), embedding in zip(all_chunks, embeddings):
        conn.execute(
            "INSERT INTO chunks (chunk_text, embedding, section_name, source_file) VALUES (?, ?, ?, ?)",
            (chunk_text, json.dumps(embedding.tolist()), section_name, source_file),
        )

    conn.commit()
    conn.close()

    files_indexed = len({c[2] for c in all_chunks})
    print(f"\nIndexed {len(all_chunks)} chunks from {files_indexed} files → utilitool.db")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the indexer and verify output**

Run from repo root:
```bash
python index_claude_md.py
```

Expected output (approximate):
```
  CLAUDE.md: 14 chunks
  api/functions/CLAUDE.md: 28 chunks
  ui/CLAUDE.md: 12 chunks

Embedding 54 chunks...
Batches: 100%|██████████| 2/2 [00:03<00:00]

Indexed 54 chunks from 3 files → utilitool.db
```

- [ ] **Step 3: Spot-check the DB**

```bash
python -c "
import sqlite3, json
conn = sqlite3.connect('utilitool.db')
rows = conn.execute('SELECT id, section_name, source_file, length(chunk_text), length(embedding) FROM chunks LIMIT 5').fetchall()
for r in rows: print(r)
print('Total:', conn.execute('SELECT COUNT(*) FROM chunks').fetchone()[0])
"
```

Expected: 5 rows printed, each with `length(embedding)` > 1000 (a 384-float JSON array is ~2300 chars), and a total > 0.

- [ ] **Step 4: Update .gitignore**

Open `.gitignore` and add this line after the `ui/build` entry:

```
# RAG index (generated, do not commit)
utilitool.db
```

- [ ] **Step 5: Commit**

```bash
git add index_claude_md.py .gitignore
git commit -m "feat: add CLAUDE.md RAG indexer (index_claude_md.py)"
```

---

## Task 3: Install TypeScript dependencies

**Files:**
- Modify: `api/functions/package.json`

- [ ] **Step 1: Install runtime and dev deps**

Run from `api/functions/`:
```bash
npm install better-sqlite3 @huggingface/transformers
npm install --save-dev @types/better-sqlite3
```

- [ ] **Step 2: Verify package.json updated**

Check that `api/functions/package.json` now lists:
- `"better-sqlite3"` in `dependencies`
- `"@huggingface/transformers"` in `dependencies`
- `"@types/better-sqlite3"` in `devDependencies`

- [ ] **Step 3: Commit**

```bash
git add api/functions/package.json api/functions/package-lock.json
git commit -m "chore: add better-sqlite3 and @huggingface/transformers for RAG query"
```

---

## Task 4: Write failing tests for rag-query.ts

**Files:**
- Create: `api/functions/src/utils/rag-query.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// Mock @huggingface/transformers so Jest (CommonJS transform) doesn't try to load the ESM package
jest.mock('@huggingface/transformers', () => ({
  pipeline: jest.fn(),
}));

import { describe, it, expect } from '@jest/globals';
import { queryRAG } from './rag-query';

describe('queryRAG', () => {
  it('throws with a helpful message when utilitool.db does not exist', async () => {
    await expect(
      queryRAG('How does billing work?', 5, '/nonexistent/path/utilitool.db')
    ).rejects.toThrow('Run: python index_claude_md.py');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails because rag-query.ts doesn't exist yet**

Run from `api/functions/`:
```bash
npm test -- --testPathPattern="rag-query" --no-coverage
```

Expected: error like `Cannot find module './rag-query'` — confirms the test is wired up and the module is missing.

---

## Task 5: Implement rag-query.ts

**Files:**
- Create: `api/functions/src/utils/rag-query.ts`

- [ ] **Step 1: Write rag-query.ts**

```typescript
import Database from 'better-sqlite3';
import { pipeline } from '@huggingface/transformers';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Repo root is 4 directories above src/utils/ (src/utils → src → api/functions → api → root)
const DEFAULT_DB_PATH = resolve(__dirname, '../../../../utilitool.db');

export interface RAGResult {
  text: string;
  section: string;
  source: string;
  similarity: number;
}

type ChunkRow = {
  chunk_text: string;
  embedding: string;
  section_name: string;
  source_file: string;
};

function cosineSim(a: number[], b: number[]): number {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return dot / (normA * normB);
}

// Singleton — model is cached after first load (~200ms on subsequent calls)
let extractor: Awaited<ReturnType<typeof pipeline>> | null = null;

async function embed(text: string): Promise<number[]> {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

export async function queryRAG(
  question: string,
  topK = 5,
  dbPath = DEFAULT_DB_PATH
): Promise<RAGResult[]> {
  let db: Database.Database;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch {
    throw new Error(
      `utilitool.db not found at ${dbPath}. Run: python index_claude_md.py`
    );
  }

  const rows = db
    .prepare('SELECT chunk_text, embedding, section_name, source_file FROM chunks')
    .all() as ChunkRow[];
  db.close();

  const queryVec = await embed(question);

  return rows
    .map((row) => ({
      text: row.chunk_text,
      section: row.section_name,
      source: row.source_file,
      similarity: cosineSim(queryVec, JSON.parse(row.embedding) as number[]),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}
```

- [ ] **Step 2: Run the test — it should now pass**

Run from `api/functions/`:
```bash
npm test -- --testPathPattern="rag-query" --no-coverage
```

Expected:
```
PASS src/utils/rag-query.test.ts
  queryRAG
    ✓ throws with a helpful message when utilitool.db does not exist
```

- [ ] **Step 3: Run the full test suite to confirm no regressions**

```bash
npm test -- --no-coverage
```

Expected: all previously passing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add api/functions/src/utils/rag-query.ts api/functions/src/utils/rag-query.test.ts
git commit -m "feat: add queryRAG utility — cosine similarity over indexed CLAUDE.md chunks"
```

---

## Task 6: Run a live integration query

This step runs `queryRAG` against the real DB to verify retrieval quality. It requires `utilitool.db` to exist (Task 2 must be done first).

- [ ] **Step 1: Create a throwaway test script**

Create `rag-test.mts` at repo root (`.mts` = ESM TypeScript, runs with ts-node):

```typescript
// rag-test.mts — delete after testing
import { queryRAG } from './api/functions/src/utils/rag-query.js';

const queries = [
  'How does billing validation work?',
  'What is the meter reset flow?',
  'How do readings auto-create billings?',
];

for (const q of queries) {
  console.log(`\n=== "${q}" ===`);
  const results = await queryRAG(q, 3);
  for (const r of results) {
    console.log(`  [${r.similarity.toFixed(3)}] ${r.source} / ${r.section}`);
    console.log(`    ${r.text.slice(0, 120).replace(/\n/g, ' ')}...`);
  }
}
```

- [ ] **Step 2: Run it**

From repo root:
```bash
npx ts-node --esm rag-test.mts
```

On first run, Transformers.js downloads `Xenova/all-MiniLM-L6-v2` (~23MB) to `~/.cache/huggingface/`. Subsequent runs use the cache.

Expected output (approximate — similarity scores will vary):
```
=== "How does billing validation work?" ===
  [0.821] api/functions/CLAUDE.md / Billing Cycles
    Validation flow: 1. Validate all billing IDs exist 2. For each billing, fetch its readings...
  [0.743] CLAUDE.md / The Happy Path
    1. Capture readings from meters 2. Create a billing cycle...
  [0.698] api/functions/CLAUDE.md / Billings
    Billings are normally auto-created by POST /readings. Manual creation is an escape hatch...

=== "What is the meter reset flow?" ===
  [0.876] api/functions/CLAUDE.md / Meter Groups
    Reset requires at least one existing reading; uses the latest non-deleted reading...
  ...
```

Scores above 0.60 on relevant chunks = retrieval is working correctly.

- [ ] **Step 3: Delete the test script**

```bash
rm rag-test.mts
```

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "chore: verify RAG retrieval quality manually (no test artifact committed)"
```

---

## Self-Review

### Spec coverage
- ✅ `index_claude_md.py` reads all 3 CLAUDE.md files → Task 2
- ✅ Chunks by headers, splits large sections by paragraph → Task 2
- ✅ Embeds with all-MiniLM-L6-v2 → Task 2
- ✅ SQLite schema (id, chunk_text, embedding, section_name, source_file) → Task 2
- ✅ `queryRAG(question, topK)` signature → Task 5
- ✅ Cosine similarity on stored embeddings → Task 5
- ✅ `@huggingface/transformers` for query embedding → Task 5
- ✅ `utilitool.db` added to `.gitignore` → Task 2 Step 4
- ✅ Unit test (error case) → Task 4
- ✅ Integration verification → Task 6

### Notes
- `normalize_embeddings=True` in Python ensures unit-normalized vectors; `normalize: true` in Transformers.js does the same — cosine similarity is compatible across both.
- `DEFAULT_DB_PATH` resolves 4 directories up from `src/utils/` to reach the repo root. If the TS file moves, update the `../../../../` count.
- The `extractor` singleton persists across calls within the same Node.js process. For one-off scripts, each run incurs ~200ms model load from disk cache.
