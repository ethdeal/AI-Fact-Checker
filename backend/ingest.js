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

  const fact1 = data[0];

  // -----------------------------
  // 1. Create documents
  // -----------------------------
  const docs = [
    new Document({
      pageContent: fact1.article,
      metadata: { id: fact1.label }, // use unique ID
    }),
  ];

  // -----------------------------
  // 2. Chunk docs
  // -----------------------------
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 200,
    chunkOverlap: 50,
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
  await Chroma.fromDocuments(chunks, embeddings, {
    collectionName: "fact-checker",
    // url: "http://localhost:8000",
  });

  console.log("Ingestion complete!");
  process.exit(0);
}

ingest();
``