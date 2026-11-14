
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const { analyzeTopic } = require("./services/topicAnalyzer");
const { planChapters } = require("./services/chapterPlanner");
const { planDuration } = require("./services/durationPlanner");
const { generateScript } = require("./services/scriptGenerator");
const { generateStoryboard } = require("./services/storyboardGenerator");

const {
    generateStoryboardImages,
    regenerateSceneImage
} = require("./services/image/imageGenerator");

const {
    getImageProviderStatus
} = require("./services/image/imageProvider");

const {
    generateStoryboardVoice
} = require("./services/voice/voiceGenerator");

const {
    getVoiceProviderStatus
} = require("./services/voice/voiceProvider");

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:1.5b";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Serve generated scene images.
app.use(
    "/generated/images",
    express.static(
        path.join(__dirname, "storage", "generated", "images"),
        {
            fallthrough: false,
            index: false
        }
    )
);

// Serve generated voice audio.
app.use(
    "/generated/audio",
    express.static(
        path.join(__dirname, "storage", "generated", "audio"),
        {
            fallthrough: false,
            index: false
        }
    )
);

// Health check
app.get("/", (req, res) => {
    return res.json({
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

        return res.json({
            success: true,
            result: data.response
        });

    } catch (error) {
        console.error("AI generation error:", error.message);

        return res.status(500).json({
            success: false,
            message: "AI generation failed."
        });
    }
});

// Generate video script and storyboard (legacy endpoint)
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

        return res.json({
            success: true,
            videoPlan
        });

    } catch (error) {
        console.error("Video generation error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Video generation failed.",
            error: error.message
        });
    }
});

// Analyze topic
app.post("/api/ai/analyze-topic", async (req, res) => {
    try {
        const {
            topic,
            depth = "deep",
            audience = "beginner",
            language = "English"
        } = req.body;

        if (!topic || typeof topic !== "string" || !topic.trim()) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid topic."
            });
        }

        const validDepths = ["quick", "deep", "masterclass"];

        if (!validDepths.includes(depth)) {
            return res.status(400).json({
                success: false,
                message: "Depth must be quick, deep, or masterclass."
            });
        }

        const analysis = await analyzeTopic({
            topic,
            depth,
            audience,
            language
        });

        return res.json({
            success: true,
            analysis
        });

    } catch (error) {
        console.error("Topic analysis error:", error.message);

        return res.status(502).json({
            success: false,
            message: "Topic analysis failed. Please try again."
        });
    }
});

// Create learning plan
app.post("/api/ai/create-learning-plan", async (req, res) => {
    try {
        const {
            topic,
            depth = "deep",
            audience = "beginner",
            language = "English"
        } = req.body;

        if (!topic || typeof topic !== "string" || !topic.trim()) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid topic."
            });
        }

        const validDepths = ["quick", "deep", "masterclass"];

        if (!validDepths.includes(depth)) {
            return res.status(400).json({
                success: false,
                message: "Depth must be quick, deep, or masterclass."
            });
        }

        const analysis = await analyzeTopic({
            topic,
            depth,
            audience,
            language
        });

        const chapterPlan = await planChapters({
            topic,
            analysis,
            depth,
            audience,
            language
        });

        return res.json({
            success: true,
            learningPlan: {
                analysis,
                chapterPlan
            }
        });

    } catch (error) {
        console.error("Learning plan error:", error.message);

        return res.status(502).json({
            success: false,
            message: "Learning plan generation failed. Please try again."
        });
    }
});

// Duration-aware learning plan
app.post("/api/ai/plan-duration", async (req, res) => {
    try {
        const {
            topic,
            durationSeconds,
            depth = "deep",
            audience = "beginner",
            language = "English"
        } = req.body;

        if (!topic || typeof topic !== "string" || !topic.trim()) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid topic."
            });
        }

        if (
            !Number.isInteger(durationSeconds) ||
            durationSeconds < 30 ||
            durationSeconds > 300
        ) {
            return res.status(400).json({
                success: false,
                message: "Duration must be between 30 and 300 seconds."
            });
        }

        const analysis = await analyzeTopic({
            topic,
            depth,
            audience,
            language
        });

        const learningPlan = await planDuration({
            topic,
            analysis,
            durationSeconds,
            depth,
            audience,
            language
        });

        return res.json({
            success: true,
            analysis,
            learningPlan
        });

    } catch (error) {
        console.error("Duration planning error:", error.message);

        return res.status(502).json({
            success: false,
            message: "Duration-aware learning plan generation failed. Please try again."
        });
    }
});

