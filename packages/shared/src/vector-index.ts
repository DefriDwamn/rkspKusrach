import { z } from "zod";

import { ingestionChunkSchema, ingestionDocumentSchema } from "./ingestion.js";

export const embeddingVectorSchema = z.array(z.number());

export const vectorIndexEntrySchema = ingestionChunkSchema.extend({
  embedding: embeddingVectorSchema,
});

export const vectorIndexSchema = z.object({
  sourceDir: z.string().min(1),
  generatedAt: z.string().datetime(),
  ingestionGeneratedAt: z.string().datetime(),
  embeddingDimensions: z.number().int().positive(),
  documents: z.array(ingestionDocumentSchema),
  entries: z.array(vectorIndexEntrySchema),
});

export type EmbeddingVector = z.infer<typeof embeddingVectorSchema>;
export type VectorIndexEntry = z.infer<typeof vectorIndexEntrySchema>;
export type VectorIndex = z.infer<typeof vectorIndexSchema>;
