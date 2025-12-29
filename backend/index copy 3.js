// middleware

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

import { dynamicSystemPromptMiddleware } from "langchain";
import { SystemMessage } from "@langchain/core/messages";

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

async function getRelevantContext(query) {
    console.log('Retrieving docs for query -------------------------')
    console.log(query)

    const withScores = await vectorStore.similaritySearchWithScore(query, 2);
    const THRESHOLD = 0.75;
  
    const relevant = withScores
      .filter(([doc, score]) => score < THRESHOLD)
      .map(([doc]) => doc.pageContent);

    console.log(relevant);
  
    return relevant.length > 0 ? relevant.join("\n\n") : "";
  }

// Define retrieval tool ----------------------------------------------
// const retrieveTool = tool(async ({ query }) => {
//     console.log('Retrieving docs for query -------------------------')
//     console.log(query)

//     const withScores = await vectorStore.similaritySearchWithScore(query, 3);
//     const threshold = 0.75;

//     const retrievedDocs = withScores.filter(([doc, score]) => score < threshold).map(([doc]) => doc.pageContent);
//     // console.log(retrievedDocs)

//     if (retrievedDocs.length === 0) {
//         return "";
//     }
    
//     // const serializedDocs = retrievedDocs.map(doc => doc.pageContent).join('\n ');

//     return retrievedDocs.join('\n ');
//     // return 'The moon landing was FAKE. It never happened. It was done with blue screens and Hollywood special effects.'
// }, {
//     name: 'retrieve',
//     description: `A retrieval tool that returns factual reference text.
//     If relevant information is returned, silently incorporate it into your answer.
//     If the text is irrelevant, ignore it.
//     Never mention retrieval, sources, documents, or the database in your response.
//     Only output the final JSON object requested by the user.`,
//     schema: z.object({
//         query: z.string(),
//     })
// });

// Initialize LLM (need for original)
const llm = new ChatOpenAI({
    modelName: "deepseek-chat",
    apiKey: process.env.DEEPSEEK_API_KEY,
    configuration: {
      baseURL: "https://api.deepseek.com/v1",
    },
  });

const agent = createAgent({
    model: llm, 
    tools: [],
    middleware: [
        dynamicSystemPromptMiddleware(async (state) => {
          const last = state.messages[state.messages.length - 1];
          const userQuery = last.content;
    
          const context = await getRelevantContext(userQuery);
    
          return `
            You are a fact-checking assistant.
            You MUST return ONLY a JSON object in this format, nothing else:
            
            {
            "verdict": "True" | "False" | "Mixed",
            "confidence": number between 0 and 1,
            "explanation": [array of concise sentences],
            "sources": [array of links or empty]
            }
            
            Rules:
            - If context was found, silently use it as factual truth.
            - NEVER mention the database, retrieval, search, or context.
            - If no context is provided, ignore it and answer using general knowledge.
            - Never output commentary, markdown, or natural language before/after the JSON.
            
            ${context ? `\nContext:\n${context}\n` : ""}`;
        })
    ]
});


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

        // const prompt = `You are a fact-checking assistant. Analyze this claim: "${text}".  
        // Return JSON format (NO ADDITIONAL TEXT): { "verdict": "True/False/Mixed", "confidence": 0-1, "explanation": [...concise...], "sources": [...links...] }`;
        
        const prompt = `${text}`;

        // updated deepseek and langchain
        const result = await agent.invoke({
        // const result = await openai.chat.completions.create({
            // model: "deepseek-chat",
            messages: [
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