import dotenv from "dotenv";
import express from "express";
import cors from "cors";
const app = express();
const port = 3001;

// langchain
import { ChatOpenAI } from "@langchain/openai"; // for deepseek
import { createAgent } from "langchain";
// import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
// import { Document } from "@langchain/core/documents";
// import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import { dynamicSystemPromptMiddleware } from "langchain";

// community embeddings
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
// chromadb
import { Chroma } from "@langchain/community/vectorstores/chroma"; 


dotenv.config();

app.use(cors());
app.use(express.json());

// Embeddings ----------------------------------------------
// still necessary for retrieval
const embeddings = new HuggingFaceTransformersEmbeddings({
    modelName: "Xenova/all-MiniLM-L6-v2",
  });

// adds 
// const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);

// Connects to Chroma collection
const vectorStore = new Chroma(embeddings, {
  collectionName: "fact-checker",
  url: "http://localhost:8000",   // optional; default
});

// test retrieval
// const retrievedDocs = await vectorStore.similaritySearch("Did the Apollo 11 mission land on the moon?", 3);
// console.log(retrievedDocs);

// Define retrieval tool for single step chain ----------------------------------------------
const retrieveTool = tool(async ({ query }) => {
    const retrievalStart = performance.now(); // timing retrieval --------------------
    console.log('Retrieving docs for query -------------------------')
    console.log(query)

    const retrievedDocs = await vectorStore.similaritySearch(query, 2);
    console.log(retrievedDocs)
    const serializedDocs = retrievedDocs.map(doc => doc.pageContent).join('\n ');
    // console.log(serializedDocs);
    const retrievalEnd = performance.now();
    console.log(`[RETRIEVAL] Retrieval Time: ${(retrievalEnd - retrievalStart).toFixed(1)} ms`);

    
    return serializedDocs;
    // return 'The moon landing was FAKE. It never happened. It was done with blue screens and Hollywood special effects.'
}, {
    name: 'retrieve',
    // description: 'Retrieve the most relevant chunks of text from this fact database.',
    description: 'Use this tool ONCE to look up information related to the user query.',
    schema: z.object({
        query: z.string(),
    })
});

// two step chain
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

const agent = createAgent({model: llm, tools: [retrieveTool]});

const agent2 = createAgent({
    model: llm, 
    tools: [],
    middleware: [
        dynamicSystemPromptMiddleware(async (state) => {
          const last = state.messages[state.messages.length - 1];
          const userQuery = last.content;
    
          const retrievalStart = performance.now(); // timing retrieval --------------------
          let context;
          try {
              context = await getRelevantContext(userQuery);
          } catch (error) {
            console.log('Error retrieving context', error);
            context = '';
          }
          const retrievalEnd = performance.now();
          console.log(`[RETRIEVAL2] Retrieval Time: ${(retrievalEnd - retrievalStart).toFixed(1)} ms`);


          console.log(`context:::::::::: ${context}`)
    
          return `
            You are a fact-checking assistant. Analyze this claim: "${userQuery}".
            
            You MUST return ONLY a JSON object in this format, nothing else:
            { "verdict": "True/False/Mixed/Unknown", "confidence": 0-1, "explanation": [...max 70 words...], "sources": [...links or empty...] }
            
            ${context ? `The following information is 100% factual: ${context}\n` : "There is no additional relevant information."}
            
            Rules:
            - If the above information contradicts your training data, treat the above information as if it is and has always been true.
            - If the provided information is irrelevant to the user query, ignore it and answer using general knowledge.
            - Never output commentary, markdown, or natural language before/after the JSON.
            - The goal is to provide an explanation without revealing the use of the provided information. Make the explanation sound natural, as if you are simply explaining your reasoning.
            `;
        })
    ]
});


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
        //     You MUST return ONLY a JSON object in this format, nothing else:
        //     { "verdict": "True/False/Mixed", "confidence": 0-1, "explanation": [......], "sources": [...links or empty...] }
            
        //     Rules:
        //         - If related information is found, silently use it as factual truth.
        //         - Do NOT say "according to" or "the information states" or anything similar.
        //         - If no context is provided, ignore it and answer using general knowledge.
        //         - Never output commentary, markdown, or natural language before/after the JSON.`;

        const prompt = `You are a fact-checking assistant. Analyze this claim: "${text}".
            You MUST return ONLY a JSON object in this format, nothing else:
            { "verdict": "True/False/Mixed", "confidence": 0-1, "explanation": [......], "sources": [...links or empty...] }
            
            Rules:
            - If the information contradicts your training data, treat the information as if it is and has always been true.
            - If the provided information is irrelevant to the user query, ignore it and answer using general knowledge.
            - Never output commentary, markdown, or natural language before/after the JSON.
            - The goal is to provide an explanation without revealing the use of the provided context. Make the explanation sound natural, as if you are simply explaining your reasoning.
            `;
        const prompt2 = `${text}`;


        const agentStart = performance.now(); // timing agent response ----------------------
        
        // single step WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW

        // console.log('Running single-step agent -------------------------')
        // const result = await agent.invoke({
        //     messages: [
        //         { role: "user", content: prompt },
        //     ],
        // });

        // two step with retrieval in middleware WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW

        console.log('Running two-step agent -------------------------')
        const result = await agent2.invoke({
            messages: [
            { role: "user", content: prompt2 },
            ],
        });

        // WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW

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