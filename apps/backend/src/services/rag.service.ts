import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Ollama } from "ollama";
import type { ChatRequest, ChatResponse, Citation, VectorIndex } from "@rksp/shared";
import { vectorIndexSchema } from "@rksp/shared";

import { generateEmbedding, type EmbeddingMode } from "../indexing/embedding.js";

type EmbeddingGenerator = (text: string, dimensions: number, mode: EmbeddingMode) => Promise<number[]>;

type RagServiceOptions = {
  vectorIndexPath?: string;
  topK?: number;
  minScore?: number;
  ollamaClient?: OllamaChatClient | null;
  embeddingGenerator?: EmbeddingGenerator;
};

type OllamaChatClient = {
  chat(request: {
    model: string;
    messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }>;
  }): Promise<{
    message?: {
      content?: string;
    };
  }>;
};

const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SCORE = 0.2;
const DEFAULT_MODEL = "gpt-oss:120b";
const DEFAULT_OLLAMA_HOST = "https://ollama.com";

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

function resolveMinScore(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseFloat(rawValue);
  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function shouldLogRetrievalDebug(): boolean {
  return process.env.RAG_DEBUG_RETRIEVAL?.trim().toLowerCase() === "true";
}

function resolveVectorIndexPath(rawValue: string | undefined, fallback: string): string {
  if (!rawValue) {
    return fallback;
  }

  const trimmed = rawValue.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let total = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let i = 0; i < length; i += 1) {
    const leftValue = left[i] ?? 0;
    const rightValue = right[i] ?? 0;
    total += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return total / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function containsCyrillic(text: string): boolean {
  return /\p{Script=Cyrillic}/u.test(text);
}

function toCitation(entry: VectorIndex["entries"][number]): Citation {
  return {
    sourceId: entry.documentId,
    title: entry.path,
    snippet: entry.content.slice(0, 180),
  };
}

function getContextExcerpt(text: string, maxLength = 1200): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.slice(0, maxLength);
}

function synthesizeAnswer(normalized: string, citations: Citation[]): string {
  if (citations.length === 0) {
    return `Черновой ответ для: "${normalized}". Релевантные фрагменты не найдены.`;
  }

  return [
    `По запросу "${normalized}" найдено следующее:`,
    "В найденных материалах есть релевантное описание по теме запроса.",
    "",
    "Кратко по найденным материалам:",
    citations.slice(0, 3).map((citation, index) => `${index + 1}. ${citation.snippet}`).join("\n"),
    "",
    "Источники:",
    citations.map((citation, index) => `${index + 1}. ${citation.title}: ${citation.snippet}`).join("\n"),
  ].join("\n");
}

function buildModelPrompt(query: ChatRequest, citations: Citation[], fragments: VectorIndex["entries"]): string {
  const historyBlock = query.history?.length
    ? query.history.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n")
    : "История диалога отсутствует.";

  const contextBlock = fragments
    .map((fragment, index) => {
      const snippet = getContextExcerpt(fragment.content, 1400);
      return [
        `Фрагмент ${index + 1}`,
        `Источник: ${fragment.path}`,
        `Текст: ${snippet}`,
      ].join("\n");
    })
    .join("\n\n");

  const citationBlock = citations
    .map((citation, index) => `${index + 1}. ${citation.title} (${citation.sourceId})`)
    .join("\n");

  return [
    `Вопрос пользователя: ${query.message.trim()}`,
    "",
    "История диалога:",
    historyBlock,
    "",
    "Релевантный контекст из базы знаний:",
    contextBlock,
    "",
    "Справка по источникам:",
    citationBlock,
    "",
    "Инструкция: ответь по-русски, кратко и по существу. Используй только приведённый контекст. Если в контексте нет прямого ответа, честно скажи, чего не хватает, и что можно уточнить.",
  ].join("\n");
}

function buildTranslationPrompt(originalQuestion: string): string {
  return [
    "Translate the user's question from Russian into concise English for information retrieval.",
    "Return only the English translation, without quotes, explanations, or extra punctuation.",
    `Russian question: ${originalQuestion.trim()}`,
  ].join("\n");
}

export class RagService {
  private readonly vectorIndexPath: string;
  private readonly topK: number;
  private readonly minScore: number;
  private readonly ollamaClient: OllamaChatClient | null;
  private readonly embeddingGenerator: EmbeddingGenerator;
  private readonly modelName: string;
  private readonly ollamaHost: string;
  private cachedIndex: VectorIndex | null | undefined;

  constructor(options: RagServiceOptions = {}) {
    const workspaceRoot = fileURLToPath(new URL("../../../../", import.meta.url));
    const defaultIndexPath = path.join(workspaceRoot, "data", "processed", "vector-index.json");

    this.vectorIndexPath =
      options.vectorIndexPath ??
      resolveVectorIndexPath(process.env.RAG_VECTOR_INDEX_PATH, defaultIndexPath);
    this.topK = options.topK ?? resolveTopK(process.env.RAG_RETRIEVER_TOP_K, DEFAULT_TOP_K);
    this.minScore = options.minScore ?? resolveMinScore(process.env.RAG_RETRIEVER_MIN_SCORE, DEFAULT_MIN_SCORE);
    this.embeddingGenerator = options.embeddingGenerator ?? generateEmbedding;
    this.modelName = process.env.OLLAMA_MODEL?.trim() || DEFAULT_MODEL;

    const apiKey = process.env.OLLAMA_API_KEY?.trim();
    const host = process.env.OLLAMA_HOST?.trim() || DEFAULT_OLLAMA_HOST;
    this.ollamaHost = host;
    const clientOptions = {
      host,
      ...(apiKey
        ? {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          }
        : {}),
    };

    this.ollamaClient = options.ollamaClient === undefined ? new Ollama(clientOptions) : options.ollamaClient;
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
      if (normalized.length === 0) {
        return {
          answer: synthesizeAnswer(normalized, []),
          grounded: false,
          citations: [],
        };
      }

      const retrievalQuery = await this.translateQueryForRetrieval(normalized);
      const queryEmbedding = await this.embeddingGenerator(retrievalQuery, index.embeddingDimensions, "query");
      const scored = index.entries
        .map((entry) => ({ entry, score: cosineSimilarity(queryEmbedding, entry.embedding) }))
        .filter((item) => item.score >= this.minScore)
        .sort((left, right) => right.score - left.score)
        .slice(0, this.topK);
      const citations = scored.map(({ entry }) => toCitation(entry));

      if (shouldLogRetrievalDebug()) {
        console.debug({
          retrievalQuery,
          topK: this.topK,
          minScore: this.minScore,
          embeddingModel: index.embeddingModel,
          embeddingProvider: index.embeddingProvider,
          embeddingDimensions: index.embeddingDimensions,
          results: scored.map(({ entry, score }) => ({
            score: Number(score.toFixed(4)),
            path: entry.path,
          })),
        }, "RAG retrieval results");
      }

      if (this.ollamaClient && citations.length > 0) {
        try {
          const response = await this.ollamaClient.chat({
            model: this.modelName,
            messages: [
              {
                role: "system",
                content: "Ты русскоязычный ассистент поддержки. Отвечай только на основе предоставленного контекста. Если информации недостаточно, скажи об этом прямо и не выдумывай факты.",
              },
              {
                role: "user",
                content: buildModelPrompt({ ...query, message: normalized }, citations, scored.map(({ entry }) => entry)),
              },
            ],
          });

          const answerText = response.message?.content?.trim() ?? "";
          if (answerText.length > 0) {
            return {
              answer: answerText,
              grounded: true,
              citations,
            };
          }
        } catch (error) {
          console.warn({
            model: this.modelName,
            host: this.ollamaHost,
            error: error instanceof Error ? error.message : String(error),
          }, "Ollama chat request failed; using synthesized RAG fallback");
        }
      }

      return {
        answer: synthesizeAnswer(normalized, citations),
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

  private async translateQueryForRetrieval(question: string): Promise<string> {
    if (!containsCyrillic(question) || !this.ollamaClient) {
      return question;
    }

    try {
      const translationResponse = await this.ollamaClient.chat({
        model: this.modelName,
        messages: [
          {
            role: "system",
            content: "Translate Russian into concise English for retrieval. Output only the translation.",
          },
          {
            role: "user",
            content: buildTranslationPrompt(question),
          },
        ],
      });

      const translated = translationResponse.message?.content?.trim() ?? "";
      return translated.length > 0 ? translated : question;
    } catch (error) {
      console.warn({
        model: this.modelName,
        host: this.ollamaHost,
        error: error instanceof Error ? error.message : String(error),
      }, "Ollama translation request failed; using original retrieval query");
      return question;
    }
  }
}
