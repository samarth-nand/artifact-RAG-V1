import { getEnv } from "../shared/env";

const openai = require("openai");

let cachedClient: InstanceType<typeof openai.OpenAI> | null = null;

export function getOpenAIClient() {
  if (!cachedClient) {
    const env = getEnv();
    cachedClient = new openai.OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }
  return cachedClient;
}
