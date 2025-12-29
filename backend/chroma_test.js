import { Chroma } from "@langchain/community/vectorstores/chroma";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";

// 1. Create the SAME embeddings you use in your backend
const embeddings = new HuggingFaceTransformersEmbeddings({
  modelName: "Xenova/all-MiniLM-L6-v2",
});

// 2. Connect to existing or new collection
const vectorStore = new Chroma(embeddings, {
  collectionName: "test-collection",
  url: "http://localhost:8000",
});

console.log("Connected to Chroma.");

// 3. Add a few docs to test persistence
// await vectorStore.addDocuments([
//   {
//     pageContent: "The Apollo 11 mission landed humans on the moon.",
//     metadata: { id: 1 },
//   },
//   {
//     pageContent: "Penguins cannot fly but are excellent swimmers.",
//     metadata: { id: 2 },
//   },
//   {
//     pageContent: "Deep learning models require large datasets to train.",
//     metadata: { id: 3 },
//   },
// ]);

// console.log("Added test documents.");

// 4. Test similarity search
const results = await vectorStore.similaritySearch(
  "Who landed on the moon?",
  2
);

console.log("\n=== SIMILARITY SEARCH RESULTS ===");
console.log(results);

console.log("\nChroma test complete.");
