import { Ollama, type Config as OllamaConfig } from "ollama";

const OLLAMA_EMBEDDING_PROVIDER = "ollama";

export type EmbeddingMode = "query" | "document";
type EmbeddingProvider = typeof OLLAMA_EMBEDDING_PROVIDER;

export type EmbeddingMetadata = {
  provider: EmbeddingProvider;
  model: string;
  host: string;
  dimensions: number;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

function resolveOllamaClient(): Ollama {
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
  return requireEnv("OLLAMA_EMBED_HOST");
}

function resolveEmbedModel(): string {
  return requireEnv("OLLAMA_EMBED_MODEL");
}

function resolveEmbedDimensions(): number {
  return resolvePositiveInteger("OLLAMA_EMBED_DIMENSIONS");
}

function canUseCloudEmbeddings(dimensions: number): boolean {
  return dimensions >= 256 && dimensions <= 768;
}

function resolveEmbedBatchSize(): number {
  return resolvePositiveInteger("OLLAMA_EMBED_BATCH_SIZE");
}

function resolvePositiveInteger(name: string): number {
  const value = Number.parseInt(requireEnv(name), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }
  return value;
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
  dimensions = resolveEmbedDimensions(),
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
  dimensions = resolveEmbedDimensions(),
  mode: EmbeddingMode = "document",
): Promise<number[][]> {
  assertValidDimensions(dimensions);

  const prefixedTexts = texts.map((text) => prefixText(text, mode));

  const client = resolveOllamaClient();
  const ollamaDimensions = resolveEmbedDimensions();

  if (!canUseCloudEmbeddings(ollamaDimensions)) {
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
