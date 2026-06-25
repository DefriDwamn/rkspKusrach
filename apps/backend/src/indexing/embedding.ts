import { Ollama, type Config as OllamaConfig } from "ollama";

const DEFAULT_EMBED_MODEL = "nomic-embed-text-v2-moe";
const DEFAULT_EMBED_HOST = "http://localhost:11434";
const DEFAULT_EMBED_DIMENSIONS = 768;
const DEFAULT_EMBED_BATCH_SIZE = 32;
const OLLAMA_EMBEDDING_PROVIDER = "ollama";

export type EmbeddingMode = "query" | "document";
type EmbeddingProvider = typeof OLLAMA_EMBEDDING_PROVIDER;

export type EmbeddingMetadata = {
  provider: EmbeddingProvider;
  model: string;
  host: string;
  dimensions: number;
};

function resolveOllamaClient(): Ollama | null {
  const host = resolveEmbedHost();
  const apiKey = process.env.OLLAMA_EMBED_API_KEY?.trim();
  const clientOptions: OllamaConfig = { host };

  if (apiKey) {
    clientOptions.headers = {
      Authorization: `Bearer ${apiKey}`,
    };
  }

  return new Ollama(clientOptions);
}

function resolveEmbedHost(): string {
  return process.env.OLLAMA_EMBED_HOST?.trim() || DEFAULT_EMBED_HOST;
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

function resolveEmbedBatchSize(): number {
  const rawValue = process.env.OLLAMA_EMBED_BATCH_SIZE?.trim();
  if (!rawValue) {
    return DEFAULT_EMBED_BATCH_SIZE;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_EMBED_BATCH_SIZE;
  }

  return parsed;
}

function prefixText(text: string, mode: EmbeddingMode): string {
  const trimmed = text.trim();
  if (mode === "query") {
    return `search_query: ${trimmed}`;
  }

  return `search_document: ${trimmed}`;
}

async function generateOllamaEmbedding(text: string, dimensions: number): Promise<number[] | null> {
  const client = resolveOllamaClient();

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

export function getEmbeddingMetadata(dimensions = resolveEmbedDimensions()): EmbeddingMetadata {
  return {
    provider: OLLAMA_EMBEDDING_PROVIDER,
    model: resolveEmbedModel(),
    host: resolveEmbedHost(),
    dimensions,
  };
}

function assertValidDimensions(dimensions: number): void {
  if (dimensions <= 0 || !Number.isInteger(dimensions)) {
    throw new Error("Embedding dimensions must be a positive integer");
  }
}

function buildEmbeddingFailureMessage(error: unknown): string {
  const detail = error instanceof Error && error.message.length > 0 ? `: ${error.message}` : "";
  return [
    `Failed to generate embeddings with Ollama model "${resolveEmbedModel()}" at ${resolveEmbedHost()}${detail}.`,
    "Start Ollama and pull the embedding model, or configure OLLAMA_EMBED_HOST/OLLAMA_EMBED_API_KEY.",
  ].join(" ");
}

export async function generateEmbedding(
  text: string,
  dimensions = DEFAULT_EMBED_DIMENSIONS,
  mode: EmbeddingMode = "document",
): Promise<number[]> {
  assertValidDimensions(dimensions);

  const prefixedText = prefixText(text, mode);

  try {
    const embedding = await generateOllamaEmbedding(prefixedText, dimensions);
    if (embedding && embedding.length > 0) {
      return embedding;
    }
  } catch (error) {
    throw new Error(buildEmbeddingFailureMessage(error));
  }

  throw new Error(buildEmbeddingFailureMessage(new Error("Ollama returned an empty embedding")));
}

export async function generateEmbeddings(
  texts: ReadonlyArray<string>,
  dimensions = DEFAULT_EMBED_DIMENSIONS,
  mode: EmbeddingMode = "document",
): Promise<number[][]> {
  assertValidDimensions(dimensions);

  const prefixedTexts = texts.map((text) => prefixText(text, mode));

  const client = resolveOllamaClient();
  const ollamaDimensions = resolveEmbedDimensions();

  if (!client || !canUseCloudEmbeddings(ollamaDimensions)) {
    throw new Error(buildEmbeddingFailureMessage(new Error(`Invalid embedding dimensions: ${ollamaDimensions}`)));
  }

  try {
    const batchSize = resolveEmbedBatchSize();
    const embeddings: number[][] = [];

    for (let index = 0; index < prefixedTexts.length; index += batchSize) {
      const batch = prefixedTexts.slice(index, index + batchSize);
      const response = await client.embed({
        model: resolveEmbedModel(),
        input: batch,
        dimensions: ollamaDimensions,
        truncate: true,
      });

      if (response.embeddings.length !== batch.length) {
        throw new Error(`Ollama returned ${response.embeddings.length} embeddings for ${batch.length} inputs`);
      }

      embeddings.push(...response.embeddings);
    }

    return embeddings;
  } catch (error) {
    throw new Error(buildEmbeddingFailureMessage(error));
  }
}
