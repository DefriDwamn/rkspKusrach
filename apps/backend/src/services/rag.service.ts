import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ChatRequest, ChatResponse, Citation, VectorIndex } from "@rksp/shared";
import { vectorIndexSchema } from "@rksp/shared";

import { generateEmbedding } from "../indexing/embedding.js";

type RagServiceOptions = {
  vectorIndexPath?: string;
  topK?: number;
};

const DEFAULT_TOP_K = 3;

function resolveTopK(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function resolveVectorIndexPath(rawValue: string | undefined, fallback: string): string {
  if (!rawValue) {
    return fallback;
  }

  const trimmed = rawValue.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function dotProduct(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let total = 0;

  for (let i = 0; i < length; i += 1) {
    const leftValue = left[i] ?? 0;
    const rightValue = right[i] ?? 0;
    total += leftValue * rightValue;
  }

  return total;
}

function toCitation(entry: VectorIndex["entries"][number]): Citation {
  return {
    sourceId: entry.documentId,
    title: entry.path,
    snippet: entry.content.slice(0, 180),
  };
}

function formatAnswer(normalized: string, citations: Citation[]): string {
  if (citations.length === 0) {
    return `Черновой ответ для: "${normalized}". Релевантные фрагменты не найдены.`;
  }

  const header = `Найдено ${citations.length} релевантных фрагмента(ов) для: "${normalized}".`;
  const context = citations
    .map((citation, index) => `${index + 1}. ${citation.title}: ${citation.snippet}`)
    .join("\n");

  return `${header}\nИсточники:\n${context}`;
}

export class RagService {
  private readonly vectorIndexPath: string;
  private readonly topK: number;
  private cachedIndex: VectorIndex | null | undefined;

  constructor(options: RagServiceOptions = {}) {
    const workspaceRoot = fileURLToPath(new URL("../../../../", import.meta.url));
    const defaultIndexPath = path.join(workspaceRoot, "data", "processed", "vector-index.json");

    this.vectorIndexPath =
      options.vectorIndexPath ??
      resolveVectorIndexPath(process.env.RAG_VECTOR_INDEX_PATH, defaultIndexPath);
    this.topK = options.topK ?? resolveTopK(process.env.RAG_RETRIEVER_TOP_K, DEFAULT_TOP_K);
  }

  private async loadIndex(): Promise<VectorIndex | null> {
    if (this.cachedIndex !== undefined) {
      return this.cachedIndex;
    }

    try {
      const raw = await fs.readFile(this.vectorIndexPath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      const validation = vectorIndexSchema.safeParse(parsed);

      if (!validation.success) {
        this.cachedIndex = null;
        return null;
      }

      this.cachedIndex = validation.data;
      return validation.data;
    } catch {
      this.cachedIndex = null;
      return null;
    }
  }

  async answer(query: ChatRequest): Promise<ChatResponse> {
    const normalized = query.message.trim();
    const index = await this.loadIndex();

    if (index) {
      const queryEmbedding = generateEmbedding(normalized, index.embeddingDimensions);
      const scored = index.entries
        .map((entry) => ({ entry, score: dotProduct(queryEmbedding, entry.embedding) }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, this.topK);
      const citations = scored.map(({ entry }) => toCitation(entry));

      return {
        answer: formatAnswer(normalized, citations),
        grounded: citations.length > 0,
        citations,
      };
    }

    return {
      answer: `Черновой ответ для: "${normalized}". На следующей итерации ответ будет строиться через retrieval из индекса.`,
      grounded: true,
      citations: [
        {
          sourceId: "kb-getting-started",
          title: "KB Getting Started",
          snippet: "Внутренний источник знаний будет подключен после шага ingestion.",
        },
      ],
    };
  }
}
