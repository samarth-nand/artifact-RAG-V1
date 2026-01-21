/**
 * Simple development server without SST
 * Runs Lambda handlers locally for testing
 */

import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import {
  APIGatewayEventRequestContextV2,
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import * as fs from "fs";
import * as path from "path";
import { postAttempts, postProcessAttempt, getAttemptHandler, postSessions, getSessionHandler, postSessionEnd, getSessionResultsHandler } from "./dist/api/index.js";
import { saveAudioLocally } from "./dist/util/local-storage.js";

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.raw({ type: "audio/*", limit: "50mb" }));

// Convert Express request to Lambda event format
type LambdaHandler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2 | string>;

const postAttemptsHandler = postAttempts as unknown as LambdaHandler;
const postProcessAttemptHandler = postProcessAttempt as unknown as LambdaHandler;
const getAttemptHandlerTyped = getAttemptHandler as unknown as LambdaHandler;
const postSessionsHandler = postSessions as unknown as LambdaHandler;
const getSessionHandlerTyped = getSessionHandler as unknown as LambdaHandler;
const postSessionEndHandler = postSessionEnd as unknown as LambdaHandler;
const getSessionResultsHandlerTyped = getSessionResultsHandler as unknown as LambdaHandler;

function expressToLambdaEvent(req: Request): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: `${req.method} ${req.route?.path ?? req.path}`,
    requestContext: {
      accountId: "local",
      apiId: "local",
      domainName: "localhost",
      domainPrefix: "localhost",
      http: {
        method: req.method,
        path: req.path,
        protocol: req.protocol || "HTTP/1.1",
        sourceIp: req.ip || "127.0.0.1",
        userAgent: req.get("user-agent") || "express",
      },
      requestId: "local-request",
      routeKey: `${req.method} ${req.route?.path ?? req.path}`,
      stage: "dev",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    } satisfies APIGatewayEventRequestContextV2,
    rawPath: req.path,
    rawQueryString: req.originalUrl.split("?")[1] || "",
    body: typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}),
    headers: req.headers as Record<string, string>,
    pathParameters: req.params,
    isBase64Encoded: false,
  };
}

function sendResult(res: Response, result: APIGatewayProxyResultV2 | string) {
  if (typeof result === "string") {
    res.status(200).send(result);
    return;
  }

  const structured = result as APIGatewayProxyStructuredResultV2;
  const status = structured.statusCode ?? 200;
  const headers = structured.headers;
  if (headers) {
    res.set(headers as Record<string, string>);
  }

  const rawBody = structured.body;
  try {
    if (typeof rawBody === "string") {
      res.status(status).json(JSON.parse(rawBody));
      return;
    }
  } catch {
    res.status(status).send(rawBody);
    return;
  }

  res.status(status).json(rawBody ?? {});
}

// Routes
app.post("/attempts", async (req: Request, res: Response) => {
  try {
    const event = expressToLambdaEvent(req);
    const result = await postAttemptsHandler(event);
    sendResult(res, result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/attempts/:attemptId/process", async (req: Request, res: Response) => {
  try {
    const event = expressToLambdaEvent(req);
    event.pathParameters = { attemptId: req.params.attemptId };
    const result = await postProcessAttemptHandler(event);
    sendResult(res, result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/attempts/:attemptId", async (req: Request, res: Response) => {
  try {
    const event = expressToLambdaEvent(req);
    event.pathParameters = { attemptId: req.params.attemptId };
    const result = await getAttemptHandlerTyped(event);
    sendResult(res, result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// ===== REALTIME INTERVIEW ROUTES =====

app.post("/sessions", async (req: Request, res: Response) => {
  try {
    const event = expressToLambdaEvent(req);
    const result = await postSessionsHandler(event);
    sendResult(res, result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/sessions/:sessionId", async (req: Request, res: Response) => {
  try {
    const event = expressToLambdaEvent(req);
    event.pathParameters = { sessionId: req.params.sessionId };
    const result = await getSessionHandlerTyped(event);
    sendResult(res, result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/sessions/:sessionId/end", async (req: Request, res: Response) => {
  try {
    const event = expressToLambdaEvent(req);
    event.pathParameters = { sessionId: req.params.sessionId };
    const result = await postSessionEndHandler(event);
    sendResult(res, result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/sessions/:sessionId/results", async (req: Request, res: Response) => {
  try {
    const event = expressToLambdaEvent(req);
    event.pathParameters = { sessionId: req.params.sessionId };
    const result = await getSessionResultsHandlerTyped(event);
    sendResult(res, result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Handle audio uploads for local testing
app.put(/^\/audio\/(.+)$/, async (req: Request, res: Response) => {
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
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
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
