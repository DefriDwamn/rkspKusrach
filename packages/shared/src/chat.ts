import { z } from "zod";

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

export const citationSchema = z.object({
  sourceId: z.string().min(1),
  title: z.string().min(1),
  snippet: z.string().min(1),
});

export const chatRequestSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
  history: z.array(chatMessageSchema).max(20).optional(),
});

export const chatResponseSchema = z.object({
  answer: z.string().min(1),
  citations: z.array(citationSchema),
  grounded: z.boolean(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type Citation = z.infer<typeof citationSchema>;
