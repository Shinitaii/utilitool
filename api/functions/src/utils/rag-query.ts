import Database from 'better-sqlite3';
import { pipeline } from '@huggingface/transformers';
import { resolve } from 'path';

// __dirname is injected by CJS (ts-jest transforms to CJS at test time).
// In ESM production runtime Node also provides it for .ts compiled to .js with NodeNext.
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
  if (a.length !== b.length) {
    throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
  }
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB);
}

// Singleton — Promise is stored so concurrent calls share one load (~200ms on subsequent calls)
let extractorPromise: ReturnType<typeof pipeline> | null = null;

async function embed(text: string): Promise<number[]> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const extractor = await extractorPromise;
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

export async function queryRAG(
  question: string,
  topK = 5,
  dbPath = DEFAULT_DB_PATH
): Promise<RAGResult[]> {
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch {
    throw new Error(
      `utilitool.db not found at ${dbPath}. Run: python index_claude_md.py`
    );
  }

  let rows: ChunkRow[];
  try {
    rows = db
      .prepare('SELECT chunk_text, embedding, section_name, source_file FROM chunks')
      .all() as ChunkRow[];
  } finally {
    db.close();
  }

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
