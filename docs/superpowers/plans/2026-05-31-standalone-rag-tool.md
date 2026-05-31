# Standalone RAG Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, reusable Python RAG tool that indexes docs + code per-project and retrieves precise, token-efficient context via hybrid (semantic + lexical) search with reranking.

**Architecture:** A standalone Python package in its own repo (`../rag-tool/`). One SQLite DB per project under `~/.rag/<project-id>/`. Indexing walks a project, chunks docs by heading and code by tree-sitter symbol, embeds chunks, and stores them with an FTS5 mirror. Querying embeds once, runs semantic + lexical retrieval in parallel, fuses with Reciprocal Rank Fusion, reranks with a cross-encoder, and returns a controlled doc/code mix.

**Tech Stack:** Python 3.13, `sentence-transformers` (bi-encoder `all-MiniLM-L6-v2` + cross-encoder `ms-marco-MiniLM-L-6-v2`), `tree-sitter` + `tree-sitter-language-pack`, `sqlite3` (stdlib, with FTS5), `pytest`, `numpy`.

**Spec:** `new-utility-calculator/docs/superpowers/specs/2026-05-31-standalone-rag-tool-design.md`

**Note on `python`:** On the author's Windows machine the interpreter is `python` (not `python3`). All commands below use `python`/`pytest` directly assuming an activated venv.

---

## File Structure

All paths are relative to the new repo root `../rag-tool/` (sibling of `new-utility-calculator`).

| File | Responsibility |
|---|---|
| `pyproject.toml` | Package metadata, deps, `rag` CLI entry point, pytest config |
| `rag/__init__.py` | Package marker, version |
| `rag/config.py` | All tunables: model names, chunk size, retrieval widths, mix ratios, RRF k, file allowlist, max file size, `~/.rag` root |
| `rag/types.py` | Shared dataclasses: `Chunk`, `Result` |
| `rag/errors.py` | Typed exceptions: `IndexNotFoundError`, `DimensionMismatchError`, `Fts5UnavailableError` |
| `rag/paths.py` | Path normalization + `project_id` derivation (pure logic) |
| `rag/registry.py` | `~/.rag/registry.json` read/write; project path ↔ db path |
| `rag/db.py` | SQLite schema, FTS5 sync, chunk/file CRUD, embedding BLOB pack/unpack |
| `rag/chunkers/__init__.py` | Package marker |
| `rag/chunkers/docs.py` | Markdown heading chunker (port of current logic) |
| `rag/chunkers/code.py` | Tree-sitter symbol chunker (multi-language) |
| `rag/embed.py` | Bi-encoder wrapper, singleton load |
| `rag/rerank.py` | Cross-encoder wrapper, singleton load |
| `rag/fusion.py` | RRF fusion (pure function) |
| `rag/index.py` | Orchestrate: walk → chunk → embed → store; incremental by hash |
| `rag/query.py` | Orchestrate: embed once → semantic + lexical → fuse → rerank → mix |
| `rag/cli.py` | Argparse CLI; the only place that catches exceptions / sets exit codes |
| `tests/...` | One test module per source module |
| `tests/fixtures/...` | Sample doc/code files for chunker + e2e tests |

---

## Task 1: Scaffold the standalone repo

**Files:**
- Create: `../rag-tool/pyproject.toml`
- Create: `../rag-tool/rag/__init__.py`
- Create: `../rag-tool/.gitignore`
- Create: `../rag-tool/README.md`
- Test: `../rag-tool/tests/test_smoke.py`

- [ ] **Step 1: Create the repo directory and git init**

```bash
mkdir -p ../rag-tool/rag/chunkers ../rag-tool/tests/fixtures
cd ../rag-tool && git init && cd -
```

- [ ] **Step 2: Write `pyproject.toml`**

```toml
[project]
name = "rag-tool"
version = "0.1.0"
description = "Standalone multi-project RAG: docs + code, hybrid retrieval with reranking"
requires-python = ">=3.11"
dependencies = [
    "sentence-transformers>=3.0",
    "tree-sitter>=0.23",
    "tree-sitter-language-pack>=0.4",
    "numpy>=1.26",
]

[project.optional-dependencies]
dev = ["pytest>=8.0"]

[project.scripts]
rag = "rag.cli:main"

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.pytest.ini_options]
markers = ["slow: loads real ML models (deselect with '-m \"not slow\"')"]
testpaths = ["tests"]
```

- [ ] **Step 3: Write `.gitignore` and `rag/__init__.py`**

`.gitignore`:
```
__pycache__/
*.pyc
.venv/
*.egg-info/
.pytest_cache/
```

`rag/__init__.py`:
```python
__version__ = "0.1.0"
```

- [ ] **Step 4: Write the smoke test**

`tests/test_smoke.py`:
```python
import rag


def test_package_imports_and_has_version():
    assert rag.__version__ == "0.1.0"
```

- [ ] **Step 5: Create venv, install, run smoke test**

```bash
cd ../rag-tool
python -m venv .venv
# Windows: .venv\Scripts\activate   |   POSIX: source .venv/bin/activate
python -m pip install -e ".[dev]"
python -m pytest tests/test_smoke.py -v
```
Expected: PASS (1 passed)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold standalone rag-tool package"
```

---

## Task 2: Config and shared types

**Files:**
- Create: `../rag-tool/rag/config.py`
- Create: `../rag-tool/rag/types.py`
- Create: `../rag-tool/rag/errors.py`
- Test: `../rag-tool/tests/test_config.py`

- [ ] **Step 1: Write the failing test**

`tests/test_config.py`:
```python
from rag import config
from rag.types import Chunk, Result


def test_config_has_expected_defaults():
    assert config.EMBED_MODEL == "all-MiniLM-L6-v2"
    assert config.RERANK_MODEL == "cross-encoder/ms-marco-MiniLM-L-6-v2"
    assert config.EMBED_DIM == 384
    assert config.RETRIEVAL_WIDTH == 25
    assert config.RERANK_WIDTH == 20
    assert config.RRF_K == 60
    assert config.MIX_DOCS == 3 and config.MIX_CODE == 3
    assert config.MAX_FILE_BYTES > 0
    assert ".py" in config.CODE_EXTENSIONS
    assert ".md" in config.DOC_EXTENSIONS


def test_chunk_and_result_dataclasses_construct():
    c = Chunk(
        chunk_text="x", source_type="code", file_path="a.py", lang="python",
        symbol_name="f", symbol_kind="function", section_name=None,
        start_line=1, end_line=2, file_hash="h",
    )
    assert c.symbol_name == "f"
    r = Result(chunk=c, score=0.5)
    assert r.score == 0.5
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_config.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'rag.config'`

- [ ] **Step 3: Write `rag/errors.py`**

```python
class RagError(Exception):
    """Base for all rag-tool errors."""


class IndexNotFoundError(RagError):
    pass


class DimensionMismatchError(RagError):
    pass


class Fts5UnavailableError(RagError):
    pass
```

- [ ] **Step 4: Write `rag/types.py`**

```python
from dataclasses import dataclass
from typing import Optional


