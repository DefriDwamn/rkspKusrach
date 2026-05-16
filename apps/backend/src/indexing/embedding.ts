import { createHash } from "node:crypto";

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

export function generateEmbedding(text: string, dimensions = 16): number[] {
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
