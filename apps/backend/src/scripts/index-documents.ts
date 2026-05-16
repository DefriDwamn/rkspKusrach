import { runIndexing } from "./index-documents-lib.js";

void runIndexing(process.argv.slice(2))
  .then(({ inputPath, outputPath, indexedChunks }) => {
    console.log(`Wrote vector index to ${outputPath}`);
    console.log(`Indexed ${indexedChunks} chunks from ${inputPath}`);
  })
  .catch((error: unknown) => {
  console.error(error);
  process.exit(1);
  });
