/**
 * CORS utility for API responses
 */

export const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function createResponse(statusCode: number, body: any) {
  return {
    statusCode,
    body: JSON.stringify(body),
    headers: corsHeaders,
  };
}

export function createErrorResponse(statusCode: number, message: string) {
  return {
    statusCode,
    body: JSON.stringify({ error: message }),
    headers: corsHeaders,
  };
}

export const handleCors: any = async () => {
  return {
    statusCode: 200,
    body: "",
    headers: corsHeaders,
  };
};
