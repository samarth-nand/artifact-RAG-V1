import { getEnv } from "../shared/env";
import OpenAI from "openai";

let cachedClient: InstanceType<typeof OpenAI> | null = null;

export function getOpenAIClient() {
  if (!cachedClient) {
    const env = getEnv();
    cachedClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }
  return cachedClient;
}
