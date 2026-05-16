import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

import { buildApp } from "./app.js";

loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

async function start(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port, host });
    app.log.info(`Backend listening on http://${host}:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
