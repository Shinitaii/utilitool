# RAG Eval Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a retrieval-quality eval harness to rag-tool: a hand-labeled query→expected-files set scored through the warm server into hit-rate, Recall@3, Recall@6, and MRR.

**Architecture:** A pure metrics module (`rag/eval.py`, no I/O) computes the numbers from per-query (ranked result paths, expected fragments). A runner (`rag/eval_runner.py`) loads a JSONL eval set, queries the warm server via the existing `server_client`, and scores each case. A `rag eval` CLI subcommand prints a summary + per-case pass/fail. The harness only reads results — it never touches indexing or the DB.

**Tech Stack:** Python 3.13, stdlib only (json), pytest. Reuses `rag.server_client.query_server`.

**Spec:** `new-utility-calculator/docs/superpowers/specs/2026-06-01-rag-eval-harness-design.md`

**Repo:** `c:/Users/rgvil/coding-projects/rag-tool/`

**Interpreter:** ALWAYS use the venv: `c:/Users/rgvil/coding-projects/rag-tool/.venv/Scripts/python.exe -m pytest ...`. Bare `python` lacks deps. Windows, Bash tool.

---

## File Structure

| File | Responsibility |
|---|---|
| `rag/eval.py` | Pure metrics: `match`, `first_hit_rank`, `reciprocal_rank`, `in_top_k`, and `aggregate` over per-case results. No I/O, no network. |
| `rag/eval_runner.py` | Load JSONL eval set; per case call `server_client.query_server`; extract ordered `file_path`s; score via `eval.py`; return a structured report. Errors clearly if server down / not indexed. |
| `rag/cli.py` (modify) | Add `eval` subcommand → run runner → print summary table + per-case PASS/FAIL. |
| `evals/new-utility-calculator.jsonl` | Seed labeled set (~10 cases), expected paths verified against the real index. |
| `tests/test_eval.py` | Unit tests for the pure metrics. |
| `tests/test_eval_runner.py` | Runner tests with `query_server` stubbed. |
| `tests/test_cli.py` (modify) | Add eval-subcommand arg/dispatch tests. |

---

## Task 1: Pure metrics module (`rag/eval.py`)

**Files:**
- Create: `rag/eval.py`
- Test: `tests/test_eval.py`

- [ ] **Step 1: Write the failing test**

`tests/test_eval.py`:
```python
from rag.eval import match, first_hit_rank, reciprocal_rank, in_top_k, aggregate


def test_match_substring():
    assert match("api/x/billing-cycle.validator.ts", ["billing-cycle.validator.ts"]) is True
    assert match("api/x/other.ts", ["billing-cycle.validator.ts"]) is False


def test_match_any_of_multiple_expected():
    paths = "a/reading.util.ts"
    assert match(paths, ["nope.ts", "reading.util.ts"]) is True


def test_first_hit_rank():
    results = ["a/wrong.ts", "a/reading.util.ts", "a/other.ts"]
    assert first_hit_rank(results, ["reading.util.ts"]) == 2
    assert first_hit_rank(results, ["missing.ts"]) is None
    assert first_hit_rank(["a/reading.util.ts"], ["reading.util.ts"]) == 1


def test_reciprocal_rank():
    assert reciprocal_rank(["x/foo.ts"], ["foo.ts"]) == 1.0
    assert reciprocal_rank(["x/a.ts", "x/foo.ts"], ["foo.ts"]) == 0.5
    assert reciprocal_rank(["x/a.ts"], ["foo.ts"]) == 0.0


def test_in_top_k_boundary():
    results = ["a.ts", "b.ts", "c.ts", "d.ts"]  # expected at rank 3
    assert in_top_k(results, ["c.ts"], k=3) is True
    assert in_top_k(results, ["c.ts"], k=2) is False
    assert in_top_k(results, ["d.ts"], k=3) is False   # rank 4 outside k=3


def test_aggregate_known_values():
    # 3 cases: hit@1, hit@2, miss
    cases = [
        {"results": ["foo.ts"], "expected": ["foo.ts"]},                      # rank 1
        {"results": ["a.ts", "bar.ts"], "expected": ["bar.ts"]},              # rank 2
        {"results": ["a.ts", "b.ts"], "expected": ["missing.ts"]},            # miss
    ]
    agg = aggregate(cases, ks=(3, 6))
    assert agg["count"] == 3
    assert agg["hit_rate"] == 2 / 3
    assert agg["recall_at_3"] == 2 / 3
    assert agg["recall_at_6"] == 2 / 3
    assert abs(agg["mrr"] - (1.0 + 0.5 + 0.0) / 3) < 1e-9


def test_aggregate_empty_no_divide_by_zero():
    agg = aggregate([], ks=(3, 6))
    assert agg["count"] == 0
    assert agg["hit_rate"] == 0.0
    assert agg["mrr"] == 0.0
    assert agg["recall_at_3"] == 0.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `c:/Users/rgvil/coding-projects/rag-tool/.venv/Scripts/python.exe -m pytest tests/test_eval.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'rag.eval'`

- [ ] **Step 3: Write `rag/eval.py`**

```python
"""Pure retrieval-quality metrics. No I/O, no network.

A "case" is a dict {"results": [file_path, ...], "expected": [fragment, ...]}
where `results` is the ordered list of returned file paths (rank 1 first) and
`expected` is the non-empty list of acceptable path fragments. A hit = any
expected fragment is a substring of any result path.
"""
from typing import Optional


