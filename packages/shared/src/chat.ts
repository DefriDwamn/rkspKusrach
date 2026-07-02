import { z } from "zod";

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

export const updateChatMessageSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
});

export const authCredentialsSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(8).max(128),
});

export const authStatusSchema = z.object({
  authenticated: z.boolean(),
  username: z.string().min(1).optional(),
  guestChatAvailable: z.boolean(),
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

export const chatHistoryResponseSchema = z.object({
  sessionId: z.string().min(1),
  messages: z.array(chatMessageSchema),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type UpdateChatMessage = z.infer<typeof updateChatMessageSchema>;
export type AuthCredentials = z.infer<typeof authCredentialsSchema>;
export type AuthStatus = z.infer<typeof authStatusSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type ChatHistoryResponse = z.infer<typeof chatHistoryResponseSchema>;
export type Citation = z.infer<typeof citationSchema>;
