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
    print(f"\nIndexed {len(all_chunks)} chunks from {files_indexed} files -> utilitool.db")


if __name__ == "__main__":
    main()
