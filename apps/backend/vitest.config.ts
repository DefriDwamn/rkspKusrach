import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    env: {
      OLLAMA_EMBED_HOST: "http://localhost:11434",
      OLLAMA_EMBED_MODEL: "nomic-embed-text-v2-moe",
      OLLAMA_EMBED_DIMENSIONS: "768",
      OLLAMA_EMBED_BATCH_SIZE: "32",
    },
  },
});