@dataclass
class Chunk:
    chunk_text: str
    source_type: str          # 'doc' | 'code'
    file_path: str            # relative to project root
    lang: Optional[str]
    symbol_name: Optional[str]
    symbol_kind: Optional[str]
    section_name: Optional[str]
    start_line: Optional[int]
    end_line: Optional[int]
    file_hash: str


@dataclass
class Result:
    chunk: Chunk
    score: float
```

- [ ] **Step 5: Write `rag/config.py`**

```python
import os
from pathlib import Path

# Storage root for all per-project DBs + registry
RAG_HOME = Path(os.environ.get("RAG_HOME", Path.home() / ".rag"))
REGISTRY_PATH = RAG_HOME / "registry.json"

# Models (run locally via sentence-transformers)
EMBED_MODEL = "all-MiniLM-L6-v2"
EMBED_DIM = 384
RERANK_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"

# Retrieval widths
RETRIEVAL_WIDTH = 25     # top-N from each of semantic + lexical
RERANK_WIDTH = 20        # fused candidates passed to the cross-encoder
RRF_K = 60               # RRF damping constant

# Final result mix
MIX_DOCS = 3
MIX_CODE = 3

# Chunking
MAX_DOC_CHUNK_CHARS = 800

# File selection
MAX_FILE_BYTES = 1_000_000
DOC_EXTENSIONS = {".md", ".markdown"}
CODE_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".java", ".cs",
    ".cpp", ".cc", ".h", ".hpp", ".php", ".dart",
}
# Map extension -> tree-sitter-language-pack language name
LANG_BY_EXT = {
    ".py": "python", ".ts": "typescript", ".tsx": "tsx",
    ".js": "javascript", ".jsx": "javascript", ".java": "java",
    ".cs": "csharp", ".cpp": "cpp", ".cc": "cpp", ".h": "cpp",
    ".hpp": "cpp", ".php": "php", ".dart": "dart",
}
```

- [ ] **Step 6: Run tests to verify pass**

Run: `python -m pytest tests/test_config.py -v`
Expected: PASS (2 passed)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add config, shared types, and typed errors"
```

---

## Task 3: Path normalization and project-id (pure logic)

**Files:**
- Create: `../rag-tool/rag/paths.py`
- Test: `../rag-tool/tests/test_paths.py`

- [ ] **Step 1: Write the failing test**

`tests/test_paths.py`:
```python
from rag.paths import normalize_path, project_id


def test_normalize_strips_trailing_separators_and_resolves(tmp_path):
    p = tmp_path / "proj"
    p.mkdir()
    a = normalize_path(str(p))
    b = normalize_path(str(p) + "/")
    assert a == b


def test_normalize_is_case_folded_on_windows(monkeypatch):
    import rag.paths as paths
    monkeypatch.setattr(paths.os, "name", "nt")
    # Pure-string normalization path (no realpath dependence for this assertion)
    assert paths._casefold_if_windows("C:\\Users\\X") == "c:\\users\\x"


def test_project_id_is_stable_and_prefixed(tmp_path):
    p = tmp_path / "new-utility-calculator"
    p.mkdir()
    pid1 = project_id(str(p))
    pid2 = project_id(str(p))
    assert pid1 == pid2                       # deterministic
    assert pid1.startswith("new-utility-calculator-")
    assert len(pid1.split("-")[-1]) == 6      # 6-hex suffix


def test_project_id_differs_for_same_name_different_paths(tmp_path):
    a = tmp_path / "client-a" / "api"
    b = tmp_path / "client-b" / "api"
    a.mkdir(parents=True)
    b.mkdir(parents=True)
    assert project_id(str(a)) != project_id(str(b))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_paths.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'rag.paths'`

- [ ] **Step 3: Write `rag/paths.py`**

```python
import hashlib
import os


def _casefold_if_windows(path: str) -> str:
    return path.lower() if os.name == "nt" else path


def normalize_path(path: str) -> str:
    """Canonical absolute path: resolves symlinks, strips trailing
    separators, and case-folds on Windows so spelling variants of the
    same project map to one identity."""
    resolved = os.path.realpath(path)
    resolved = resolved.rstrip("/\\") or resolved
    return _casefold_if_windows(resolved)


def project_id(path: str) -> str:
    """Stable, human-readable id: '<dirname>-<6 hex of sha1(norm path)>'."""
    norm = normalize_path(path)
    digest = hashlib.sha1(norm.encode("utf-8")).hexdigest()[:6]
    dir_name = os.path.basename(norm) or "root"
    return f"{dir_name}-{digest}"
```

- [ ] **Step 4: Run tests to verify pass**

Run: `python -m pytest tests/test_paths.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: path normalization and stable project-id derivation"
```

---

## Task 4: Registry

**Files:**
- Create: `../rag-tool/rag/registry.py`
- Test: `../rag-tool/tests/test_registry.py`

- [ ] **Step 1: Write the failing test**

`tests/test_registry.py`:
```python
from rag import registry


def test_register_and_resolve_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(registry.config, "RAG_HOME", tmp_path)
    monkeypatch.setattr(registry.config, "REGISTRY_PATH", tmp_path / "registry.json")

    proj = tmp_path / "proj"
    proj.mkdir()

    db_path = registry.register(str(proj))
    assert db_path.parent.exists()                 # ~/.rag/<id>/ created
    assert db_path.name == "index.db"

    # Resolving the same project returns the same db path
    assert registry.resolve(str(proj)) == db_path

    # Persisted to registry.json keyed by normalized path
    assert (tmp_path / "registry.json").exists()


def test_resolve_unregistered_returns_none(tmp_path, monkeypatch):
    monkeypatch.setattr(registry.config, "RAG_HOME", tmp_path)
    monkeypatch.setattr(registry.config, "REGISTRY_PATH", tmp_path / "registry.json")
    assert registry.resolve(str(tmp_path / "nope")) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_registry.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'rag.registry'`

- [ ] **Step 3: Write `rag/registry.py`**

```python
import json
from pathlib import Path
from typing import Optional

from rag import config
from rag.paths import normalize_path, project_id


def _load() -> dict:
    if not config.REGISTRY_PATH.exists():
        return {}
    return json.loads(config.REGISTRY_PATH.read_text(encoding="utf-8"))


def _save(data: dict) -> None:
    config.RAG_HOME.mkdir(parents=True, exist_ok=True)
    config.REGISTRY_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def register(project_path: str) -> Path:
    """Register a project and return its DB path, creating its dir."""
    norm = normalize_path(project_path)
    pid = project_id(project_path)
    db_path = config.RAG_HOME / pid / "index.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)

    data = _load()
    data[norm] = {"project_id": pid, "db_path": str(db_path)}
    _save(data)
    return db_path


def resolve(project_path: str) -> Optional[Path]:
    """Return the DB path for a registered project, or None."""
    norm = normalize_path(project_path)
    entry = _load().get(norm)
    return Path(entry["db_path"]) if entry else None
```

- [ ] **Step 4: Run tests to verify pass**

Run: `python -m pytest tests/test_registry.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: project registry (path <-> db path mapping)"
```

---

## Task 5: Database layer (schema, FTS5 sync, embedding BLOBs)

**Files:**
- Create: `../rag-tool/rag/db.py`
- Test: `../rag-tool/tests/test_db.py`

- [ ] **Step 1: Write the failing test**

