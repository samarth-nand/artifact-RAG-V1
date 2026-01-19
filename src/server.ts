import "dotenv/config";
import express from "express";
import type { Request, Response } from "express-serve-static-core";
import cors from "cors";
import path from "path";
import { getEnv } from "./shared/env";

import {
  postAttempts,
  postProcessAttempt,
  getAttemptHandler,
  postSessions,
  getSessionHandler,
  postSessionEnd,
  getSessionResultsHandler,
  postClarityGrade,
} from "./api/index";

import {
  APIGatewayEventRequestContextV2,
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

const app = express();
const port = Number(process.env.PORT || 3000);
const env = getEnv();

// CORS configuration for Next.js frontend
const corsOrigins = env.CORS_ORIGINS === "*" 
  ? "*" 
  : env.CORS_ORIGINS.split(",").map(o => o.trim());

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.raw({ type: "audio/*", limit: "50mb" }));

type LambdaHandler = (
  event: APIGatewayProxyEventV2
) => Promise<APIGatewayProxyResultV2 | string>;

const postAttemptsHandler = postAttempts as unknown as LambdaHandler;
const postProcessAttemptHandler = postProcessAttempt as unknown as LambdaHandler;
const getAttemptHandlerTyped = getAttemptHandler as unknown as LambdaHandler;
const postSessionsHandler = postSessions as unknown as LambdaHandler;
const getSessionHandlerTyped = getSessionHandler as unknown as LambdaHandler;
const postSessionEndHandler = postSessionEnd as unknown as LambdaHandler;
const getSessionResultsHandlerTyped = getSessionResultsHandler as unknown as LambdaHandler;
const postClarityGradeHandler = postClarityGrade as unknown as LambdaHandler;

function normalizeHeaders(headers: Request["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value)) out[key] = value.join(", ");
    else if (value == null) continue;
    else out[key] = String(value);
  }
  return out;
}

function expressToLambdaEvent(req: Request): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: `${req.method} ${req.path}`,
    requestContext: {
      accountId: "local",
      apiId: "local",
      domainName: req.hostname || "localhost",
      domainPrefix: req.hostname || "localhost",
      http: {
        method: req.method,
        path: req.path,
        protocol: req.protocol ? req.protocol.toUpperCase() + "/1.1" : "HTTP/1.1",
        sourceIp: req.ip || "127.0.0.1",
        userAgent: req.get("user-agent") || "express",
      },
      requestId: "local-request",
      routeKey: `${req.method} ${req.path}`,
      stage: "prod",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    } satisfies APIGatewayEventRequestContextV2,
    rawPath: req.path,
    rawQueryString: req.originalUrl.split("?")[1] || "",
    body: typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}),
    headers: normalizeHeaders(req.headers),
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

// API routes
app.post("/attempts", async (req: Request, res: Response) => {
  const event = expressToLambdaEvent(req);
  const result = await postAttemptsHandler(event);
  sendResult(res, result);
});

app.post("/attempts/:attemptId/process", async (req: Request, res: Response) => {
  const event = expressToLambdaEvent(req);
  event.pathParameters = { attemptId: req.params.attemptId };
  const result = await postProcessAttemptHandler(event);
  sendResult(res, result);
});

app.get("/attempts/:attemptId", async (req: Request, res: Response) => {
  const event = expressToLambdaEvent(req);
  event.pathParameters = { attemptId: req.params.attemptId };
  const result = await getAttemptHandlerTyped(event);
  sendResult(res, result);
});

// Realtime interview routes
app.post("/sessions", async (req: Request, res: Response) => {
  const event = expressToLambdaEvent(req);
  const result = await postSessionsHandler(event);
  sendResult(res, result);
});

app.get("/sessions/:sessionId", async (req: Request, res: Response) => {
  const event = expressToLambdaEvent(req);
  event.pathParameters = { sessionId: req.params.sessionId };
  const result = await getSessionHandlerTyped(event);
  sendResult(res, result);
});

app.post("/sessions/:sessionId/end", async (req: Request, res: Response) => {
  const event = expressToLambdaEvent(req);
  event.pathParameters = { sessionId: req.params.sessionId };
  const result = await postSessionEndHandler(event);
  sendResult(res, result);
});

app.get("/sessions/:sessionId/results", async (req: Request, res: Response) => {
  const event = expressToLambdaEvent(req);
  event.pathParameters = { sessionId: req.params.sessionId };
  const result = await getSessionResultsHandlerTyped(event);
  sendResult(res, result);
});

// Clarifying questions grading
app.post("/clarity/grade", async (req: Request, res: Response) => {
  const event = expressToLambdaEvent(req);
  const result = await postClarityGradeHandler(event);
  sendResult(res, result);
});

// Health check endpoint (always available)
app.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
});

// Static frontend (optional, for same-origin deployment)
if (env.SERVE_FRONTEND === "true") {
  const publicDir = path.resolve(process.cwd(), "public");
  app.use(express.static(publicDir));
  app.get("/", (_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
} else {
  // API-only mode: return JSON on root
  app.get("/", (_req: Request, res: Response) => {
    res.status(200).json({ 
      service: "artifact-grader-api", 
      version: "1.0.0",
      endpoints: [
        "POST /attempts",
        "POST /attempts/:id/process",
        "GET /attempts/:id",
        "POST /sessions",
        "GET /sessions/:id",
        "POST /sessions/:id/end",
        "GET /sessions/:id/results",
        "POST /clarity/grade",
        "GET /healthz"
      ]
    });
  });
}

app.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`Artifact Grader server listening on http://0.0.0.0:${port}`);
});
