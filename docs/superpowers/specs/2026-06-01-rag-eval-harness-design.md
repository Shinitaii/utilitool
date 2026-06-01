# RAG Eval Harness — Design Spec

**Date:** 2026-06-01
**Status:** Approved (design)
**Author:** Richmond Glenn Viloria (with Claude)
**Builds on:** `2026-05-31-standalone-rag-tool-design.md`, `2026-05-31-rag-serve-and-grounding-hook-design.md`

---

## Context & Motivation

Retrieval quality is currently judged by eyeballing results ("those look right"). That's anecdotal — it can't answer "is the reranker's extra ~6s worth it?", "did a change help or hurt?", or "is retrieval still good after the corpus grew?". This harness turns retrieval quality into **repeatable numbers** (Recall@k, MRR, hit-rate) computed against a hand-labeled set of `query → expected files` pairs.

**Critical framing (decided during brainstorming):**
- RAG does not learn. The eval set is **not** training data — it never feeds the tool. It is an *answer key held only by the grader*; retrieval runs blind, the harness scores what came back. No leakage into retrieval.
- For a personal tool with ~4 config knobs, formal dev/held-out splits are overkill (almost no capacity to overfit). **One eval set is sufficient.** This is a quality *regression test* (like unit tests for retrieval), not an ML training apparatus.
- The harness is the prerequisite for deciding whether **B (contextual enrichment)** is worth building: baseline eval → (if results already good, skip B) → else apply B, re-index, re-eval, compare.

## Goals

1. Produce repeatable retrieval-quality metrics for a project: **hit-rate, Recall@3, Recall@6, MRR**.
2. Be hand-editable and append-friendly (the user writes/extends the labeled cases).
3. Show *which* queries passed/failed, not just an aggregate — so failures are diagnosable.
4. Pure measurement: never touches indexing, never modifies the DB, never trains anything.

## Non-Goals (YAGNI)