def match(path: str, expected: list[str]) -> bool:
    """True if any expected fragment is a substring of path."""
    return any(frag in path for frag in expected)


def first_hit_rank(results: list[str], expected: list[str]) -> Optional[int]:
    """1-based rank of the first result matching expected, or None."""
    for i, path in enumerate(results):
        if match(path, expected):
            return i + 1
    return None


def reciprocal_rank(results: list[str], expected: list[str]) -> float:
    """1/rank of first hit, or 0.0 if no hit."""
    rank = first_hit_rank(results, expected)
    return 1.0 / rank if rank is not None else 0.0


def in_top_k(results: list[str], expected: list[str], k: int) -> bool:
    """True if a hit occurs at rank <= k."""
    rank = first_hit_rank(results, expected)
    return rank is not None and rank <= k


def aggregate(cases: list[dict], ks: tuple[int, ...] = (3, 6)) -> dict:
    """Aggregate per-case (results, expected) into metrics.

    Returns {count, hit_rate, mrr, recall_at_<k> for each k}.
    """
    n = len(cases)
    report: dict = {"count": n}
    if n == 0:
        report["hit_rate"] = 0.0
        report["mrr"] = 0.0
        for k in ks:
            report[f"recall_at_{k}"] = 0.0
        return report

    hits = 0
    rr_sum = 0.0
    recall_hits = {k: 0 for k in ks}
    for case in cases:
        results = case["results"]
        expected = case["expected"]
        rank = first_hit_rank(results, expected)
        if rank is not None:
            hits += 1
            rr_sum += 1.0 / rank
            for k in ks:
                if rank <= k:
                    recall_hits[k] += 1

    report["hit_rate"] = hits / n
    report["mrr"] = rr_sum / n
    for k in ks:
        report[f"recall_at_{k}"] = recall_hits[k] / n
    return report
```

- [ ] **Step 4: Run test to verify it passes**

Run: `c:/Users/rgvil/coding-projects/rag-tool/.venv/Scripts/python.exe -m pytest tests/test_eval.py -v`
Expected: PASS (7 passed)

- [ ] **Step 5: Commit**

```bash
cd c:/Users/rgvil/coding-projects/rag-tool && git add rag/eval.py tests/test_eval.py && git commit -m "feat: pure retrieval-quality metrics (hit-rate, recall@k, MRR)"
```

---

## Task 2: Eval runner (`rag/eval_runner.py`)

**Files:**
- Create: `rag/eval_runner.py`
- Test: `tests/test_eval_runner.py`

- [ ] **Step 1: Write the failing test**

`tests/test_eval_runner.py`:
```python
import json
import pytest
import rag.eval_runner as runner
from rag.errors import RagError


def _write_set(tmp_path, lines):
    p = tmp_path / "set.jsonl"
    p.write_text("\n".join(json.dumps(x) for x in lines), encoding="utf-8")
    return p


def test_load_cases_parses_jsonl(tmp_path):
    p = _write_set(tmp_path, [
        {"query": "q1", "expected": ["a.ts"]},
        {"query": "q2", "expected": ["b.md", "c.md"]},
    ])
    cases = runner.load_cases(str(p))
    assert len(cases) == 2
    assert cases[0]["query"] == "q1"
    assert cases[1]["expected"] == ["b.md", "c.md"]


def test_load_cases_skips_blank_lines(tmp_path):
    p = tmp_path / "s.jsonl"
    p.write_text('{"query":"q","expected":["a"]}\n\n   \n', encoding="utf-8")
    cases = runner.load_cases(str(p))
    assert len(cases) == 1


