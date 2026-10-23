import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { isLlmConfigured } from "./secrets.js";

/** A2b — local hashing embeddings always; OpenAI when key + provider=openai|auto. */

export type EmbeddingProvider = "local" | "openai";

type EmbeddableChunk = { id: string; title: string; text: string };

export const LOCAL_DIM = 128;

/**
 * Lab synonym groups so local embeddings can bridge paraphrases
 * (e.g. "hung" ↔ timeout runbook) without a cloud embed model.
 */
const SYNONYM_GROUPS: string[][] = [
  ["timeout", "timed", "etimedout", "hung", "hang", "hanging", "stall", "stalled", "slow"],
  ["assertion", "assert", "assertionerror", "expected", "equal", "equals"],
  ["missing", "404", "notfound", "artifact", "artifacts", "download"],
  ["flaky", "intermittent", "rerun", "retry"],
];

function serverDataDir(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../data",
  );
}

export function vectorsPath(): string {
  const fromEnv = process.env.RAG_VECTORS_PATH?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(fromEnv);
  }
  return path.join(serverDataDir(), "rag-vectors.json");
}

export function resolveEmbeddingProvider(
  requested?: string,
): EmbeddingProvider {
  const raw = (requested || process.env.EMBEDDING_PROVIDER || "auto").toLowerCase();
  if (raw === "local") return "local";
  if (raw === "openai") return "openai";
  // auto
  return isLlmConfigured() ? "openai" : "local";
}

function expandSynonyms(tokens: string[]): string[] {
  const set = new Set(tokens);
  const out = [...tokens];
  for (const group of SYNONYM_GROUPS) {
    if (group.some((g) => set.has(g))) {
      for (const g of group) {
        if (!set.has(g)) {
          set.add(g);
          out.push(g);
        }
      }
    }
  }
  return out;
}

/** Deterministic bag-of-tokens → fixed-dim unit vector (hashing trick). */
export function localEmbed(text: string, dim = LOCAL_DIM): number[] {
  const tokens = expandSynonyms(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
  const vec = new Array(dim).fill(0);
  for (const t of tokens) {
    const h = createHash("sha256").update(t).digest();
    const idx = h.readUInt32BE(0) % dim;
    const sign = h[4] % 2 === 0 ? 1 : -1;
    vec[idx] += sign;
  }
  return l2Normalize(vec);
}

export function l2Normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const n = Math.sqrt(sum) || 1;
  return v.map((x) => x / n);
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  // both unit → dot is cosine; clamp for safety
  return Math.max(0, Math.min(1, dot));
}

type VectorFile = {
  provider: EmbeddingProvider;
  model: string;
  dim: number;
  version: number;
  byId: Record<string, number[]>;
};

async function openaiEmbedMany(
  texts: string[],
  apiKey: string,
): Promise<number[][]> {
  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: texts }),
    signal: AbortSignal.timeout(
      Number(process.env.OPENAI_TIMEOUT_MS || 45_000),
    ),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`embeddings HTTP ${res.status}: ${body.slice(0, 180)}`);
  }
  const data = (await res.json()) as {
    data: { embedding: number[]; index: number }[];
  };
  const ordered = [...data.data].sort((a, b) => a.index - b.index);
  return ordered.map((d) => l2Normalize(d.embedding));
}

export async function embedTexts(
  texts: string[],
  provider: EmbeddingProvider,
): Promise<{ vectors: number[][]; model: string; dim: number }> {
  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) throw new Error("OPENAI_API_KEY required for openai embeddings");
    const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
    const vectors = await openaiEmbedMany(texts, key);
    return { vectors, model, dim: vectors[0]?.length ?? 0 };
  }
  const vectors = texts.map((t) => localEmbed(t));
  return { vectors, model: "local-hash-v1", dim: LOCAL_DIM };
}

export async function embedQuery(
  text: string,
  provider: EmbeddingProvider,
): Promise<number[]> {
  const { vectors } = await embedTexts([text], provider);
  return vectors[0];
}

/**
 * Ensure every chunk has a vector on disk; rebuild if provider/model/ids change.
 */
export async function ensureChunkVectors(
  chunks: EmbeddableChunk[],
  provider: EmbeddingProvider,
): Promise<{ byId: Record<string, number[]>; model: string; dim: number }> {
  const file = vectorsPath();
  let cached: VectorFile | null = null;
  if (existsSync(file)) {
    try {
      cached = JSON.parse(readFileSync(file, "utf8")) as VectorFile;
    } catch {
      cached = null;
    }
  }

  const ids = chunks.map((c) => c.id).sort().join(",");
  const probe = await embedTexts(
    chunks.length ? [chunks[0].title + "\n" + chunks[0].text] : ["probe"],
    provider,
  );

  const cacheOk =
    cached &&
    cached.provider === provider &&
    cached.model === probe.model &&
    cached.dim === probe.dim &&
    chunks.every((c) => Array.isArray(cached!.byId[c.id]));

  if (cacheOk && cached) {
    return { byId: cached.byId, model: cached.model, dim: cached.dim };
  }

  // Batch embed (openai) or map (local)
  const texts = chunks.map((c) => `${c.title}\n${c.text}`);
  const { vectors, model, dim } = await embedTexts(texts, provider);
  const byId: Record<string, number[]> = {};
  chunks.forEach((c, i) => {
    byId[c.id] = vectors[i];
  });

  mkdirSync(path.dirname(file), { recursive: true });
  const payload: VectorFile = {
    provider,
    model,
    dim,
    version: 1,
    byId,
  };
  writeFileSync(file, JSON.stringify(payload), "utf8");
  // silence unused — ids used for mental cache key docs
  void ids;
  return { byId, model, dim };
}