- **No dev/held-out split.** One set per project. (Revisit only if the set grows large and aggressive tuning begins, or if embedding fine-tuning is ever attempted — neither is planned.)
- **No automatic label generation.** Labels are hand-written by the user (who knows the codebase). Auto-labeling would be circular.
- **No in-process / `--no-server` flag.** The eval runs through the warm server (the real path). If a future B-tuning workflow needs an in-process variant to avoid stale-server code, add it *then*, with a concrete reason. (Decided: don't build on speculation.)
- **No tuning automation / knob search.** The harness reports numbers; the human reads them and decides.

## Matching Model (decided: A+C, not B)

Each eval case has a list of one-or-more **expected file paths**. A **hit** = any expected path is a **substring** of the `file_path` of any returned result (so `billing-cycle.validator.ts` matches `api/functions/src/features/billing-cycle/billing-cycle.validator.ts`). Substring is the single matching rule everywhere — no separate suffix logic.

- File-path based (not symbol/section based). Symbol-level matching was rejected: it couples the eval to chunker naming AND implicitly punishes messy doc structure, conflating "retrieval is bad" with "docs are messy". The eval must measure *retrieval*, not doc hygiene.
- List-of-acceptable-files handles concepts that legitimately live in multiple places (e.g. a validator AND its service).

## Architecture

Pure measurement layer on top of `query()` (served via the warm server). New units:

| File | Responsibility |
|---|---|
| `rag/eval.py` | **Pure metrics logic** (no I/O, no network). Given, per query, a ranked list of result file paths + the expected paths, compute hit / reciprocal-rank / in-top-k. Aggregate across cases into hit-rate, Recall@3, Recall@6, MRR. |
| `rag/eval_runner.py` | Orchestration: load the `.jsonl` eval set, query the warm server (`server_client.query_server`) per case, extract ordered result `file_path`s, call `eval.py` to score, return a structured report. Errors clearly if the server is down. |
| `rag/cli.py` (modify) | Add `eval` subcommand: `rag eval <set-file> [--project <path>]` → run, print summary table + per-query pass/fail. |
| `evals/<project-id>.jsonl` | The labeled set (one project = one file). Seeded with ~10 cases for `new-utility-calculator`; user extends. |

### Eval set format (JSON Lines)

One case per line:
```json
{"query": "billing cycle validation and 3% tolerance", "expected": ["billing-cycle.validator.ts"]}
{"query": "how does auto-billing get created when a reading is posted", "expected": ["reading.util.ts", "reading-auto-creates-billing.md"]}
```
- `query`: string sent to retrieval.
- `expected`: non-empty list of path fragments; a hit = any matches any returned `file_path`.
- Hand-editable; comments not supported (strict JSONL) — keep a header note in the spec/README instead.

### Metric definitions (exact, for TDD)

Given ordered result paths `R = [r1, r2, ...]` and expected fragments `E`:
- **match(r, E)** = any `e in E` is a substring of `r`.
- **first_hit_rank** = 1-based index of the first `r` in `R` with `match(r, E)`; `None` if no match.
- **hit** (for hit-rate) = `first_hit_rank is not None`.
- **in_top_k** = `first_hit_rank is not None and first_hit_rank <= k`.
- **reciprocal_rank** = `1/first_hit_rank` if hit else `0.0`.

Aggregates over N cases:
- **hit_rate** = (# cases with hit) / N
- **recall_at_k** = (# cases with in_top_k) / N, reported for k=3 and k=6
- **mrr** = mean(reciprocal_rank over all cases)

(Note: `query()` returns docs-then-code grouped, ~6 results total; "rank" is position in that returned list. The eval measures the list as the tool actually returns it.)

## Data Flow

```
rag eval evals/<proj>.jsonl --project <abs path>
  → load cases (jsonl)
  → for each case: query_server(query, project)   [warm server]
        server down → abort with clear "start rag serve" message
        results     → ordered [file_path, ...]
  → eval.score(results_paths, expected) per case
  → aggregate → {hit_rate, recall@3, recall@6, mrr, per_case[]}
  → print summary table + per-case PASS/FAIL (query, first_hit_rank, matched path)
```

## Error Handling

- **Server down / unreachable** → abort the whole run with a clear message ("RAG server not running; start `rag serve`"). Do NOT silently produce zeroed metrics (that would look like terrible retrieval rather than "no server").
- **Eval set file missing / malformed line** → clear error naming the file/line; skip-and-warn on a single bad line is acceptable but the count of skipped lines must be reported.
- **Empty `expected` list** → validation error for that case (a case with no expected answer is meaningless).
- **A query returns zero results** → counts as a miss (rank None, RR 0) — that's a real retrieval failure, recorded honestly.
- **404 not-indexed from server** → abort with "project not indexed; run `rag index`".

## Testing (TDD)

- **`eval.py` (pure, thorough — this is the contract):**
  - `match`: substring hit / no hit / multiple expected (any matches).
  - `first_hit_rank`: hit at rank 1, hit at rank 3, no hit → None.
  - `reciprocal_rank`: 1.0 at rank 1, 0.5 at rank 2, 0.0 on miss.
  - `recall_at_k`: hit inside k → counts; hit outside k → doesn't; exact boundary (hit at rank k counts, rank k+1 doesn't).
  - aggregates: known set of per-case results → exact hit_rate / recall@3 / recall@6 / mrr (hand-computed expected values).
  - edge: empty case list → metrics are 0 (or defined sentinel), no divide-by-zero.
- **`eval_runner.py`:** stub `query_server` (monkeypatch) to return canned results; assert it loads jsonl, scores, aggregates correctly; assert server-down → clear abort; assert malformed-line handling.
- **CLI `eval`:** stub the runner; assert arg parsing (`<set-file>`, `--project`), exit codes, summary printed.
- **Real run:** manual/slow — `rag serve` up, `rag eval evals/new-utility-calculator.jsonl` against the real index; record the baseline numbers. This is the actual deliverable that informs the B decision.

## Seed Eval Set (≈10 cases, author-confident from the audit)

Examples (final list written during implementation; expected paths verified against the real index):
- billing cycle validation / 3% tolerance → `billing-cycle.validator.ts`
- per-billing 5% tolerance → `billing-cycle.validator.ts`
- auto-billing on reading create → `reading.util.ts`, `reading-auto-creates-billing.md`
- meter rollback prevention → `reading.util.ts` (or wherever `validateMeterRollback` lives)
- cascade soft-delete → `cascade-delete.util.ts`
- auth / Firebase token verification → `auth.middleware.ts`
- generic repository CRUD → `repository.lib.ts`
- timestamp serialization → `index.ts` / `firestore.util.ts`
- reports aggregation → `reports.service.ts`
- main-meter derived billing → `billing-cycle.service.ts`

User extends with their own cases (especially ones they'd phrase in their own words — paraphrase queries test the semantic path).

## How the harness gets used (the actual workflow it enables)

1. `rag serve` (warm).
2. `rag eval evals/new-utility-calculator.jsonl` → record **baseline** numbers.
3. **Decision gate for B:** if baseline Recall/MRR is already good (docs/code present well), **skip B** — proven unnecessary. If retrieval is weak, that's the signal to build B, then re-index and re-eval to measure the delta.
4. Re-run anytime the corpus or the tool changes, to catch regressions.

## Open Questions / Future

- In-process eval path — only if a B-tuning workflow needs to bypass a stale running server. Add with reason.
- Multi-project eval aggregation — naturally follows #2 (cross-project fan-out); out of scope now.
- Larger eval sets / dev-held-out split — only if scale + aggressive tuning ever justify it.
