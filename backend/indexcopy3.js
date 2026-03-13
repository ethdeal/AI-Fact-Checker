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
// import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import { dynamicSystemPromptMiddleware } from "langchain";
import { SystemMessage } from "@langchain/core/messages";

// community embeddings
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { Chroma } from "@langchain/community/vectorstores/chroma"; 



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
// import data from './data.js';
// const fact1 = data[0];

// Chunking ----------------------------------------------
// const docs = [new Document({ pageContent: fact1.article, metadata: { label: fact1.label } })];

// const splitter = new RecursiveCharacterTextSplitter({
//     chunkSize: 200,
//     chunkOverlap: 50,
// });

// const chunks = await splitter.splitDocuments(docs)

// console.log(chunks);

// Embedding ----------------------------------------------

const embeddings = new HuggingFaceTransformersEmbeddings({
    modelName: "Xenova/all-MiniLM-L6-v2",
  });

// console.log(await embeddings.embedQuery("moon landing"));

// adds 
// const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);

// testing
const vectorStore = new Chroma(embeddings, {
  collectionName: "fact-checker",
  url: "http://localhost:8000",   // optional; default
});

// test retrieval
// const retrievedDocs = await vectorStore.similaritySearch("Did the Apollo 11 mission land on the moon?", 3);
// console.log(retrievedDocs);

async function getRelevantContext(query) {
    console.log('Retrieving docs for query -------------------------')
    console.log(query)

    // const withScores = await vectorStore.similaritySearchWithScore(query, 2);
    // const THRESHOLD = 1;
    // console.log(withScores);
  
    // const relevant = withScores
    //   .filter(([doc, score]) => score < THRESHOLD)
    //   .map(([doc]) => doc.pageContent);

    // console.log(relevant);
  
    // return relevant.length > 0 ? relevant.join("\n\n") : ""; // with scores

    const retrievedDocs = await vectorStore.similaritySearch(query, 2); // without scores
    // console.log(retrievedDocs)
    const serializedDocs = retrievedDocs.map(doc => doc.pageContent).join('\n ');
    return serializedDocs;
  }

// Initialize LLM (need for original)
const llm = new ChatOpenAI({
    modelName: "deepseek-chat",
    apiKey: process.env.DEEPSEEK_API_KEY,
    configuration: {
      baseURL: "https://api.deepseek.com/v1",
    },
    temperature: 0,
  });

const agent = createAgent({
    model: llm, 
    tools: [],
    middleware: [
        dynamicSystemPromptMiddleware(async (state) => {
          const last = state.messages[state.messages.length - 1];
          const userQuery = last.content;
    
          const retrievalStart = performance.now(); // timing retrieval --------------------
          const context = await getRelevantContext(userQuery);
          const retrievalEnd = performance.now();
          console.log(`[RETRIEVAL] Retrieval Time: ${(retrievalEnd - retrievalStart).toFixed(1)} ms`);


          console.log(`context:::::::::: ${context}`)
    
          return `
            You are a fact-checking assistant. Analyze this claim: "${userQuery}".
            
            You MUST return ONLY a JSON object in this format, nothing else:
            { "verdict": "True/False/Mixed", "confidence": 0-1, "explanation": [......], "sources": [...links or empty...] }
            
            
            The following information is 100% true:
            ${context ? `${context}\n` : ""}
            
            Rules:
            - If the above information contradicts your training data, treat the above information as if it is and has always been true.
            - If the provided information is irrelevant to the user query, ignore it and answer using general knowledge.
            - Never output commentary, markdown, or natural language before/after the JSON.
            - IMPORTANT: The goal is to provide an explanation without revealing the use of the provided context. Make the explanation sound natural, as if you are simply explaining your reasoning process.
            
            `;
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
        const bStartTime = performance.now(); // timing entire endpoint ----------------------      
        const { text } = req.body;
        console.log('RECEIVED TEXT FROM FRONTEND:', text);
        
        if (!text) {
            return res.status(400).json({ error: 'No text provided' });
        }

        // const prompt = `You are a fact-checking assistant. Analyze this claim: "${text}".  
        // Return JSON format (NO ADDITIONAL TEXT): { "verdict": "True/False/Mixed", "confidence": 0-1, "explanation": [...concise...], "sources": [...links...] }`;
        
        const prompt = `${text}`;

        const agentStart = performance.now(); // timing agent response ----------------------
        // updated deepseek and langchain
        const result = await agent.invoke({
            messages: [
              { role: "user", content: prompt },
            ],
        });
        const agentEnd = performance.now();
        

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
        parsed.claim = text; // add claim to object for frontend display
        // console.log('Parsed Result:', parsed);

        const bEndTime = performance.now(); // timing entire endpoint end ----------------------
        console.log(`[AGENT] Agent Response Time: ${(agentEnd - agentStart).toFixed(1)} ms`);
        console.log(`[END-TO-END] Endpoint Received → Response Sent: ${(bEndTime - bStartTime).toFixed(1)} ms`);
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