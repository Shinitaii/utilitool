import Database from 'better-sqlite3';
import { pipeline } from '@huggingface/transformers';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = resolve(__dirname, '../../utilitool.db');

interface RAGResult {
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

let extractorPromise: ReturnType<typeof pipeline> | null = null;

async function embed(text: string): Promise<number[]> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const extractor = await extractorPromise;
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

async function queryRAG(question: string, topK = 5): Promise<RAGResult[]> {
  let db: Database.Database | null = null;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch (error) {
    console.error(`Error: utilitool.db not found at ${DB_PATH}`);
    console.error('Run: python index_claude_md.py');
    process.exit(1);
  }

  let rows: ChunkRow[];
  try {
    rows = db
      .prepare('SELECT chunk_text, embedding, section_name, source_file FROM chunks')
      .all() as ChunkRow[];
  } catch (error) {
    console.error('Error querying database:', error);
    db.close();
    process.exit(1);
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

// CLI entry point
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: npx tsx rag.ts <query> [topK]');
  process.exit(1);
}

const query = args[0];
const topK = args[1] ? parseInt(args[1], 10) : 5;

queryRAG(query, topK)
  .then((results) => {
    if (results.length === 0) {
      console.log('No results found.');
      return;
    }
    results.forEach((r) => {
      console.log(`[${r.similarity.toFixed(3)}] ${r.source} / ${r.section}`);
      console.log(r.text.slice(0, 300));
      console.log('---\n');
    });
  })
  .catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
