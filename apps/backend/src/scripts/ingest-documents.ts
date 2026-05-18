import path from "node:path";
import { fileURLToPath } from "node:url";

import { ingestDirectory, writeIngestionManifest } from "../ingestion/ingestion.js";

type IngestionCliOptions = {
  sourceDir: string | undefined;
  outputPath: string | undefined;
  maxDocuments: number | undefined;
};

const DEFAULT_MAX_DOCUMENTS = 3000;

function parseIngestionCliArgs(argv: string[]): IngestionCliOptions {
  const positionalArgs = argv.filter((argument) => !argument.startsWith("-"));

  const sourceFlagIndex = argv.indexOf("--source");
  const outputFlagIndex = argv.indexOf("--output");
  const maxDocumentsFlagIndex = argv.indexOf("--max-documents");

  const sourceDir = sourceFlagIndex >= 0 ? argv[sourceFlagIndex + 1] : positionalArgs[0];
  const outputPath = outputFlagIndex >= 0 ? argv[outputFlagIndex + 1] : positionalArgs[1];
  const maxDocumentsValue = maxDocumentsFlagIndex >= 0 ? Number(argv[maxDocumentsFlagIndex + 1]) : Number.NaN;
  const envMaxDocumentsValue = Number(process.env.RAG_INGEST_MAX_DOCUMENTS);
  const maxDocuments = Number.isFinite(maxDocumentsValue) && maxDocumentsValue > 0
    ? Math.trunc(maxDocumentsValue)
    : Number.isFinite(envMaxDocumentsValue) && envMaxDocumentsValue > 0
      ? Math.trunc(envMaxDocumentsValue)
      : DEFAULT_MAX_DOCUMENTS;

  return { sourceDir, outputPath, maxDocuments };
}

function resolveRelativePath(baseDir: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(baseDir, inputPath);
}

async function main(): Promise<void> {
  const workspaceRoot = fileURLToPath(new URL("../../../../", import.meta.url));
  const defaultSourceDir = path.join(workspaceRoot, "data", "raw", "kaggle");
  const defaultOutputPath = path.join(workspaceRoot, "data", "processed", "ingestion-manifest.json");

  const { sourceDir: rawSourceDir, outputPath: rawOutputPath, maxDocuments } = parseIngestionCliArgs(process.argv.slice(2));
  const sourceDir = rawSourceDir ? resolveRelativePath(process.cwd(), rawSourceDir) : defaultSourceDir;
  const outputPath = rawOutputPath ? resolveRelativePath(process.cwd(), rawOutputPath) : undefined;

  const result = await ingestDirectory(sourceDir, maxDocuments);

  if (outputPath) {
    await writeIngestionManifest(outputPath, result);
    console.log(`Wrote ingestion manifest to ${outputPath}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
    console.log(`Default output path: ${defaultOutputPath}`);
  }

  console.log(`Ingested ${result.documents.length} documents into ${result.chunks.length} chunks from ${sourceDir}`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