`tests/test_db.py`:
```python
import numpy as np
import pytest

from rag.db import Database
from rag.types import Chunk
from rag.errors import DimensionMismatchError


def _chunk(text, sym=None, stype="code", fhash="h1", path="a.py"):
    return Chunk(
        chunk_text=text, source_type=stype, file_path=path, lang="python",
        symbol_name=sym, symbol_kind="function" if sym else None,
        section_name=None, start_line=1, end_line=2, file_hash=fhash,
    )


def test_pack_unpack_roundtrip():
    db = Database(":memory:")
    vec = [0.1, 0.2, 0.3]
    blob = db.pack(vec)
    out = db.unpack(blob)
    assert np.allclose(out, vec)


def test_insert_and_fetch_all_chunks():
    db = Database(":memory:")
    db.init_schema()
    db.insert_chunk(_chunk("hello world", sym="foo"), [0.0] * 3)
    rows = db.all_chunks()
    assert len(rows) == 1
    assert rows[0].symbol_name == "foo"


def test_fts_finds_exact_symbol():
    db = Database(":memory:")
    db.init_schema()
    db.insert_chunk(_chunk("body", sym="validateMeterRollback"), [0.0] * 3)
    db.insert_chunk(_chunk("unrelated", sym="other"), [0.0] * 3)
    hits = db.lexical_search("validateMeterRollback", limit=5)
    assert hits and hits[0].symbol_name == "validateMeterRollback"


def test_fts_stays_in_sync_on_delete_by_file():
    db = Database(":memory:")
    db.init_schema()
    db.insert_chunk(_chunk("body", sym="foo", path="a.py"), [0.0] * 3)
    db.delete_file_chunks("a.py")
    assert db.lexical_search("foo", limit=5) == []
    assert db.all_chunks() == []


def test_files_table_tracks_hash():
    db = Database(":memory:")
    db.init_schema()
    db.upsert_file("a.py", "hash123")
    assert db.file_hash("a.py") == "hash123"
    assert db.file_hash("missing.py") is None


def test_dimension_mismatch_raises():
    db = Database(":memory:")
    db.init_schema()
    db.insert_chunk(_chunk("body", sym="foo"), [0.0] * 3)
    with pytest.raises(DimensionMismatchError):
        db.semantic_search([0.0] * 5, limit=3)   # stored dim 3, query dim 5
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_db.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'rag.db'`

- [ ] **Step 3: Write `rag/db.py`**

```python
import sqlite3
import struct
from pathlib import Path
from typing import Optional, Union

import numpy as np

from rag.types import Chunk
from rag.errors import DimensionMismatchError, Fts5UnavailableError

_COLS = (
    "chunk_text, source_type, file_path, lang, symbol_name, "
    "symbol_kind, section_name, start_line, end_line, file_hash"
)


def _row_to_chunk(row: sqlite3.Row) -> Chunk:
    return Chunk(
        chunk_text=row["chunk_text"], source_type=row["source_type"],
        file_path=row["file_path"], lang=row["lang"],
        symbol_name=row["symbol_name"], symbol_kind=row["symbol_kind"],
        section_name=row["section_name"], start_line=row["start_line"],
        end_line=row["end_line"], file_hash=row["file_hash"],
    )


class Database:
    def __init__(self, path: Union[str, Path]):
        self.conn = sqlite3.connect(str(path))
        self.conn.row_factory = sqlite3.Row
        self._check_fts5()

    def _check_fts5(self) -> None:
        try:
            self.conn.execute("CREATE VIRTUAL TABLE _fts_probe USING fts5(x)")
            self.conn.execute("DROP TABLE _fts_probe")
        except sqlite3.OperationalError as e:
            raise Fts5UnavailableError(
                "SQLite build lacks FTS5 support"
            ) from e

    # --- embedding pack/unpack (float32 BLOB) ---
    def pack(self, vec) -> bytes:
        arr = np.asarray(vec, dtype=np.float32)
        return struct.pack(f"{arr.size}f", *arr.tolist())

    def unpack(self, blob: bytes) -> np.ndarray:
        n = len(blob) // 4
        return np.array(struct.unpack(f"{n}f", blob), dtype=np.float32)

    def init_schema(self) -> None:
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS chunks (
                id INTEGER PRIMARY KEY,
                chunk_text TEXT NOT NULL,
                embedding BLOB NOT NULL,
                source_type TEXT NOT NULL,
                file_path TEXT NOT NULL,
                lang TEXT,
                symbol_name TEXT,
                symbol_kind TEXT,
                section_name TEXT,
                start_line INTEGER,
                end_line INTEGER,
                file_hash TEXT NOT NULL
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
                chunk_text, symbol_name,
                content='chunks', content_rowid='id'
            );
            CREATE TABLE IF NOT EXISTS files (
                file_path TEXT PRIMARY KEY,
                file_hash TEXT NOT NULL,
                indexed_at TEXT NOT NULL
            );
            """
        )
        self.conn.commit()

    def insert_chunk(self, chunk: Chunk, embedding) -> int:
        cur = self.conn.execute(
            f"INSERT INTO chunks (embedding, {_COLS}) VALUES (?, ?,?,?,?,?,?,?,?,?,?)",
            (
                self.pack(embedding), chunk.chunk_text, chunk.source_type,
                chunk.file_path, chunk.lang, chunk.symbol_name, chunk.symbol_kind,
                chunk.section_name, chunk.start_line, chunk.end_line, chunk.file_hash,
            ),
        )
        rowid = cur.lastrowid
        self.conn.execute(
            "INSERT INTO chunks_fts (rowid, chunk_text, symbol_name) VALUES (?, ?, ?)",
            (rowid, chunk.chunk_text, chunk.symbol_name or ""),
        )
        self.conn.commit()
        return rowid

    def delete_file_chunks(self, file_path: str) -> None:
        rows = self.conn.execute(
            "SELECT id FROM chunks WHERE file_path = ?", (file_path,)
        ).fetchall()
        for r in rows:
            self.conn.execute(
                "INSERT INTO chunks_fts (chunks_fts, rowid, chunk_text, symbol_name) "
                "VALUES ('delete', ?, "
                "(SELECT chunk_text FROM chunks WHERE id=?), "
                "(SELECT COALESCE(symbol_name,'') FROM chunks WHERE id=?))",
                (r["id"], r["id"], r["id"]),
            )
        self.conn.execute("DELETE FROM chunks WHERE file_path = ?", (file_path,))
        self.conn.commit()

    def all_chunks(self) -> list[Chunk]:
        rows = self.conn.execute(f"SELECT {_COLS} FROM chunks").fetchall()
        return [_row_to_chunk(r) for r in rows]

    def _all_with_embeddings(self):
        return self.conn.execute(
            f"SELECT embedding, {_COLS} FROM chunks"
        ).fetchall()

    def semantic_search(self, query_vec, limit: int) -> list[Chunk]:
        q = np.asarray(query_vec, dtype=np.float32)
        scored = []
        for row in self._all_with_embeddings():
            vec = self.unpack(row["embedding"])
            if vec.shape[0] != q.shape[0]:
                raise DimensionMismatchError(
                    f"stored dim {vec.shape[0]} != query dim {q.shape[0]}; reindex required"
                )
            denom = (np.linalg.norm(vec) * np.linalg.norm(q))
            sim = float(np.dot(vec, q) / denom) if denom else 0.0
            scored.append((sim, _row_to_chunk(row)))
        scored.sort(key=lambda t: t[0], reverse=True)
        return [c for _, c in scored[:limit]]

    def lexical_search(self, query: str, limit: int) -> list[Chunk]:
        rows = self.conn.execute(
            f"SELECT c.embedding, c.rowid, {', '.join('c.'+col for col in _COLS.split(', '))} "
            "FROM chunks_fts f JOIN chunks c ON c.id = f.rowid "
            "WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts) LIMIT ?",
            (query, limit),
        ).fetchall()
        return [_row_to_chunk(r) for r in rows]

    def upsert_file(self, file_path: str, file_hash: str) -> None:
        self.conn.execute(
            "INSERT INTO files (file_path, file_hash, indexed_at) "
            "VALUES (?, ?, datetime('now')) "
            "ON CONFLICT(file_path) DO UPDATE SET "
            "file_hash=excluded.file_hash, indexed_at=excluded.indexed_at",
            (file_path, file_hash),
        )
        self.conn.commit()

    def file_hash(self, file_path: str) -> Optional[str]:
        row = self.conn.execute(
            "SELECT file_hash FROM files WHERE file_path = ?", (file_path,)
        ).fetchone()
        return row["file_hash"] if row else None

    def close(self) -> None:
        self.conn.close()
```

