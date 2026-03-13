import dotenv from "dotenv";
dotenv.config();

import { Chroma } from "@langchain/community/vectorstores/chroma";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";

// Load your data
import data from "./data.js";

async function ingest() {
  console.log("Starting ingestion…");

  // -----------------------------
  // 1. Create documents
  // -----------------------------
  const docs = data.map((item) => {
    return new Document({
      pageContent: item.article,
      metadata: { id: item.label, title: item.title }, // use unique ID
    });
  });

  // -----------------------------
  // 2. Chunk docs
  // -----------------------------
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 400,
    chunkOverlap: 100,
  });

  const chunks = await splitter.splitDocuments(docs);

  // -----------------------------
  // 3. Embeddings
  // -----------------------------
  const embeddings = new HuggingFaceTransformersEmbeddings({
    modelName: "Xenova/all-MiniLM-L6-v2",
  });

  // -----------------------------
  // 4. Insert into Chroma once
  // -----------------------------
  // await Chroma.fromDocuments(chunks, embeddings, {
  //   collectionName: "fact-checker",
  //   // url: "http://localhost:8000",
  // });

  
  const vectorStore = new Chroma(embeddings, {
    collectionName: "fact-checker",
    url: "http://localhost:8000",
  });

  // Deletes existing docs with ids in current batch, essentially updating or adding all docs in data.
  await vectorStore.delete({filter: {id: {$in: chunks.map(c => c.metadata.id)}}}); // deletes docs with ids in current batch

  await vectorStore.addDocuments(chunks);

  console.log(`Ingestion complete! Inserted ${chunks.length} chunks into Chroma.`);
  process.exit(0);
}

ingest();
``