def test_load_cases_rejects_empty_expected(tmp_path):
    p = _write_set(tmp_path, [{"query": "q", "expected": []}])
    with pytest.raises(RagError):
        runner.load_cases(str(p))


def test_run_eval_scores_via_server(tmp_path, monkeypatch):
    p = _write_set(tmp_path, [
        {"query": "billing validation", "expected": ["billing-cycle.validator.ts"]},
        {"query": "auto billing", "expected": ["missing.ts"]},
    ])
    # Stub the server: first query hits at rank 1, second misses.
    def fake_query(text, project, **kw):
        if "billing validation" in text:
            return {"results": [{"file_path": "api/billing-cycle.validator.ts"}]}
        return {"results": [{"file_path": "api/other.ts"}]}
    monkeypatch.setattr(runner, "query_server", fake_query)

    report = runner.run_eval(str(p), project="/proj")
    assert report["count"] == 2
    assert report["hit_rate"] == 0.5
    assert len(report["per_case"]) == 2
    assert report["per_case"][0]["hit_rank"] == 1
    assert report["per_case"][1]["hit_rank"] is None


def test_run_eval_aborts_when_server_down(tmp_path, monkeypatch):
    p = _write_set(tmp_path, [{"query": "q", "expected": ["a.ts"]}])
    monkeypatch.setattr(runner, "query_server", lambda *a, **k: None)
    with pytest.raises(RagError):
        runner.run_eval(str(p), project="/proj")


def test_run_eval_aborts_when_not_indexed(tmp_path, monkeypatch):
    p = _write_set(tmp_path, [{"query": "q", "expected": ["a.ts"]}])
    monkeypatch.setattr(runner, "query_server", lambda *a, **k: {"not_indexed": True})
    with pytest.raises(RagError):
        runner.run_eval(str(p), project="/proj")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `c:/Users/rgvil/coding-projects/rag-tool/.venv/Scripts/python.exe -m pytest tests/test_eval_runner.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'rag.eval_runner'`

- [ ] **Step 3: Write `rag/eval_runner.py`**

```python
"""Load a JSONL eval set, query the warm server per case, score via rag.eval.

Reads results only — never touches indexing or the DB.
"""
import json
from typing import Optional

from rag.eval import aggregate, first_hit_rank
from rag.server_client import query_server
from rag.errors import RagError


def load_cases(path: str) -> list[dict]:
    """Parse a JSONL eval set: one {"query","expected"} per non-blank line."""
    cases: list[dict] = []
    with open(path, encoding="utf-8") as f:
        for lineno, raw in enumerate(f, start=1):
            line = raw.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                raise RagError(f"{path}:{lineno}: invalid JSON: {e}") from e
            query = obj.get("query")
            expected = obj.get("expected")
            if not query or not expected:
                raise RagError(
                    f"{path}:{lineno}: each case needs a non-empty 'query' and 'expected' list"
                )
            cases.append({"query": query, "expected": expected})
    return cases


def run_eval(set_path: str, project: str) -> dict:
    """Run every case through the warm server and return a scored report."""
    cases = load_cases(set_path)

    scored: list[dict] = []
    for case in cases:
        response = query_server(case["query"], project)
        if response is None:
            raise RagError(
                "RAG server not running (or unreachable). Start it with `rag serve`."
            )
        if response.get("not_indexed"):
            raise RagError(
                f"Project not indexed: {project}. Run `rag index {project}` first."
            )
        results = [r.get("file_path", "") for r in response.get("results", [])]
        rank = first_hit_rank(results, case["expected"])
        scored.append({
            "query": case["query"],
            "expected": case["expected"],
            "results": results,
            "hit_rank": rank,
        })

    report = aggregate(scored, ks=(3, 6))
    report["per_case"] = scored
    return report
```

- [ ] **Step 4: Run test to verify it passes**

Run: `c:/Users/rgvil/coding-projects/rag-tool/.venv/Scripts/python.exe -m pytest tests/test_eval_runner.py -v`
Expected: PASS (6 passed)

- [ ] **Step 5: Commit**

```bash
cd c:/Users/rgvil/coding-projects/rag-tool && git add rag/eval_runner.py tests/test_eval_runner.py && git commit -m "feat: eval runner — load jsonl, query warm server, score"
```

---

## Task 3: `rag eval` CLI subcommand

