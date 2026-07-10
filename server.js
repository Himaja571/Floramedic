import express from 'express';
import multer from 'multer';
import { WatsonXAI } from '@ibm-cloud/watsonx-ai';
import path from 'path';
import dotenv from 'dotenv';
import { IamAuthenticator } from 'ibm-cloud-sdk-core';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Setup static folder for frontend asset delivery
app.use(express.static('public'));
app.use(express.json());

// Set up Multer for handling file uploads memory-side
const upload = multer({ storage: multer.memoryStorage() });

// Initialize IBM watsonx.ai SDK


const watsonxAIService = WatsonXAI.newInstance({
    version: '2024-05-31',
    serviceUrl: process.env.WATSONX_AI_SERVICE_URL,
    authenticator: new IamAuthenticator({
        apikey: process.env.WATSONX_AI_APIKEY,
    }),
});

app.post('/api/analyze', upload.single('leafImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Please upload a plant leaf image.' });
        }

        // Convert raw image buffer to base64 string for watsonx
        const base64Image = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;

        const promptText = `
Return ONLY valid JSON.

Do not include markdown.
Do not include explanations.
Do not include code fences.
Do not include any text before or after the JSON.

Return exactly in this format:

{
  "plantType": "",
  "disease": "",
  "confidence": "",
  "treatment": [
    "",
    ""
  ]
}
`;

        // Request execution against a watsonx vision model
        const response = await watsonxAIService.textChat({
            modelId: 'meta-llama/llama-3-2-11b-vision-instruct',
            projectId: process.env.WATSONX_AI_PROJECT_ID,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`,
                            },
                        },
                        {
                            type: 'text',
                            text: promptText,
                        },
                    ],
                },
            ],
            maxTokens: 500,
        });

        const rawContent = response.result.choices[0].message?.content || '{}';
        console.log("RAW MODEL RESPONSE:");
        console.log(rawContent);


        
        // Strip down accidental markdown wraps if the model provides them
        const jsonString = rawContent.replace(/```json|```/g, '').trim();
        const parsedData = JSON.parse(jsonString);

        res.json(parsedData);

    } catch (error) {
        console.error('--- WATSONX DETAILED ERROR ---');
        console.error('Error Message:', error.message);
        if (error.body) {
            console.error('IBM Error Details:', error.body);
        } else {
            console.error('Full Error Object:', error);
        }
        console.error('-------------------------------');
        
        res.status(500).json({ error: `AI Analysis failed: ${error.message || error}` });
    }
});

app.listen(port, () => {
    console.log(`FloraMedic backend live at http://localhost:${port}`);
});