- [ ] **Step 4: Run tests to verify pass**

Run: `python -m pytest tests/test_db.py -v`
Expected: PASS (6 passed). If `test_fts_finds_exact_symbol` returns wrong order, confirm `bm25()` ordering ascending (lower = better) — the query orders by `bm25(chunks_fts)` ascending, which is correct.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: sqlite db layer with FTS5 sync and float32 embedding blobs"
```

---

## Task 6: Docs chunker

**Files:**
- Create: `../rag-tool/rag/chunkers/__init__.py` (empty)
- Create: `../rag-tool/rag/chunkers/docs.py`
- Test: `../rag-tool/tests/test_chunk_docs.py`

- [ ] **Step 1: Write the failing test**

`tests/test_chunk_docs.py`:
```python
from rag.chunkers.docs import chunk_markdown


def test_splits_by_headings_with_section_names():
    md = "# Title\n\nintro\n\n## Alpha\n\nalpha body\n\n## Beta\n\nbeta body\n"
    chunks = chunk_markdown(md, file_path="doc.md", file_hash="h")
    sections = [c.section_name for c in chunks]
    assert "Alpha" in sections and "Beta" in sections
    assert all(c.source_type == "doc" for c in chunks)
    assert all(c.lang == "markdown" for c in chunks)


def test_oversized_section_splits_by_paragraph():
    big = "\n\n".join(["paragraph %d %s" % (i, "x" * 200) for i in range(5)])
    md = f"## Big\n\n{big}\n"
    chunks = chunk_markdown(md, file_path="doc.md", file_hash="h")
    big_chunks = [c for c in chunks if c.section_name and c.section_name.startswith("Big")]
    assert len(big_chunks) >= 2  # split into multiple parts


