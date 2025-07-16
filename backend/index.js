require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const port = 3001;


const { GoogleGenAI } = require('@google/genai');

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

// Endpoint to handle fact check requests
app.post('/fact-check', async (req, res) => {
    try {
        const { text } = req.body;
        console.log('RECEIVED TEXT FROM FRONTEND:', text);
        
        if (!text) {
            return res.status(400).json({ error: 'No text provided' });
        }

        const prompt = `You are a fact-checking assistant. Analyze this claim: "${text}".  
        Return JSON format: { "verdict": "True/False/Mixed", "confidence": 0-1, "explanation": [...], "sources": [...] }`;
        
        const result = await genAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                maxOutputTokens: 2000,
                thinkingBudget: 0,
            }
        });

        try {
            factCheck = result.text;
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
        console.log('Fact check API RESULT:', factCheck); //string
        parsed = JSON.parse(factCheck); // to object
        console.log('Parsed Result:', parsed);

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