import rateLimit from "express-rate-limit";
import { Request, Response } from "express";
import { config } from "../config";

/**
 * Get the client IP address from the request.
 * Handles proxies and load balancers by checking common headers.
 */
function getClientIp(req: Request): string {
  // Check for forwarded IP (from proxies/load balancers)
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(",")[0].trim();
  }

  // Check for real IP header
  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  // Fallback to connection remote address
  return req.socket.remoteAddress || req.ip || "unknown";
}

/**
 * Create a rate limiter middleware with IP-based tracking.
 * Uses express-rate-limit with a custom key generator based on IP address.
 */
export function createRateLimiter(options?: {
  windowMs?: number;
  max?: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}) {
  const {
    windowMs = config.RATE_LIMIT_WINDOW_MS,
    max = config.RATE_LIMIT_MAX_REQUESTS,
    message = "Too many requests from this IP, please try again later.",
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options || {};

  return rateLimit({
    windowMs,
    max,
    message,
    skipSuccessfulRequests,
    skipFailedRequests,
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    // Custom key generator based on IP address
    keyGenerator: (req: Request): string => {
      return getClientIp(req);
    },
    // Custom handler for rate limit exceeded
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        success: false,
        error: message,
        retryAfter: Math.ceil(windowMs / 1000), // seconds
      });
    },
    // Skip rate limiting for allowed IPs
    skip: (req: Request): boolean => {
      const clientIp = getClientIp(req);
      return (
        config.ALLOWED_IPS.length > 0 && config.ALLOWED_IPS.includes(clientIp)
      );
    },
  });
}

/**
 * Default rate limiter for general API endpoints.
 * Limits requests per IP address.
 */
export const defaultRateLimiter = createRateLimiter();

/**
 * Strict rate limiter for sensitive endpoints (e.g., document analysis).
 * More restrictive limits for resource-intensive operations.
 */
export const strictRateLimiter = createRateLimiter({
  windowMs: config.RATE_LIMIT_STRICT_WINDOW_MS,
  max: config.RATE_LIMIT_STRICT_MAX_REQUESTS,
  message:
    "Too many requests from this IP. Please wait before submitting another document.",
});
