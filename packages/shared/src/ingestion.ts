import { z } from "zod";

export const ingestionContentTypeSchema = z.enum(["markdown", "text"]);

export const ingestionDocumentSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  contentType: ingestionContentTypeSchema,
  content: z.string().min(1),
  characterCount: z.number().int().nonnegative(),
});

export const ingestionChunkSchema = z.object({
  documentId: z.string().min(1),
  path: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
  content: z.string().min(1),
  characterCount: z.number().int().nonnegative(),
});

export const ingestionRunResultSchema = z.object({
  sourceDir: z.string().min(1),
  generatedAt: z.string().datetime(),
  documents: z.array(ingestionDocumentSchema),
  chunks: z.array(ingestionChunkSchema),
});

export type IngestionContentType = z.infer<typeof ingestionContentTypeSchema>;
export type IngestionDocument = z.infer<typeof ingestionDocumentSchema>;
export type IngestionChunk = z.infer<typeof ingestionChunkSchema>;
export type IngestionRunResult = z.infer<typeof ingestionRunResultSchema>;
