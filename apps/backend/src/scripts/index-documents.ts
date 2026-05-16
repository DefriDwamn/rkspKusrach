import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ingestionRunResultSchema, type IngestionRunResult } from "@rksp/shared";

import { buildVectorIndex, writeVectorIndex } from "../indexing/vector-index.js";

type IndexingCliOptions = {
  inputPath: string | undefined;
  outputPath: string | undefined;
};

function parseIndexingCliArgs(argv: string[]): IndexingCliOptions {
  const positionalArgs = argv.filter((argument) => !argument.startsWith("-"));
  const inputFlagIndex = argv.indexOf("--input");
  const outputFlagIndex = argv.indexOf("--output");

  const inputPath = inputFlagIndex >= 0 ? argv[inputFlagIndex + 1] : positionalArgs[0];
  const outputPath = outputFlagIndex >= 0 ? argv[outputFlagIndex + 1] : positionalArgs[1];

  return { inputPath, outputPath };
}

function resolveRelativePath(baseDir: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(baseDir, inputPath);
}

async function readIngestionManifest(manifestPath: string): Promise<IngestionRunResult> {
  const content = await fs.readFile(manifestPath, "utf8");
  const parsed: unknown = JSON.parse(content);
  const validation = ingestionRunResultSchema.safeParse(parsed);

  if (!validation.success) {
    throw new Error(`Invalid ingestion manifest: ${validation.error.message}`);
  }

  return validation.data;
}

async function main(): Promise<void> {
  const workspaceRoot = fileURLToPath(new URL("../../../../", import.meta.url));
  const defaultInputPath = path.join(workspaceRoot, "data", "processed", "ingestion-manifest.json");
  const defaultOutputPath = path.join(workspaceRoot, "data", "processed", "vector-index.json");

  const { inputPath: rawInputPath, outputPath: rawOutputPath } = parseIndexingCliArgs(process.argv.slice(2));
  const inputPath = rawInputPath ? resolveRelativePath(process.cwd(), rawInputPath) : defaultInputPath;
  const outputPath = rawOutputPath ? resolveRelativePath(process.cwd(), rawOutputPath) : defaultOutputPath;

  const ingestionManifest = await readIngestionManifest(inputPath);
  const vectorIndex = buildVectorIndex(ingestionManifest);

  await writeVectorIndex(outputPath, vectorIndex);
  console.log(`Wrote vector index to ${outputPath}`);
  console.log(`Indexed ${vectorIndex.entries.length} chunks from ${inputPath}`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