// Generate educational script
app.post("/api/ai/generate-script", async (req, res) => {
    try {
        const { learningPlan } = req.body;

        if (
            !learningPlan ||
            typeof learningPlan !== "object" ||
            Array.isArray(learningPlan)
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid learning plan."
            });
        }

        const script = await generateScript({
            learningPlan
        });

        return res.json({
            success: true,
            script
        });

    } catch (error) {
        console.error("Script generation error:", error.message);

        return res.status(502).json({
            success: false,
            message: "Educational script generation failed. Please try again."
        });
    }
});

// Generate storyboard, scene images and voice audio automatically.
app.post("/api/ai/generate-storyboard", async (req, res) => {
    try {
        const {
            script,
            platform = "youtube",
            visualStyle,
            voiceSettings = {},
            pronunciationDictionary = []
        } = req.body;

        if (
            !script ||
            typeof script !== "object" ||
            Array.isArray(script)
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid approved script."
            });
        }

        // Stage 1: Generate storyboard.
        const storyboard = generateStoryboard({ script });

        // Stage 2: Automatically request images for every scene.
        const imageGeneration = await generateStoryboardImages({
            storyboard,
            platform,
            ...(visualStyle ? { visualStyle } : {})
        });

        // Stage 3: Automatically request voice audio for every scene.
        const voiceGeneration = await generateStoryboardVoice({
            storyboard,
            voiceSettings,
            pronunciationDictionary
        });

        return res.json({
            success: true,
            storyboard,
            imageGeneration,
            voiceGeneration
        });

    } catch (error) {
        console.error(
            "Storyboard, image and voice generation error:",
            error.message
        );

        return res.status(400).json({
            success: false,
            message: error.message || "Storyboard generation failed."
        });
    }
});

// Check image provider configuration
app.get("/api/ai/image-provider-status", (req, res) => {
    return res.json({
        success: true,
        ...getImageProviderStatus()
    });
});

// Regenerate one scene image
app.post("/api/ai/regenerate-scene-image", async (req, res) => {
    try {
        const {
            storyboard,
            sceneNumber,
            platform = "youtube",
            visualStyle
        } = req.body;

        if (
            !storyboard ||
            typeof storyboard !== "object" ||
            Array.isArray(storyboard) ||
            !Number.isInteger(sceneNumber)
        ) {
            return res.status(400).json({
                success: false,
                message: "A valid storyboard and integer scene number are required."
            });
        }

        const image = await regenerateSceneImage({
            storyboard,
            sceneNumber,
            platform,
            ...(visualStyle ? { visualStyle } : {})
        });

        return res.json({
            success: true,
            image
        });

    } catch (error) {
        console.error("Scene image regeneration error:", error.message);

        return res.status(400).json({
            success: false,
            message: error.message || "Scene image regeneration failed."
        });
    }
});

// Check voice provider configuration
app.get("/api/ai/voice-provider-status", (req, res) => {
    return res.json({
        success: true,
        ...getVoiceProviderStatus()
    });
});

// Generate voice audio for an existing storyboard
app.post("/api/ai/generate-voice", async (req, res) => {
    try {
        const {
            storyboard,
            voiceSettings = {},
            pronunciationDictionary = []
        } = req.body;

        if (
            !storyboard ||
            typeof storyboard !== "object" ||
            Array.isArray(storyboard)
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid storyboard."
            });
        }

        const voiceGeneration = await generateStoryboardVoice({
            storyboard,
            voiceSettings,
            pronunciationDictionary
        });

        return res.json({
            success: true,
            voiceGeneration
        });

    } catch (error) {
        console.error("Voice generation error:", error.message);

        return res.status(400).json({
            success: false,
            message: error.message || "Voice generation failed."
        });
    }
});

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`NamasteVideo AI Backend running on port ${PORT}`);
});