def test_empty_sections_dropped():
    md = "## Empty\n\n\n## Real\n\ncontent\n"
    chunks = chunk_markdown(md, file_path="doc.md", file_hash="h")
    assert [c.section_name for c in chunks] == ["Real"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_chunk_docs.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'rag.chunkers.docs'`

- [ ] **Step 3: Create empty `rag/chunkers/__init__.py`, then write `rag/chunkers/docs.py`**

```python
from rag import config
from rag.types import Chunk


def chunk_markdown(text: str, file_path: str, file_hash: str) -> list[Chunk]:
    chunks: list[Chunk] = []
    current_section = "Preamble"
    current_lines: list[str] = []

    def flush(section: str, lines: list[str]) -> None:
        body = "\n".join(lines).strip()
        if not body:
            return
        if len(body) <= config.MAX_DOC_CHUNK_CHARS:
            chunks.append(_mk(body, section, file_path, file_hash))
        else:
            paras = [p.strip() for p in body.split("\n\n") if p.strip()]
            for i, para in enumerate(paras):
                chunks.append(_mk(para, f"{section} (part {i + 1})", file_path, file_hash))

    for line in text.splitlines():
        if line.startswith("## ") or line.startswith("### "):
            flush(current_section, current_lines)
            current_section = line.lstrip("#").strip()
            current_lines = []
        else:
            current_lines.append(line)
    flush(current_section, current_lines)
    return chunks


def _mk(body: str, section: str, file_path: str, file_hash: str) -> Chunk:
    return Chunk(
        chunk_text=body, source_type="doc", file_path=file_path, lang="markdown",
        symbol_name=None, symbol_kind=None, section_name=section,
        start_line=None, end_line=None, file_hash=file_hash,
    )
```

- [ ] **Step 4: Run tests to verify pass**

Run: `python -m pytest tests/test_chunk_docs.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: markdown heading chunker"
```

---

## Task 7: Code chunker (tree-sitter)

**Files:**
- Create: `../rag-tool/rag/chunkers/code.py`
- Create: `../rag-tool/tests/fixtures/sample.py`
- Create: `../rag-tool/tests/fixtures/sample.ts`
- Create: `../rag-tool/tests/fixtures/broken.py`
- Test: `../rag-tool/tests/test_chunk_code.py`

- [ ] **Step 1: Create fixtures**

`tests/fixtures/sample.py`:
```python
def alpha(x):
    return x + 1


def beta(y):
    return y * 2


class Gamma:
    def method_one(self):
        return 1
```

`tests/fixtures/sample.ts`:
```typescript
export function alpha(x: number): number {
  return x + 1;
}

export const beta = (y: number): number => {
  return y * 2;
};

class Gamma {
  methodOne(): number {
    return 1;
  }
}
```

`tests/fixtures/broken.py`:
```python
def alpha(x):
    return x +
class   # syntactically broken on purpose
```

- [ ] **Step 2: Write the failing test**

`tests/test_chunk_code.py`:
```python
from pathlib import Path
from rag.chunkers.code import chunk_code

FIX = Path(__file__).parent / "fixtures"


def test_python_symbols_extracted():
    src = (FIX / "sample.py").read_text()
    chunks = chunk_code(src, file_path="sample.py", lang="python", file_hash="h")
    names = {c.symbol_name for c in chunks}
    assert {"alpha", "beta", "Gamma"} <= names
    assert all(c.source_type == "code" for c in chunks)
    a = next(c for c in chunks if c.symbol_name == "alpha")
    assert a.start_line == 1 and a.end_line >= 2


def test_typescript_symbols_extracted():
    src = (FIX / "sample.ts").read_text()
    chunks = chunk_code(src, file_path="sample.ts", lang="typescript", file_hash="h")
    names = {c.symbol_name for c in chunks}
    assert "alpha" in names           # function decl
    assert "Gamma" in names           # class


def test_broken_file_falls_back_to_whole_file_chunk():
    src = (FIX / "broken.py").read_text()
    chunks = chunk_code(src, file_path="broken.py", lang="python", file_hash="h")
    assert len(chunks) == 1
    assert chunks[0].symbol_name is None        # whole-file fallback
    assert chunks[0].chunk_text.strip() == src.strip()


def test_unknown_language_returns_empty():
    chunks = chunk_code("whatever", file_path="x.unknown", lang=None, file_hash="h")
    assert chunks == []
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python -m pytest tests/test_chunk_code.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'rag.chunkers.code'`

- [ ] **Step 4: Write `rag/chunkers/code.py`**

```python
import logging
from typing import Optional

from tree_sitter_language_pack import get_parser

from rag.types import Chunk

logger = logging.getLogger(__name__)

# tree-sitter node types that represent a retrievable symbol, per language family.
_SYMBOL_NODE_TYPES = {
    "function_definition",        # python, cpp
    "function_declaration",       # js/ts, go-like
    "method_definition",          # js/ts
    "class_definition",           # python
    "class_declaration",          # js/ts, java, c#
    "method_declaration",         # java, c#
    "arrow_function",             # js/ts (via const x = () => {})
    "lexical_declaration",        # js/ts: catches `export const x = () =>`
}

_KIND_BY_NODE = {
    "function_definition": "function",
    "function_declaration": "function",
    "method_definition": "method",
    "method_declaration": "method",
    "class_definition": "class",
    "class_declaration": "class",
    "arrow_function": "function",
    "lexical_declaration": "function",
}


def _name_of(node, src_bytes: bytes) -> Optional[str]:
    name_node = node.child_by_field_name("name")
    if name_node is not None:
        return src_bytes[name_node.start_byte:name_node.end_byte].decode("utf-8", "replace")
    # lexical_declaration: descend to the identifier of the declarator
    for child in node.children:
        if child.type in ("variable_declarator", "init_declarator"):
            ident = child.child_by_field_name("name")
            if ident is not None:
                return src_bytes[ident.start_byte:ident.end_byte].decode("utf-8", "replace")
    return None


def chunk_code(text: str, file_path: str, lang: Optional[str], file_hash: str) -> list[Chunk]:
    if lang is None:
        return []
    try:
        parser = get_parser(lang)
    except Exception:
        logger.warning("No tree-sitter grammar for lang=%s (file=%s); skipping", lang, file_path)
        return []

    src_bytes = text.encode("utf-8")
    tree = parser.parse(src_bytes)

    if tree.root_node.has_error:
        # Degraded retrieval beats dropping the file entirely.
        return [_whole_file(text, file_path, lang, file_hash)]

    chunks: list[Chunk] = []
    _walk(tree.root_node, src_bytes, file_path, lang, file_hash, chunks)
    if not chunks:
        return [_whole_file(text, file_path, lang, file_hash)]
    return chunks


def _walk(node, src_bytes, file_path, lang, file_hash, out: list) -> None:
    if node.type in _SYMBOL_NODE_TYPES:
        name = _name_of(node, src_bytes)
        if name:
            body = src_bytes[node.start_byte:node.end_byte].decode("utf-8", "replace")
            out.append(Chunk(
                chunk_text=body, source_type="code", file_path=file_path, lang=lang,
                symbol_name=name, symbol_kind=_KIND_BY_NODE.get(node.type, "symbol"),
                section_name=None,
                start_line=node.start_point[0] + 1, end_line=node.end_point[0] + 1,
                file_hash=file_hash,
            ))
            return  # don't double-emit nested nodes of an already-captured symbol
    for child in node.children:
        _walk(child, src_bytes, file_path, lang, file_hash, out)


def _whole_file(text: str, file_path: str, lang: str, file_hash: str) -> Chunk:
    lines = text.count("\n") + 1
    return Chunk(
        chunk_text=text, source_type="code", file_path=file_path, lang=lang,
        symbol_name=None, symbol_kind=None, section_name=None,
        start_line=1, end_line=lines, file_hash=file_hash,
    )
```

- [ ] **Step 5: Run tests to verify pass**

Run: `python -m pytest tests/test_chunk_code.py -v`
Expected: PASS (4 passed). If TS `methodOne` causes nested double-emit, the early `return` in `_walk` after capturing a class prevents descending into methods — adjust expectation: methods inside a captured class are part of the class chunk. The test only asserts `alpha` and `Gamma` are present, so this passes.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: tree-sitter multi-language code chunker with whole-file fallback"
```

---

## Task 8: Embedding wrapper

**Files:**
- Create: `../rag-tool/rag/embed.py`
- Test: `../rag-tool/tests/test_embed.py`

- [ ] **Step 1: Write the failing test (mocked model)**

`tests/test_embed.py`:
```python
import numpy as np
import rag.embed as embed_mod
from rag.embed import embed_texts, embed_one


class _FakeModel:
    def encode(self, texts, normalize_embeddings=True, show_progress_bar=False):
        # deterministic: vector length 3 per text
        return np.array([[float(len(t)), 1.0, 0.0] for t in texts], dtype=np.float32)


def test_embed_texts_uses_singleton(monkeypatch):
    fake = _FakeModel()
    monkeypatch.setattr(embed_mod, "_model", fake)
    out = embed_texts(["ab", "abc"])
    assert len(out) == 2
    assert list(out[0]) == [2.0, 1.0, 0.0]


def test_embed_one(monkeypatch):
    monkeypatch.setattr(embed_mod, "_model", _FakeModel())
    v = embed_one("hello")
    assert v[0] == 5.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_embed.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'rag.embed'`

- [ ] **Step 3: Write `rag/embed.py`**

```python
from typing import Optional

from rag import config

_model: Optional[object] = None


def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(config.EMBED_MODEL)
    return _model


def embed_texts(texts: list[str]) -> list[list[float]]:
    model = _get_model()
    arr = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return [list(map(float, row)) for row in arr]


def embed_one(text: str) -> list[float]:
    return embed_texts([text])[0]
```

- [ ] **Step 4: Run tests to verify pass**

Run: `python -m pytest tests/test_embed.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: bi-encoder embedding wrapper (singleton)"
```

---

## Task 9: Reranker wrapper

**Files:**
- Create: `../rag-tool/rag/rerank.py`
- Test: `../rag-tool/tests/test_rerank.py`

- [ ] **Step 1: Write the failing test (mocked cross-encoder)**

`tests/test_rerank.py`:
```python
import rag.rerank as rerank_mod
from rag.rerank import rerank
from rag.types import Chunk


def _c(text):
    return Chunk(text, "code", "a.py", "python", "f", "function", None, 1, 2, "h")


class _FakeCE:
    def predict(self, pairs):
        # score = length of the chunk text (second element)
        return [float(len(chunk)) for _q, chunk in pairs]


def test_rerank_orders_by_cross_encoder_score(monkeypatch):
    monkeypatch.setattr(rerank_mod, "_model", _FakeCE())
    chunks = [_c("short"), _c("a much longer chunk body")]
    out = rerank("query", chunks, top_k=2)
    assert out[0].chunk.chunk_text == "a much longer chunk body"   # highest score first
    assert out[0].score >= out[1].score


def test_rerank_respects_top_k(monkeypatch):
    monkeypatch.setattr(rerank_mod, "_model", _FakeCE())
    chunks = [_c("a"), _c("bb"), _c("ccc")]
    out = rerank("q", chunks, top_k=2)
    assert len(out) == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_rerank.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'rag.rerank'`

- [ ] **Step 3: Write `rag/rerank.py`**

```python
from typing import Optional

from rag import config
from rag.types import Chunk, Result

_model: Optional[object] = None


def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import CrossEncoder
        _model = CrossEncoder(config.RERANK_MODEL)
    return _model


def rerank(query: str, chunks: list[Chunk], top_k: int) -> list[Result]:
    if not chunks:
        return []
    model = _get_model()
    pairs = [(query, c.chunk_text) for c in chunks]
    scores = model.predict(pairs)
    results = [Result(chunk=c, score=float(s)) for c, s in zip(chunks, scores)]
    results.sort(key=lambda r: r.score, reverse=True)
    return results[:top_k]
```

- [ ] **Step 4: Run tests to verify pass**

Run: `python -m pytest tests/test_rerank.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: cross-encoder reranker wrapper (singleton)"
```

---

## Task 10: RRF fusion (pure logic — non-negotiable)

**Files:**
- Create: `../rag-tool/rag/fusion.py`
- Test: `../rag-tool/tests/test_fusion.py`

- [ ] **Step 1: Write the failing test**

`tests/test_fusion.py`:
```python
from rag.fusion import rrf_fuse
from rag.types import Chunk


def _c(name):
    return Chunk(name, "code", f"{name}.py", "python", name, "function", None, 1, 2, "h")


def test_chunk_high_in_both_lists_ranks_first():
    c1, c2, c3, c4 = _c("c1"), _c("c2"), _c("c3"), _c("c4")
    list_a = [c1, c2, c3]      # semantic
    list_b = [c2, c4, c1]      # lexical
    fused = rrf_fuse([list_a, list_b], k=60, key=lambda c: c.symbol_name)
    assert fused[0].symbol_name == "c2"   # rank 2 + rank 1 -> best combined


def test_chunk_in_one_list_still_appears():
    c1, c2, c4 = _c("c1"), _c("c2"), _c("c4")
    fused = rrf_fuse([[c1, c2], [c4]], k=60, key=lambda c: c.symbol_name)
    names = {c.symbol_name for c in fused}
    assert names == {"c1", "c2", "c4"}


def test_empty_list_degrades_to_other():
    c1, c2 = _c("c1"), _c("c2")
    fused = rrf_fuse([[c1, c2], []], k=60, key=lambda c: c.symbol_name)
    assert [c.symbol_name for c in fused] == ["c1", "c2"]


def test_dedupes_by_key():
    c1a, c1b = _c("c1"), _c("c1")
    fused = rrf_fuse([[c1a], [c1b]], k=60, key=lambda c: c.symbol_name)
    assert len(fused) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_fusion.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'rag.fusion'`

- [ ] **Step 3: Write `rag/fusion.py`**

```python
from typing import Callable, TypeVar

T = TypeVar("T")


def rrf_fuse(ranked_lists: list[list[T]], k: int, key: Callable[[T], str]) -> list[T]:
    """Reciprocal Rank Fusion. score(item) = sum 1/(k + rank), rank 0-based.
    Items are deduped by `key`; first-seen object is kept as the representative.
    Returns items sorted by descending fused score."""
    scores: dict[str, float] = {}
    representative: dict[str, T] = {}
    for lst in ranked_lists:
        for rank, item in enumerate(lst):
            kk = key(item)
            scores[kk] = scores.get(kk, 0.0) + 1.0 / (k + rank)
            representative.setdefault(kk, item)
    ordered = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    return [representative[kk] for kk, _ in ordered]
```

- [ ] **Step 4: Run tests to verify pass**

Run: `python -m pytest tests/test_fusion.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: reciprocal rank fusion (pure, deterministic)"
```

---

## Task 11: Index orchestrator + incremental reindex

**Files:**
- Create: `../rag-tool/rag/index.py`
- Test: `../rag-tool/tests/test_index.py`

- [ ] **Step 1: Write the failing test**

`tests/test_index.py`:
```python
import hashlib
from pathlib import Path

import rag.index as index_mod
from rag.db import Database


def _fake_embed(texts):
    return [[float(len(t)), 1.0, 0.0] for t in texts]


def _setup_project(tmp_path):
    (tmp_path / "a.py").write_text("def alpha(x):\n    return x\n")
    (tmp_path / "b.py").write_text("def beta(y):\n    return y\n")
    (tmp_path / "doc.md").write_text("## Title\n\nbody\n")
    return tmp_path


def test_full_index_embeds_all_and_stores(tmp_path, monkeypatch):
    monkeypatch.setattr(index_mod, "embed_texts", _fake_embed)
    proj = _setup_project(tmp_path)
    db = Database(":memory:")
    db.init_schema()

    index_mod.index_project(str(proj), db)
    chunks = db.all_chunks()
    names = {c.symbol_name for c in chunks if c.symbol_name}
    assert {"alpha", "beta"} <= names
    assert any(c.source_type == "doc" for c in chunks)


def test_incremental_skips_unchanged_files(tmp_path, monkeypatch):
    calls = {"n": 0}

    def counting_embed(texts):
        calls["n"] += len(texts)
        return _fake_embed(texts)

    monkeypatch.setattr(index_mod, "embed_texts", counting_embed)
    proj = _setup_project(tmp_path)
    db = Database(":memory:")
    db.init_schema()

    index_mod.index_project(str(proj), db)
    first = calls["n"]
    assert first > 0

    # Reindex with NO changes -> zero new embeds
    calls["n"] = 0
    index_mod.index_project(str(proj), db)
    assert calls["n"] == 0

    # Change one file -> only its chunks re-embed
    (proj / "a.py").write_text("def alpha(x):\n    return x + 999\n")
    calls["n"] = 0
    index_mod.index_project(str(proj), db)
    assert calls["n"] == 1   # a.py has exactly one symbol chunk


def test_changed_file_hash_updated(tmp_path, monkeypatch):
    monkeypatch.setattr(index_mod, "embed_texts", _fake_embed)
    proj = _setup_project(tmp_path)
    db = Database(":memory:")
    db.init_schema()
    index_mod.index_project(str(proj), db)

    (proj / "a.py").write_text("def alpha(x):\n    return 0\n")
    new_hash = hashlib.sha1((proj / "a.py").read_bytes()).hexdigest()
    index_mod.index_project(str(proj), db)
    assert db.file_hash("a.py") == new_hash
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_index.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'rag.index'`

- [ ] **Step 3: Write `rag/index.py`**

```python
import hashlib
import logging
from pathlib import Path

from rag import config
from rag.db import Database
from rag.embed import embed_texts
from rag.chunkers.docs import chunk_markdown
from rag.chunkers.code import chunk_code
from rag.types import Chunk

logger = logging.getLogger(__name__)


def _iter_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in {".git", "node_modules", ".venv", "__pycache__"} for part in path.parts):
            continue
        ext = path.suffix.lower()
        if ext not in config.DOC_EXTENSIONS and ext not in config.CODE_EXTENSIONS:
            continue
        if path.stat().st_size > config.MAX_FILE_BYTES:
            logger.warning("Skipping oversized file %s", path)
            continue
        yield path, ext


def _hash_bytes(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


def _chunks_for(path: Path, ext: str, rel: str, fhash: str) -> list[Chunk]:
    text = path.read_text(encoding="utf-8", errors="replace")
    if ext in config.DOC_EXTENSIONS:
        return chunk_markdown(text, file_path=rel, file_hash=fhash)
    lang = config.LANG_BY_EXT.get(ext)
    return chunk_code(text, file_path=rel, lang=lang, file_hash=fhash)


def index_project(project_path: str, db: Database) -> dict:
    root = Path(project_path)
    summary = {"indexed": 0, "skipped": 0, "chunks": 0}

    for path, ext in _iter_files(root):
        rel = str(path.relative_to(root)).replace("\\", "/")
        data = path.read_bytes()
        fhash = _hash_bytes(data)

        if db.file_hash(rel) == fhash:
            summary["skipped"] += 1
            continue

        # Changed (or new): drop old chunks, re-chunk, re-embed.
        db.delete_file_chunks(rel)
        chunks = [c for c in _chunks_for(path, ext, rel, fhash) if c.chunk_text.strip()]
        if chunks:
            vectors = embed_texts([c.chunk_text for c in chunks])
            for chunk, vec in zip(chunks, vectors):
                db.insert_chunk(chunk, vec)
        db.upsert_file(rel, fhash)
        summary["indexed"] += 1
        summary["chunks"] += len(chunks)

    return summary
```

- [ ] **Step 4: Run tests to verify pass**

Run: `python -m pytest tests/test_index.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: index orchestrator with hash-based incremental reindex"
```

---

## Task 12: Query pipeline

**Files:**
- Create: `../rag-tool/rag/query.py`
- Test: `../rag-tool/tests/test_query.py`

- [ ] **Step 1: Write the failing test**

`tests/test_query.py`:
```python
import rag.query as query_mod
from rag.db import Database
from rag.types import Chunk


def _insert(db, text, sym, stype, vec):
    db.insert_chunk(
        Chunk(text, stype, f"{sym}.x", "python", sym, "function", None, 1, 2, "h"), vec
    )


def test_query_returns_controlled_doc_code_mix(monkeypatch, tmp_path):
    db = Database(":memory:")
    db.init_schema()
    # 4 code, 4 doc chunks, dim 3
    for i in range(4):
        _insert(db, f"code body {i}", f"codef{i}", "code", [1.0, 0.0, float(i)])
    for i in range(4):
        _insert(db, f"doc body {i}", f"docs{i}", "doc", [0.0, 1.0, float(i)])

    monkeypatch.setattr(query_mod, "embed_one", lambda q: [1.0, 0.0, 0.0])
    # rerank passthrough: keep fused order, wrap as Result
    monkeypatch.setattr(
        query_mod, "rerank",
        lambda q, chunks, top_k: [query_mod.Result(c, 1.0) for c in chunks[:top_k]],
    )

    results = query_mod.query("anything", [db], mix_docs=2, mix_code=2)
    types = [r.chunk.source_type for r in results]
    assert types.count("doc") == 2
    assert types.count("code") == 2


def test_no_rerank_flag_skips_reranker(monkeypatch):
    db = Database(":memory:")
    db.init_schema()
    _insert(db, "code body", "codef", "code", [1.0, 0.0, 0.0])

    monkeypatch.setattr(query_mod, "embed_one", lambda q: [1.0, 0.0, 0.0])

    def _boom(*a, **k):
        raise AssertionError("rerank should not be called when use_rerank=False")

    monkeypatch.setattr(query_mod, "rerank", _boom)
    results = query_mod.query("x", [db], use_rerank=False, mix_docs=1, mix_code=1)
    assert len(results) == 1


def test_multi_db_results_are_merged(monkeypatch):
    db1, db2 = Database(":memory:"), Database(":memory:")
    db1.init_schema(); db2.init_schema()
    _insert(db1, "from db1", "one", "code", [1.0, 0.0, 0.0])
    _insert(db2, "from db2", "two", "code", [1.0, 0.0, 0.0])

    monkeypatch.setattr(query_mod, "embed_one", lambda q: [1.0, 0.0, 0.0])
    monkeypatch.setattr(
        query_mod, "rerank",
        lambda q, chunks, top_k: [query_mod.Result(c, 1.0) for c in chunks[:top_k]],
    )
    results = query_mod.query("x", [db1, db2], mix_docs=0, mix_code=5)
    syms = {r.chunk.symbol_name for r in results}
    assert syms == {"one", "two"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_query.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'rag.query'`

- [ ] **Step 3: Write `rag/query.py`**

```python
from rag import config
from rag.db import Database
from rag.embed import embed_one
from rag.rerank import rerank
from rag.fusion import rrf_fuse
from rag.types import Chunk, Result


def _chunk_key(c: Chunk) -> str:
    return f"{c.file_path}:{c.start_line}:{c.symbol_name or c.section_name or ''}"


def query(
    text: str,
    dbs: list[Database],
    use_rerank: bool = True,
    mix_docs: int = config.MIX_DOCS,
    mix_code: int = config.MIX_CODE,
) -> list[Result]:
    qvec = embed_one(text)

    # Stage 2: retrieve wide from every DB, two ways.
    semantic: list[Chunk] = []
    lexical: list[Chunk] = []
    for db in dbs:
        semantic.extend(db.semantic_search(qvec, limit=config.RETRIEVAL_WIDTH))
        lexical.extend(db.lexical_search(_fts_query(text), limit=config.RETRIEVAL_WIDTH))

    # Stage 3: fuse.
    fused = rrf_fuse([semantic, lexical], k=config.RRF_K, key=_chunk_key)

    # Stage 4: rerank (or passthrough).
    candidates = fused[: config.RERANK_WIDTH]
    if use_rerank:
        ranked = rerank(text, candidates, top_k=len(candidates))
    else:
        ranked = [Result(c, 0.0) for c in candidates]

    # Stage 5: controlled doc/code mix.
    docs = [r for r in ranked if r.chunk.source_type == "doc"][:mix_docs]
    code = [r for r in ranked if r.chunk.source_type == "code"][:mix_code]
    return docs + code


def _fts_query(text: str) -> str:
    """Make a safe FTS5 MATCH query: OR the bare terms, ignore punctuation."""
    terms = [t for t in "".join(ch if ch.isalnum() else " " for ch in text).split() if t]
    return " OR ".join(terms) if terms else '""'
```

- [ ] **Step 4: Run tests to verify pass**

Run: `python -m pytest tests/test_query.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: hybrid query pipeline (semantic+lexical, RRF, rerank, mix)"
```

---

## Task 13: CLI

**Files:**
- Create: `../rag-tool/rag/cli.py`
- Test: `../rag-tool/tests/test_cli.py`

- [ ] **Step 1: Write the failing test**

`tests/test_cli.py`:
```python
import rag.cli as cli
from rag.errors import IndexNotFoundError


def test_query_unindexed_project_exits_nonzero(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(cli.registry, "resolve", lambda p: None)
    code = cli.main(["query", "hello", "--project", str(tmp_path)])
    assert code != 0
    err = capsys.readouterr().err
    assert "rag index" in err


def test_index_invokes_pipeline(tmp_path, monkeypatch):
    called = {}

    def fake_register(p):
        return tmp_path / "index.db"

    def fake_index(path, db):
        called["path"] = path
        return {"indexed": 1, "skipped": 0, "chunks": 2}

    monkeypatch.setattr(cli.registry, "register", fake_register)
    monkeypatch.setattr(cli, "index_project", fake_index)
    monkeypatch.setattr(cli, "_open_db", lambda path: object())
    code = cli.main(["index", str(tmp_path)])
    assert code == 0
    assert called["path"] == str(tmp_path)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_cli.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'rag.cli'`

- [ ] **Step 3: Write `rag/cli.py`**

```python
import argparse
import sys
from typing import Optional

from rag import registry
from rag.db import Database
from rag.index import index_project
from rag.query import query
from rag.errors import RagError, IndexNotFoundError


def _open_db(path) -> Database:
    db = Database(path)
    db.init_schema()
    return db


def _cmd_index(args) -> int:
    db_path = registry.register(args.path)
    db = _open_db(db_path)
    summary = index_project(args.path, db)
    print(f"Indexed {summary['indexed']} file(s), "
          f"skipped {summary['skipped']}, {summary['chunks']} chunk(s).")
    return 0


def _cmd_query(args) -> int:
    db_path = registry.resolve(args.project)
    if db_path is None:
        raise IndexNotFoundError(
            f"No index for {args.project}. Run: rag index {args.project}"
        )
    db = _open_db(db_path)
    results = query(args.text, [db], use_rerank=not args.no_rerank)
    if not results:
        print("No results.")
        return 0
    for r in results:
        loc = f"{r.chunk.file_path}:{r.chunk.start_line or ''}"
        label = r.chunk.symbol_name or r.chunk.section_name or ""
        print(f"[{r.score:.3f}] ({r.chunk.source_type}) {loc} {label}")
        print(r.chunk.chunk_text[:300])
        print("---")
    return 0


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="rag")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_index = sub.add_parser("index", help="Index a project")
    p_index.add_argument("path")
    p_index.set_defaults(func=_cmd_index)

    p_query = sub.add_parser("query", help="Query a project's index")
    p_query.add_argument("text")
    p_query.add_argument("--project", default=".")
    p_query.add_argument("--no-rerank", action="store_true")
    p_query.set_defaults(func=_cmd_query)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except RagError as e:
        print(str(e), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run tests to verify pass**

Run: `python -m pytest tests/test_cli.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Run the full unit suite (no slow tests)**

Run: `python -m pytest -m "not slow" -v`
Expected: PASS (all tasks 1–13)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: argparse CLI (index/query) with typed-error handling"
```

---

## Task 14: End-to-end acceptance test (real models, the proof)

**Files:**
- Test: `../rag-tool/tests/test_e2e_acceptance.py`

- [ ] **Step 1: Write the slow acceptance test**

`tests/test_e2e_acceptance.py`:
```python
import shutil
from pathlib import Path

import pytest

from rag.db import Database
from rag.index import index_project
from rag.query import query

pytestmark = pytest.mark.slow

# Point at the utility-calculator repo (sibling of rag-tool). Override with env if needed.
CORPUS = Path(__file__).resolve().parents[2] / "new-utility-calculator"


@pytest.fixture(scope="module")
def indexed_db(tmp_path_factory):
    if not CORPUS.exists():
        pytest.skip(f"corpus not found at {CORPUS}")
    db_file = tmp_path_factory.mktemp("e2e") / "index.db"
    db = Database(str(db_file))
    db.init_schema()
    index_project(str(CORPUS), db)
    return db


def _symbols(results):
    return {r.chunk.symbol_name for r in results if r.chunk.symbol_name}


def test_identifier_query_finds_validate_meter_rollback(indexed_db):
    results = query("validateMeterRollback", [indexed_db], mix_docs=2, mix_code=5)
    assert "validateMeterRollback" in _symbols(results)


def test_concept_query_finds_same_function_without_keyword(indexed_db):
    # No exact keyword overlap — semantic path must carry it.
    results = query("prevent meter reading from going backwards", [indexed_db],
                    mix_docs=2, mix_code=5)
    assert "validateMeterRollback" in _symbols(results)


def test_error_string_query_lexical_hit(indexed_db):
    results = query("meter rollback not allowed", [indexed_db], mix_docs=2, mix_code=5)
    texts = " ".join(r.chunk.chunk_text for r in results)
    assert "rollback" in texts.lower()
```

- [ ] **Step 2: Run the acceptance test (downloads models on first run)**

Run: `python -m pytest tests/test_e2e_acceptance.py -v -m slow`
Expected: PASS (3 passed). First run downloads `all-MiniLM-L6-v2` and the cross-encoder (~minutes). If `test_concept_query` fails, it indicates semantic recall is weak — record as a finding for the "larger embedding model" open question; do NOT loosen the test silently.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: end-to-end acceptance (identifier, concept, error-string queries)"
```

- [ ] **Step 4: Write the README usage section**

Append to `../rag-tool/README.md`:
```markdown
# rag-tool

Standalone multi-project RAG: indexes docs + code, retrieves via hybrid
(semantic + lexical) search with cross-encoder reranking.

## Install
```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

## Use
```bash
rag index /path/to/project          # build/refresh the index (incremental)
rag query "how does billing validate" --project /path/to/project
rag query "validateMeterRollback" --project /path/to/project --no-rerank
```

Indexes live under `~/.rag/<project-id>/index.db` (override root with `RAG_HOME`).

## Test
```bash
pytest -m "not slow"     # fast unit suite
pytest -m slow           # end-to-end (downloads models)
```
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "docs: README usage and install instructions"
```

---

## Self-Review Notes

**Spec coverage** — every spec section maps to a task:
- Architecture/module layout → Tasks 1–13 (one module each)
- Centralized DB + registry + normalization → Tasks 3, 4
- BLOB embeddings, FTS5 sync, files table, dimension guard, FTS5-unavailable check → Task 5
- Docs chunker → Task 6; tree-sitter code chunker + whole-file fallback + skip-unknown → Task 7
- Embed/rerank singletons → Tasks 8, 9
- RRF (non-negotiable) → Task 10
- Incremental reindex (non-negotiable) → Task 11
- Hybrid → fuse → rerank → mix + `--no-rerank` + multi-DB seam → Task 12
- Typed errors only caught in CLI → Task 13
- Acceptance trio (identifier / concept / error-string) → Task 14

**Deferred-but-seamed:** multi-DB fan-out is exercised by `test_multi_db_results_are_merged` (Task 12) even though the CLI passes a single DB — the seam is real and tested.

**Edge cases from spec → tests:** dimension mismatch (Task 5), FTS5 unavailable (Task 5 `_check_fts5`), broken-file fallback + unknown language (Task 7), oversized/binary skip (Task 11 `_iter_files`), index-missing-on-query (Task 13).

**Known acceptance risk:** `test_concept_query_finds_same_function_without_keyword` depends on MiniLM semantic recall. If it fails, that's a real signal feeding the "larger embedding model" open question — not a test to weaken.
