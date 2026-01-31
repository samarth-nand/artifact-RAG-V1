import { logger } from "../shared/logger";
import { corsHeaders } from "./cors";

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ALREADY_USED"
  | "EXPIRED"
  | "RATE_LIMITED"
  | "OPENAI_ERROR"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ALREADY_USED: 409,
  EXPIRED: 410,
  RATE_LIMITED: 429,
  OPENAI_ERROR: 500,
  VALIDATION_ERROR: 400,
  INTERNAL_ERROR: 500,
};

export function createErrorResponse(
  statusCode: number,
  code: ErrorCode,
  message: string,
  details?: any
) {
  const response = {
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };

  logger.warn("Error response", { statusCode, code, message, details });

  return {
    statusCode,
    body: JSON.stringify(response),
    headers: corsHeaders,
  };
}

export function getStatusForErrorCode(code: ErrorCode): number {
  return ERROR_STATUS_MAP[code] || 500;
}
