import { APIGatewayProxyEventV2 } from "aws-lambda";
import { logger } from "../shared/logger";

export interface AuthContext {
  userId: string;
  email?: string;
}

/**
 * Extract and validate user authentication from event.
 * 
 * For now, this is a simple header-based auth.
 * Replace with JWT validation, OAuth, or your actual auth system.
 * 
 * Expected header: x-user-id
 */
export function authenticateUser(event: APIGatewayProxyEventV2): AuthContext {
  const userId = event.headers["x-user-id"] || event.headers["X-User-Id"];
  
  if (!userId) {
    logger.warn("Authentication failed: missing x-user-id header");
    throw new AuthenticationError("Missing authentication credentials");
  }

  // Basic validation
  if (userId.length < 3 || userId.length > 100) {
    logger.warn("Authentication failed: invalid user ID format", { userId });
    throw new AuthenticationError("Invalid user ID format");
  }

  logger.debug("User authenticated", { userId });
  return { userId };
}

/**
 * Validate that the requesting user owns the resource.
 */
export function authorizeUser(authContext: AuthContext, resourceUserId: string): void {
  if (authContext.userId !== resourceUserId) {
    logger.warn("Authorization failed: user mismatch", {
      requestingUser: authContext.userId,
      resourceOwner: resourceUserId,
    });
    throw new AuthorizationError("You do not have permission to access this resource");
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}
