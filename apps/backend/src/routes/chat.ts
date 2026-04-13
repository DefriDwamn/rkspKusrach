import type { FastifyInstance } from "fastify";

import {
  chatRequestSchema,
  chatResponseSchema,
  type ChatRequest,
} from "@rksp/shared";
import { RagService } from "../services/rag.service.js";

export async function registerChatRoutes(app: FastifyInstance): Promise<void> {
  const ragService = new RagService();

  app.post("/api/chat", async (request, reply) => {
    const parsed = chatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid payload",
        issues: parsed.error.issues,
      });
    }

    const payload: ChatRequest = parsed.data;
    const response = await ragService.answer(payload);
    const validation = chatResponseSchema.safeParse(response);

    if (!validation.success) {
      request.log.error({ issues: validation.error.issues }, "Invalid RAG output");
      return reply.status(500).send({ error: "Invalid response shape" });
    }

    return reply.status(200).send(validation.data);
  });
}
