/**
 * Simple development server without SST
 * Runs Lambda handlers locally for testing
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import * as fs from "fs";
import * as path from "path";
import { postAttempts, postProcessAttempt, getAttemptHandler } from "./dist/api/index.js";
import { saveAudioLocally } from "./dist/util/local-storage.js";

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.raw({ type: "audio/*", limit: "50mb" }));

// Convert Express request to Lambda event format
function expressToLambdaEvent(req, res) {
  return {
    requestContext: {
      http: {
        method: req.method,
        path: req.path,
      },
    },
    rawPath: req.path,
    body: JSON.stringify(req.body),
    headers: req.headers,
    pathParameters: req.params,
  };
}

// Routes
app.post("/attempts", async (req, res) => {
  try {
    const event = expressToLambdaEvent(req, res);
    const result = await postAttempts(event);
    res.status(result.statusCode).json(JSON.parse(result.body));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/attempts/:attemptId/process", async (req, res) => {
  try {
    const event = expressToLambdaEvent(req, res);
    event.pathParameters = { attemptId: req.params.attemptId };
    const result = await postProcessAttempt(event);
    res.status(result.statusCode).json(JSON.parse(result.body));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/attempts/:attemptId", async (req, res) => {
  try {
    const event = expressToLambdaEvent(req, res);
    event.pathParameters = { attemptId: req.params.attemptId };
    const result = await getAttemptHandler(event);
    res.status(result.statusCode).json(JSON.parse(result.body));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Handle audio uploads for local testing
app.put(/^\/audio\/(.+)$/, async (req, res) => {
  try {
    const audioKey = req.params[0];
    console.log("Audio upload received", { audioKey, bufferSize: req.body?.length });
    
    // req.body should be a Buffer from express.raw middleware
    let buffer = req.body;
    
    // If it's a string, convert to Buffer
    if (typeof buffer === 'string') {
      buffer = Buffer.from(buffer);
    }
    
    if (!buffer || buffer.length === 0) {
      throw new Error('No audio data received');
    }
    
    await saveAudioLocally(audioKey, buffer);
    console.log("Audio saved successfully", { audioKey });
    res.status(200).json({ success: true, key: audioKey });
  } catch (error) {
    console.error("Audio upload error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`
✨ Artifact Grader Dev Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  API:      http://localhost:${port}
  Frontend: http://localhost:8080
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ready for testing!
  `);
});
