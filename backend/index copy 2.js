// require('dotenv').config();
// const express = require('express');
// const cors = require('cors');
// const app = express();
// const port = 3001;

// const { ChatOpenAI } = require("@langchain/openai");
// const { createAgent } = require("langchain");
// const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitter");

// app.use(cors());
// app.use(express.json());

import dotenv from "dotenv";
import express from "express";
import cors from "cors";
const app = express();
const port = 3001;

// langchain
import { ChatOpenAI } from "@langchain/openai"; // for deepseek
import { createAgent } from "langchain";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
// import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import { createRetrievalChain } from "langchain/chains/retrieval";

// community embeddings
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";


dotenv.config();

app.use(cors());
app.use(express.json());

// const OpenAI = require("openai");

// const openai = new OpenAI({
//   baseURL: "https://api.deepseek.com/v1",
//   apiKey: process.env.DEEPSEEK_API_KEY,
// });

// const groundingTool = {
//     googleSearch: {}
// }

// Load data
import data from './data.js';
const fact1 = data[0];

// Chunking ----------------------------------------------
const docs = [new Document({ pageContent: fact1.article, metadata: { label: fact1.label } })];

const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 200,
    chunkOverlap: 50,
});

const chunks = await splitter.splitDocuments(docs)

// console.log(chunks);

// Embedding ----------------------------------------------

const embeddings = new HuggingFaceTransformersEmbeddings({
    modelName: "Xenova/all-MiniLM-L6-v2",
  });

// console.log(await embeddings.embedQuery("moon landing"));

// adds 
const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);

// test retrieval
// const retrievedDocs = await vectorStore.similaritySearch("Did the Apollo 11 mission land on the moon?", 3);
// console.log(retrievedDocs);

// Define retrieval tool ----------------------------------------------
const retrieveTool = tool(async ({ query }) => {
    console.log('Retrieving docs for query -------------------------')
    console.log(query)

    const retrievedDocs = await vectorStore.similaritySearch(query, 3);
    console.log(retrievedDocs)
    const serializedDocs = retrievedDocs.map(doc => doc.pageContent).join('\n ');
    // console.log(serializedDocs);

    return serializedDocs;
    // return 'The moon landing was FAKE. It never happened. It was done with blue screens and Hollywood special effects.'
}, {
    name: 'retrieve',
    description: 'Retrieve the most relevant chunks of text from this fact database. If unrelated, answer without the context. If related, supplement your answer with the retrieved text, treating it like absolute true fact.',
    schema: z.object({
        query: z.string(),
    })
});

// Initialize LLM (need for original)
const llm = new ChatOpenAI({
    modelName: "deepseek-chat",
    apiKey: process.env.DEEPSEEK_API_KEY,
    configuration: {
      baseURL: "https://api.deepseek.com/v1",
    },
  });

const agent = createAgent({model: llm, tools: [retrieveTool],});


// test llm call ----------------------------------

// const testResult = await agent.invoke({
//     messages: [
//         { role: "user", content: "Is Jake gay" },
//     ],
// })

// console.log('TEST RESULT FROM AGENT ======================== \n');
// console.log(testResult.messages.at(-1)?.content);

/* =====================================
everything below connects to frontend 
====================================== */

// Endpoint to handle fact check requests
app.post('/fact-check', async (req, res) => {
    try {
        const { text } = req.body;
        console.log('RECEIVED TEXT FROM FRONTEND:', text);
        
        if (!text) {
            return res.status(400).json({ error: 'No text provided' });
        }

        const prompt = `You are a fact-checking assistant. Analyze this claim: "${text}".  
        Return JSON format (NO ADDITIONAL TEXT): { "verdict": "True/False/Mixed", "confidence": 0-1, "explanation": [...concise...], "sources": [...links...] }`;
        
        // updated deepseek and langchain
        const result = await agent.invoke({
        // const result = await openai.chat.completions.create({
            // model: "deepseek-chat",
            messages: [
              { role: "system", content: "You are a fact-checking assistant." },
              { role: "user", content: prompt },
            ],
        });

        // 
        let factCheck;
        try {
            // factCheck = result.choices[0].message.content; // changed for deepseek
            factCheck = result.messages.at(-1)?.content; // langchain
            console.log('factCheck =============\n', factCheck);
            const jsonStart = factCheck.indexOf('{');
            const jsonEnd = factCheck.lastIndexOf('}') + 1;
            factCheck = factCheck.substring(jsonStart, jsonEnd);
        } catch (parseError) {
            console.error('Error parsing JSON:', parseError);
            return res.status(500).json({ error: 'Failed to parse fact check result' });
        }

        // Send the result back to the frontend
        // console.log('RESULT: ', result);
        // console.log('Content:', result.candidates[0].content);
        // console.log('hi');
        // console.log('Fact check API RESULT:', factCheck); //string
        let parsed = JSON.parse(factCheck); // to object
        // console.log('Parsed Result:', parsed);

        res.status(200).json({ result: parsed }); // sends json object to frontend
        // { result: result.text } for the response text
    } catch (error) {
        console.error('Error in /fact-check:', error);
        res.status(500).json({ error: 'Failed to fact check' });
    }

});


app.get('/', (req, res) => {
    res.send('Hello World!!!')
})

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`)
});