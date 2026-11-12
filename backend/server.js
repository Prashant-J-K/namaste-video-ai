
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:0.5b";

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "NamasteVideo AI Backend is running!"
    });
});

// General AI generation
app.post("/api/ai/generate", async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid prompt."
            });
        }

        const response = await fetch(
            "http://localhost:11434/api/generate",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: OLLAMA_MODEL,
                    prompt: prompt.trim(),
                    stream: false
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Ollama error: ${response.status}`);
        }

        const data = await response.json();

        res.json({
            success: true,
            result: data.response
        });

    } catch (error) {
        console.error(error.message);

        res.status(500).json({
            success: false,
            message: "AI generation failed."
        });
    }
});

// Generate video script and storyboard
app.post("/api/ai/generate-video", async (req, res) => {
    try {
        const { topic } = req.body;

        if (!topic || typeof topic !== "string" || !topic.trim()) {
            return res.status(400).json({
                success: false,
                message: "Please provide a video topic."
            });
        }

        const prompt = `
Create an educational video about: ${topic.trim()}.

Return only a valid JSON object.
Do not include markdown or explanations outside JSON.

Use exactly this structure:

{
  "title": "Video title",
  "description": "Short description",
  "targetAudience": "Beginner learners",
  "scenes": [
    {
      "sceneNumber": 1,
      "duration": 10,
      "heading": "Scene heading",
      "visualDescription": "What viewers should see",
      "narration": "What the narrator should say",
      "onScreenText": "Text displayed on screen"
    }
  ]
}

Requirements:
- Generate exactly 5 scenes.
- Use simple and accurate explanations.
- Give each scene narration.
- Give each scene visual instructions.
- Duration must be a number in seconds.
`;

        const response = await fetch(
            "http://localhost:11434/api/generate",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: OLLAMA_MODEL,
                    prompt,
                    format: "json",
                    stream: false
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Ollama error: ${response.status}`);
        }

        const data = await response.json();

        let videoPlan;

        try {
            videoPlan = JSON.parse(data.response);
        } catch {
            return res.status(502).json({
                success: false,
                message: "AI returned invalid JSON. Please try again.",
                rawResponse: data.response
            });
        }

        if (
            !videoPlan.title ||
            !Array.isArray(videoPlan.scenes) ||
            videoPlan.scenes.length !== 5
        ) {
            return res.status(502).json({
                success: false,
                message: "AI returned an incomplete video plan.",
                rawResponse: videoPlan
            });
        }

        res.json({
            success: true,
            videoPlan
        });

    } catch (error) {
        console.error("Video generation error:", error.message);

        res.status(500).json({
            success: false,
            message: "Video generation failed.",
            error: error.message
        });
    }
});

const PORT = 5000;

app.listen(PORT, () => {
    console.log(`NamasteVideo AI Backend running on port ${PORT}`);
});
