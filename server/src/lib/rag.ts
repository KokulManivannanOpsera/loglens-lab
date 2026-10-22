import { readdirSync, readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  cosine,
  embedQuery,
  ensureChunkVectors,
  resolveEmbeddingProvider,
  type EmbeddingProvider,
} from "./embeddings.js";
import type { Diagnosis } from "./types.js";

export type RagChunk = {
  id: string;
  source: string;
  title: string;
  text: string;
};

export type RagHit = RagChunk & { score: number };

export type RagMode = "keyword" | "vector" | "hybrid";

export type RagRetrieval = {
  hits: RagHit[];
  weak: boolean;
  chunkCount: number;
  topScore: number;
  /** A2b */
  mode: RagMode;
  embeddingProvider: EmbeddingProvider | "none";
  embeddingModel: string | null;
};

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "your",
  "have",
  "been",
  "were",
  "are",
  "was",
  "not",
  "but",
  "you",
  "all",
  "any",
  "can",
  "may",
  "into",
  "when",
  "what",
  "which",
  "than",
  "then",
  "them",
  "they",
  "their",
  "will",
  "just",
  "about",
  "over",
  "such",
  "only",
  "also",
  "more",
  "some",
  "like",
  "does",
  "did",
  "dont",
  "don't",
  "log",
  "logs",
  "test",
  "tests",
  "step",
  "steps",
]);

/** Minimum top score to treat retrieval as useful. */
const WEAK_KEYWORD = 0.12;
const WEAK_HYBRID = 0.18;
const DEFAULT_TOP_K = 3;
const HYBRID_KEYWORD_WEIGHT = 0.4;
const HYBRID_VECTOR_WEIGHT = 0.6;

export function resolveRagMode(requested?: string): RagMode {
  const raw = (requested || process.env.RAG_MODE || "hybrid").toLowerCase();
  if (raw === "keyword" || raw === "vector" || raw === "hybrid") return raw;
  return "hybrid";
}

function knowledgeDir(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../knowledge/runbooks",
  );
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * Split a markdown runbook into chunks on ## headings (keep # title on each).
 */
