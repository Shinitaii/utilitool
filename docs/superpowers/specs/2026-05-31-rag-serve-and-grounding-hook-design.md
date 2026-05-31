# rag serve + Grounding Hook — Design Spec

**Date:** 2026-05-31
**Status:** Approved (design)
**Author:** Richmond Glenn Viloria (with Claude)
**Builds on:** `2026-05-31-standalone-rag-tool-design.md` (the rag-tool itself)

---

## Context & Motivation

The rag-tool works, but each query in a fresh process pays a ~28-29s model-load cost (measured — even with `--no-rerank`, the bi-encoder loads cold). A per-prompt Claude Code hook spawns a fresh process every time, so auto-grounding via a stateless hook would add ~29s to every matching prompt — unusable.

Fix: a **persistent warm server** (`rag serve`) that loads models once and answers queries over localhost HTTP in ~1-2s. A Claude Code `UserPromptSubmit` hook then queries that server when the prompt looks like an architecture/how-does question, and **degrades silently when the server isn't running** (no error, no wait).

## Goals

1. Warm queries in ~1-2s instead of ~29s cold.
2. Auto-ground architecture/how-does/explain questions with retrieved code+docs context — only when relevant (keyword-gated).
3. Zero penalty when the server is off: hook does nothing, instantly.
4. No new dependencies (Python stdlib `http.server` + `urllib`).
5. Reuse all existing retrieval logic — `serve` is a thin network layer over `query()`.

## Non-Goals (YAGNI)

- **Auto-spawn / always-on service.** User chose **manual start** (`rag serve` in a terminal they keep open). No background-process management, no OS service registration, no port-file staleness reconciliation beyond a simple existence+reachability check.
- **Auth / tokens.** Localhost-only (`127.0.0.1` bind). Approved: anything on the machine could hit it; standard for a personal dev tool.
- **Reindex from the hook.** Indexing stays a manual `rag index` command. The hook never indexes.
- **Multi-host / remote.** Local only.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Server lifecycle | **Manual start** (`rag serve`); hook degrades silently if down |
| Transport | localhost HTTP, stdlib `http.server`, bind `127.0.0.1`, port `8765` (configurable) |
| Auth | none (localhost-only) |
| Scope | one server serves ALL projects (resolves per-request via registry) |
| Hook event | `UserPromptSubmit` (command hook; `jq` is missing so the script is Python) |
| Hook gating | keyword match on the prompt (architecture/how/explain/where/why patterns) |
| Hook settings file | `.claude/settings.local.json` (personal, gitignored — NOT the committed settings.json) |
| Server discovery | `~/.rag/server.json` = `{port, pid}`, written on start, removed on clean exit |

## Architecture

Thin network layer over the existing `query()`. New units:

| File | Responsibility |
|---|---|
| `rag/server_client.py` | Find the running server (read `~/.rag/server.json`), POST a query, return parsed results or `None` if unreachable. Pure client — no model loading. Unit-testable against a stub. |
| `rag/server.py` | `http.server`-based handler: `POST /query` → resolve project DB via registry → call `query()` → JSON response. `GET /health` → `{"status":"ok"}`. Writes/removes the portfile. Loads models once (warms on startup by embedding a dummy string + a no-op rerank). |
| `rag/cli.py` (modify) | Add `serve` subcommand: `rag serve [--port 8765]` → start the server, print "listening on 127.0.0.1:PORT", block. |
| `rag/gate.py` | Pure function `should_ground(prompt: str) -> bool`: keyword/pattern gate. No I/O. Heavily unit-tested (this decides when the hook fires). |
| `~/.rag/hooks/rag_ground.py` | The hook script. Reads stdin JSON, extracts prompt + cwd, calls `should_ground`; if true, uses `server_client` to query the server for the cwd project; prints `additionalContext` JSON. Server down → prints nothing, exit 0. Not-indexed → one-line note. |
| `.claude/settings.local.json` (modify/create) | Wire the `UserPromptSubmit` hook to run `rag_ground.py` via the rag-tool venv python. Add to `.gitignore`. |

### Request/response contract

`POST /query` body:
```json
{"text": "...", "project": "<abs path>", "use_rerank": true, "mix_docs": 3, "mix_code": 3}
```
Response:
```json
{"results": [{"file_path": "...", "start_line": 12, "source_type": "code",
              "symbol_name": "...", "section_name": null, "score": 0.87,
              "snippet": "first ~300 chars"}]}
```
Not-indexed project → HTTP 404 `{"error": "not indexed"}` (client maps to the not-indexed note).

### Hook data flow

```
UserPromptSubmit → stdin JSON {prompt, cwd, ...}
  → rag_ground.py: should_ground(prompt)?
      no  → exit 0, no output
      yes → server_client.query(prompt, cwd)
              server down  → exit 0, no output (silent degrade)
              404 not idx  → print additionalContext: "Project not indexed for RAG; run `rag index <cwd>` to enable grounding."
              results      → print additionalContext: formatted file:line + snippet list
```

## Error Handling

- Server unreachable (no portfile, or connection refused, or timeout ~3s) → client returns `None`; hook emits nothing. Never blocks the prompt.
- Malformed stdin → hook exits 0 silently (never break prompt submission).
- Server-side: project not indexed → 404; query error → 500 with `{"error"}` logged server-side; client treats any non-200 (except 404) as "no grounding" and stays silent.
- Portfile stale (server crashed without cleanup) → client attempts connection, fails fast, treats as down. `rag serve` on start overwrites the portfile.
- Bind failure (port in use) → `rag serve` exits with a clear message (likely another server already running).

## Testing (TDD)

- **`gate.py`** (pure, non-negotiable — decides hook firing): table-driven tests. Positive: "how does billing work", "where is auth handled", "explain the cache layer", "why does X". Negative: "fix this typo", "rename foo to bar", "run the tests", "commit this". Assert exact bool.
- **`server_client.py`**: mock the HTTP layer — server-up returns results; portfile-missing → None; connection-refused → None; timeout → None; 404 → a sentinel ("not_indexed").
- **`server.py`**: start on an ephemeral port (port 0) with a stubbed/monkeypatched `query()` (no real models in unit tests); round-trip `POST /query` (200 results, 404 not-indexed, health check). One real-model integration test marked `slow`.
- **`serve` CLI**: portfile written on start / removed on stop; `--port` honored; bind-in-use exits non-zero. (Use a stubbed server-run so no real model load in the unit test.)
- **End-to-end verification** (manual, during build): start `rag serve` for real, confirm warm query latency over HTTP is ~1-2s; trigger the hook with server up (grounding injected), server down (silent), not-indexed project (note).

## Open Questions / Future

- Auto-spawn lifecycle (deferred; user chose manual).
- A `rag serve --stop` / status command (nice-to-have; portfile makes it easy later).
- Token auth if this ever binds beyond localhost (not now).
