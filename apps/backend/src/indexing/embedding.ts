import { createHash } from "node:crypto";

import { Ollama, type Config as OllamaConfig } from "ollama";

const DEFAULT_EMBED_MODEL = "nomic-embed-text-v2-moe";
const DEFAULT_OLLAMA_HOST = "http://localhost:11434";
const DEFAULT_EMBED_DIMENSIONS = 768;

type EmbeddingMode = "query" | "document";

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").trim();
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeToken)
    .filter((token) => token.length > 0);
}

function hashTokenToIndex(token: string, dimensions: number): number {
  const digest = createHash("sha256").update(token).digest();
  const hashValue = digest.readUInt32BE(0);
  return hashValue % dimensions;
}

function generateFallbackEmbedding(text: string, dimensions: number): number[] {
  if (dimensions <= 0 || !Number.isInteger(dimensions)) {
    throw new Error("Embedding dimensions must be a positive integer");
  }

  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = tokenize(text);

  if (tokens.length === 0) {
    return vector;
  }

  for (const token of tokens) {
    const index = hashTokenToIndex(token, dimensions);
    vector[index] = (vector[index] ?? 0) + 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }

  return vector.map((value) => Number((value / norm).toFixed(6)));
}

function resolveOllamaClient(): Ollama | null {
  const host = process.env.OLLAMA_EMBED_HOST?.trim() || DEFAULT_OLLAMA_HOST;
  const apiKey = process.env.OLLAMA_EMBED_API_KEY?.trim();
  const clientOptions: OllamaConfig = { host };

  if (apiKey) {
    clientOptions.headers = {
      Authorization: `Bearer ${apiKey}`,
    };
  }

  return new Ollama(clientOptions);
}

function resolveEmbedModel(): string {
  return process.env.OLLAMA_EMBED_MODEL?.trim() || DEFAULT_EMBED_MODEL;
}

function resolveEmbedDimensions(): number {
  const rawValue = process.env.OLLAMA_EMBED_DIMENSIONS?.trim();
  if (!rawValue) {
    return DEFAULT_EMBED_DIMENSIONS;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_EMBED_DIMENSIONS;
  }

  return parsed;
}

function canUseCloudEmbeddings(dimensions: number): boolean {
  return dimensions >= 256 && dimensions <= DEFAULT_EMBED_DIMENSIONS;
}

function prefixText(text: string, mode: EmbeddingMode): string {
  const trimmed = text.trim();
  if (mode === "query") {
    return `search_query: ${trimmed}`;
  }

  return `search_document: ${trimmed}`;
}

async function generateOllamaEmbedding(text: string): Promise<number[] | null> {
  const client = resolveOllamaClient();
  const dimensions = resolveEmbedDimensions();

  if (!client || !canUseCloudEmbeddings(dimensions)) {
    return null;
  }

  const response = await client.embed({
    model: resolveEmbedModel(),
    input: text,
    dimensions,
    truncate: true,
  });

  const vector = response.embeddings[0];
  return Array.isArray(vector) ? vector : null;
}

export async function generateEmbedding(
  text: string,
  dimensions = DEFAULT_EMBED_DIMENSIONS,
  mode: EmbeddingMode = "document",
): Promise<number[]> {
  if (dimensions <= 0 || !Number.isInteger(dimensions)) {
    throw new Error("Embedding dimensions must be a positive integer");
  }

  const prefixedText = prefixText(text, mode);

  try {
    const embedding = await generateOllamaEmbedding(prefixedText);
    if (embedding && embedding.length > 0) {
      return embedding;
    }
  } catch {
    // Fall back to the local hash embedding if cloud embeddings are unavailable.
  }

  return generateFallbackEmbedding(prefixedText, dimensions);
}

export async function generateEmbeddings(
  texts: ReadonlyArray<string>,
  dimensions = DEFAULT_EMBED_DIMENSIONS,
  mode: EmbeddingMode = "document",
): Promise<number[][]> {
  if (dimensions <= 0 || !Number.isInteger(dimensions)) {
    throw new Error("Embedding dimensions must be a positive integer");
  }

  const prefixedTexts = texts.map((text) => prefixText(text, mode));
  const client = resolveOllamaClient();
  const cloudDimensions = resolveEmbedDimensions();

  if (client && canUseCloudEmbeddings(cloudDimensions)) {
    try {
      const response = await client.embed({
        model: resolveEmbedModel(),
        input: prefixedTexts,
        dimensions: cloudDimensions,
        truncate: true,
      });

      if (response.embeddings.length === prefixedTexts.length) {
        return response.embeddings;
      }
    } catch {
      // Fall back to local hash embeddings below.
    }
  }

  return prefixedTexts.map((text) => generateFallbackEmbedding(text, dimensions));
}