export function chunkMarkdown(source: string, raw: string): RagChunk[] {
  const normalized = raw.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const parts = normalized.split(/\n(?=##\s+)/);
  const chunks: RagChunk[] = [];
  let docTitle = source.replace(/\.md$/i, "");

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;

    const lines = part.split("\n");
    let title = docTitle;
    if (lines[0]?.startsWith("# ")) {
      title = lines[0].replace(/^#\s+/, "").trim();
      docTitle = title;
    } else if (lines[0]?.startsWith("## ")) {
      title = `${docTitle} › ${lines[0].replace(/^##\s+/, "").trim()}`;
    }

    const id = `${source}#${i}`;
    chunks.push({
      id,
      source,
      title,
      text: part.slice(0, 1200),
    });
  }

  return chunks;
}

let cachedChunks: RagChunk[] | null = null;

export function loadRunbookChunks(dir = knowledgeDir()): RagChunk[] {
  if (cachedChunks && dir === knowledgeDir()) return cachedChunks;
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  const chunks: RagChunk[] = [];
  for (const file of files) {
    const raw = readFileSync(path.join(dir, file), "utf8");
    chunks.push(...chunkMarkdown(file, raw));
  }
  if (dir === knowledgeDir()) cachedChunks = chunks;
  return chunks;
}

/** Test helper — clear module cache after temp dirs. */
export function clearRagCache(): void {
  cachedChunks = null;
}

export function scoreChunk(queryTerms: string[], chunk: RagChunk): number {
  if (queryTerms.length === 0) return 0;
  const chunkTerms = new Set(tokenize(`${chunk.title} ${chunk.text}`));
  if (chunkTerms.size === 0) return 0;
  let hits = 0;
  const seen = new Set<string>();
  for (const t of queryTerms) {
    if (seen.has(t)) continue;
    seen.add(t);
    if (chunkTerms.has(t)) hits += 1;
  }
  // Unique query-term recall, lightly length-normalized
  return hits / Math.sqrt(seen.size * Math.min(chunkTerms.size, 80));
}

function keywordRetrieve(
  logText: string,
  chunks: RagChunk[],
  topK: number,
): { hits: RagHit[]; topScore: number } {
  const queryTerms = tokenize(logText);
  const ranked = chunks
    .map((c) => ({ ...c, score: scoreChunk(queryTerms, c) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
  const hits = ranked.slice(0, topK);
  return { hits, topScore: hits[0]?.score ?? 0 };
}

/**
 * A2 keyword retrieve (sync). Prefer retrieveRunbooksHybrid / retrieveRunbooks for A2b.
 */
export function retrieveRunbooksKeyword(
  logText: string,
  opts?: { topK?: number; chunks?: RagChunk[] },
): RagRetrieval {
  const chunks = opts?.chunks ?? loadRunbookChunks();
  const topK = opts?.topK ?? DEFAULT_TOP_K;
  const { hits, topScore } = keywordRetrieve(logText, chunks, topK);
  const weak = hits.length === 0 || topScore < WEAK_KEYWORD;
  return {
    hits,
    weak,
    chunkCount: chunks.length,
    topScore,
    mode: "keyword",
    embeddingProvider: "none",
    embeddingModel: null,
  };
}

/** @deprecated alias — sync keyword only; use retrieveRunbooksAsync for hybrid */
export function retrieveRunbooks(
  logText: string,
  opts?: { topK?: number; chunks?: RagChunk[] },
): RagRetrieval {
  return retrieveRunbooksKeyword(logText, opts);
}

/**
 * A2b — hybrid (keyword + vector) or vector-only / keyword-only via RAG_MODE.
 */
export async function retrieveRunbooksAsync(
  logText: string,
  opts?: {
    topK?: number;
    chunks?: RagChunk[];
    mode?: RagMode;
    embeddingProvider?: EmbeddingProvider | "auto";
  },
): Promise<RagRetrieval> {
  const chunks = opts?.chunks ?? loadRunbookChunks();
  const topK = opts?.topK ?? DEFAULT_TOP_K;
  const mode = resolveRagMode(opts?.mode);
  const chunkCount = chunks.length;

  if (mode === "keyword" || chunks.length === 0) {
    return retrieveRunbooksKeyword(logText, { topK, chunks });
  }

  let provider: EmbeddingProvider;
  try {
    provider =
      opts?.embeddingProvider && opts.embeddingProvider !== "auto"
        ? opts.embeddingProvider
        : resolveEmbeddingProvider(
            opts?.embeddingProvider === "auto" ? "auto" : undefined,
          );
  } catch {
    provider = "local";
  }

  // OpenAI embeddings can fail — fall back to local vectors
  let byId: Record<string, number[]>;
  let model: string;
  let usedProvider: EmbeddingProvider = provider;
  try {
    const ensured = await ensureChunkVectors(chunks, provider);
    byId = ensured.byId;
    model = ensured.model;
  } catch {
    usedProvider = "local";
    const ensured = await ensureChunkVectors(chunks, "local");
    byId = ensured.byId;
    model = ensured.model;
  }

  const qVec = await embedQuery(logText, usedProvider);
  const vectorRanked: RagHit[] = chunks
    .map((c) => {
      const v = byId[c.id];
      const score = v ? cosine(qVec, v) : 0;
      return { ...c, score };
    })
    .filter((c) => c.score > 0.05)
    .sort((a, b) => b.score - a.score);

  if (mode === "vector") {
    const hits = vectorRanked.slice(0, topK);
    const topScore = hits[0]?.score ?? 0;
    return {
      hits,
      weak: hits.length === 0 || topScore < WEAK_HYBRID,
      chunkCount,
      topScore,
      mode: "vector",
      embeddingProvider: usedProvider,
      embeddingModel: model,
    };
  }

  // hybrid: merge keyword + vector into one score
  const queryTerms = tokenize(logText);
  const kwScores = new Map<string, number>();
  let maxKw = 0;
  for (const c of chunks) {
    const s = scoreChunk(queryTerms, c);
    kwScores.set(c.id, s);
    if (s > maxKw) maxKw = s;
  }
  const vecScores = new Map(vectorRanked.map((h) => [h.id, h.score]));

  const hybrid: RagHit[] = chunks
    .map((c) => {
      const kw = maxKw > 0 ? (kwScores.get(c.id) ?? 0) / maxKw : 0;
      const vec = vecScores.get(c.id) ?? 0;
      const score =
        HYBRID_KEYWORD_WEIGHT * kw + HYBRID_VECTOR_WEIGHT * vec;
      return { ...c, score };
    })
    .filter((c) => c.score > 0.05)
    .sort((a, b) => b.score - a.score);

  const hits = hybrid.slice(0, topK);
  const topScore = hits[0]?.score ?? 0;
  return {
    hits,
    weak: hits.length === 0 || topScore < WEAK_HYBRID,
    chunkCount,
    topScore,
    mode: "hybrid",
    embeddingProvider: usedProvider,
    embeddingModel: model,
  };
}

/** Format retrieved chunks for the LLM (trusted runbook side of the prompt). */
export function formatRunbooksForPrompt(hits: RagHit[]): string {
  if (!hits.length) {
    return "No runbook chunks retrieved (weak/empty knowledge match).";
  }
  return hits
    .map(
      (h, i) =>
        `[${i + 1}] source=${h.source} title=${h.title} score=${h.score.toFixed(3)}\n${h.text}`,
    )
    .join("\n\n---\n\n");
}

/**
 * Attach runbook citations; force human review when retrieval is weak.
 * Does not invent log lines — citations are clearly labeled as runbook.
 */
export function groundWithRag(diagnosis: Diagnosis, rag: RagRetrieval): Diagnosis {
  const citations = rag.hits.slice(0, 3).map((h) => {
    const snippet = h.text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#"));
    return `runbook:${h.source} — ${snippet ?? h.title}`;
  });

  let evidence = [...diagnosis.evidence];
  for (const c of citations) {
    if (!evidence.includes(c)) evidence.push(c);
  }
  evidence = evidence.slice(0, 10);

  let { summary, likelyCause, confidence, needsHumanReview, nextSteps } = diagnosis;

  if (rag.weak) {
    needsHumanReview = true;
    if (confidence === "high") confidence = "medium";
    if (!/weak retrieval|do not know|don't know|insufficient/i.test(summary)) {
      summary = `${summary} (weak runbook retrieval — treat as ungrounded in docs)`;
    }
  } else if (rag.hits[0] && /unknown|insufficient/i.test(likelyCause)) {
    // Strong docs but mock/LLM still unsure — keep honesty, cite docs for next steps
    needsHumanReview = true;
    nextSteps = [
      `Consult runbook: ${rag.hits[0].source} (${rag.hits[0].title})`,
      ...nextSteps,
    ].slice(0, 8);
  }

  return {
    ...diagnosis,
    summary,
    likelyCause,
    confidence,
    needsHumanReview,
    evidence,
    nextSteps,
  };
}
