import { Chroma } from "@langchain/community/vectorstores/chroma";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";

const embeddings = new HuggingFaceTransformersEmbeddings({
    modelName: "Xenova/all-MiniLM-L6-v2",
  });

const vectorStore = new Chroma(embeddings, {
  collectionName: "fact-checker",
  url: "http://localhost:8000",
});

const results = await vectorStore.similaritySearch("sexuality", 5);
console.log (results);