**Files:**
- Modify: `rag/cli.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_cli.py` (it already imports `rag.cli as cli`):
```python
def test_eval_subcommand_invokes_runner(monkeypatch, capsys):
    captured = {}

    def fake_run_eval(set_path, project):
        captured["set_path"] = set_path
        captured["project"] = project
        return {
            "count": 2, "hit_rate": 0.5, "mrr": 0.5,
            "recall_at_3": 0.5, "recall_at_6": 0.5,
            "per_case": [
                {"query": "q1", "hit_rank": 1, "expected": ["a.ts"], "results": ["x/a.ts"]},
                {"query": "q2", "hit_rank": None, "expected": ["b.ts"], "results": ["x/c.ts"]},
            ],
        }

    monkeypatch.setattr(cli, "run_eval", fake_run_eval)
    code = cli.main(["eval", "evals/x.jsonl", "--project", "/proj"])
    assert code == 0
    assert captured["set_path"] == "evals/x.jsonl"
    assert captured["project"] == "/proj"
    out = capsys.readouterr().out
    assert "hit_rate" in out or "Hit rate" in out
    assert "q1" in out and "q2" in out          # per-case lines printed
    assert "PASS" in out and "FAIL" in out       # pass/fail markers


def test_eval_subcommand_server_down_exits_nonzero(monkeypatch, capsys):
    def boom(set_path, project):
        from rag.errors import RagError
        raise RagError("RAG server not running")
    monkeypatch.setattr(cli, "run_eval", boom)
    code = cli.main(["eval", "evals/x.jsonl", "--project", "/proj"])
    assert code != 0
    assert "server not running" in capsys.readouterr().err.lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `c:/Users/rgvil/coding-projects/rag-tool/.venv/Scripts/python.exe -m pytest tests/test_cli.py -k eval -v`
Expected: FAIL (`eval` subcommand not registered / `cli.run_eval` missing)

- [ ] **Step 3: Modify `rag/cli.py`**

Add the import near the other feature imports (after `from rag.server import serve`):
```python
from rag.eval_runner import run_eval
```

Add the command handler (next to `_cmd_serve`):
```python
def _cmd_eval(args) -> int:
    report = run_eval(args.set_path, args.project)
    print(
        f"cases={report['count']}  hit_rate={report['hit_rate']:.3f}  "
        f"recall@3={report['recall_at_3']:.3f}  recall@6={report['recall_at_6']:.3f}  "
        f"mrr={report['mrr']:.3f}"
    )
    print("---")
    for c in report["per_case"]:
        status = "PASS" if c["hit_rank"] is not None else "FAIL"
        rank = c["hit_rank"] if c["hit_rank"] is not None else "-"
        print(f"[{status}] rank={rank}  {c['query']}")
    return 0
```

Register the subparser in `main()` (after the `serve` subparser block):
```python
    p_eval = sub.add_parser("eval", help="Score retrieval against a labeled set")
    p_eval.add_argument("set_path")
    p_eval.add_argument("--project", default=".")
    p_eval.set_defaults(func=_cmd_eval)
```

(The existing `try/except RagError` in `main()` already prints to stderr and returns 1 — so the server-down abort surfaces correctly with no extra work.)

- [ ] **Step 4: Run test to verify it passes**

Run: `c:/Users/rgvil/coding-projects/rag-tool/.venv/Scripts/python.exe -m pytest tests/test_cli.py -v`
Expected: PASS (all existing CLI tests + 2 new)

- [ ] **Step 5: Run the full suite**

Run: `c:/Users/rgvil/coding-projects/rag-tool/.venv/Scripts/python.exe -m pytest -m "not slow" -q`
Expected: PASS (all green)

- [ ] **Step 6: Commit**

```bash
cd c:/Users/rgvil/coding-projects/rag-tool && git add rag/cli.py tests/test_cli.py && git commit -m "feat: add 'rag eval' CLI subcommand with summary + per-case output"
```

---

## Task 4: Seed eval set + real baseline run

**Files:**
- Create: `evals/new-utility-calculator.jsonl`

This task uses the REAL warm server and the REAL index — it produces the baseline numbers that inform the B decision. The expected paths MUST be verified against the real index, not guessed.

- [ ] **Step 1: Ensure the project is indexed and the server is running**

```bash
cd c:/Users/rgvil/coding-projects/rag-tool
# index if needed (registry already has it from earlier; this is a fast no-op if unchanged):
.venv/Scripts/python.exe -m rag.cli index "c:/Users/rgvil/coding-projects/new-utility-calculator"
# start the server in a background/separate shell:
.venv/Scripts/python.exe -m rag.cli serve --port 8765   # leave running
```
Confirm health: `.venv/Scripts/python.exe -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8765/health',timeout=3).read())"` → `{"status": "ok"}`.

- [ ] **Step 2: Write the seed set**

`evals/new-utility-calculator.jsonl` (one case per line):
```json
{"query": "billing cycle validation and 3% consumption tolerance", "expected": ["billing-cycle.validator.ts"]}
{"query": "per-billing 5% consumption deviation check", "expected": ["billing-cycle.validator.ts"]}
{"query": "how is a billing automatically created when a reading is posted", "expected": ["reading.util.ts"]}
{"query": "prevent a meter reading from going backwards", "expected": ["reading.util.ts"]}
{"query": "cascade soft delete a property and its readings and billings", "expected": ["cascade-delete.util.ts"]}
{"query": "verify the firebase auth token on protected routes", "expected": ["auth.middleware.ts"]}
{"query": "generic firestore repository create read update delete", "expected": ["repository.lib.ts"]}
{"query": "main meter property derived billing consumption", "expected": ["billing-cycle.service.ts"]}
{"query": "role based access control require admin or landlord", "expected": ["require-role.middleware.ts"]}
{"query": "reports summary collection rate and totals", "expected": ["reports.service.ts"]}
```

- [ ] **Step 3: Run the eval against the real server and record the baseline**

```bash
cd c:/Users/rgvil/coding-projects/rag-tool
.venv/Scripts/python.exe -m rag.cli eval evals/new-utility-calculator.jsonl --project "c:/Users/rgvil/coding-projects/new-utility-calculator"
```
Expected: a summary line (`cases=10 hit_rate=… recall@3=… recall@6=… mrr=…`) plus 10 per-case PASS/FAIL lines.

**Important — this is real data, handle honestly:**
- For any **FAIL** case, manually check whether the expected file is actually the right answer. Two possible causes:
  1. The `expected` path is wrong (the concept lives elsewhere) → fix the label.
  2. The expected path is right but retrieval missed it → that is a REAL retrieval finding (a data point for whether B is needed). Do NOT change the label to force a pass.
- Adjust ONLY labels that are genuinely wrong; never tune labels just to inflate the score.
- Record the final baseline numbers in the commit message.

- [ ] **Step 4: Commit the seed set + baseline**

```bash
cd c:/Users/rgvil/coding-projects/rag-tool && git add evals/new-utility-calculator.jsonl && git commit -m "eval: seed new-utility-calculator set + baseline (hit_rate=X recall@6=Y mrr=Z)"
```
(Substitute the real measured numbers into the message.)

- [ ] **Step 5: Report the baseline to the user**

State the baseline metrics and which cases (if any) failed, with your honest read: is single-project retrieval already good (→ B likely unnecessary), or weak (→ B worth building)? This is the decision gate the whole harness exists to serve.

---

## Self-Review Notes

**Spec coverage:**
- Metrics (hit-rate, Recall@3/@6, MRR) + exact definitions → Task 1.
- A+C substring matching, list-of-expected → Task 1 `match`/`first_hit_rank`, tested.
- JSONL format, load + validation (empty expected, blank lines, malformed) → Task 2.
- Server-path only, abort on down/not-indexed (not silent zeros) → Task 2 + Task 3 (via main's RagError handling).
- `rag eval` CLI with summary + per-case pass/fail → Task 3.
- Seed set (~10 cases) + real baseline + B decision gate → Task 4.
- Pure measurement, no indexing/DB writes → eval.py is pure; runner only reads via query_server.

**Placeholder scan:** Task 4's expected paths are explicitly "verify against real index" (real-data step, not a placeholder); the baseline numbers are filled in at run time by design. No TBDs in code.

**Type consistency:** `match(path, expected)`, `first_hit_rank(results, expected)`, `aggregate(cases, ks)` used identically across eval.py, eval_runner.py, and tests. `run_eval(set_path, project)` and `load_cases(path)` signatures match between runner and CLI/tests. `query_server` return shape (`None` / `{"not_indexed":True}` / `{"results":[{"file_path":...}]}`) matches the real `server_client` confirmed from source. Report keys (`count`, `hit_rate`, `recall_at_3`, `recall_at_6`, `mrr`, `per_case`, `hit_rank`) consistent across runner, CLI, and tests.
