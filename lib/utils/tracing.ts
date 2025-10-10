import { langfuse } from "../clients/langfuse";
import { Request, Response, NextFunction } from "express";

/**
 * Standard trace header names for distributed tracing
 * Following OpenTelemetry and W3C Trace Context standards
 */
export const TRACE_HEADERS = {
  TRACE_ID: "x-trace-id",
  SPAN_ID: "x-span-id",
  PARENT_TRACE_ID: "x-parent-trace-id",
  // Alternative headers for compatibility
  B3_TRACE_ID: "x-b3-traceid",
  B3_SPAN_ID: "x-b3-spanid",
  B3_PARENT_SPAN_ID: "x-b3-parentspanid",
  // OpenTelemetry headers
  OTEL_TRACE_ID: "traceparent",
} as const;

/**
 * Extract trace ID from request headers
 * Supports multiple trace header formats for compatibility
 */
export function extractTraceId(req: Request): string | null {
  // Try different trace header formats in order of preference
  const traceId =
    req.header(TRACE_HEADERS.TRACE_ID) ||
    req.header(TRACE_HEADERS.B3_TRACE_ID) ||
    req.header(TRACE_HEADERS.OTEL_TRACE_ID) ||
    null;

  return traceId;
}

/**
 * Extract span ID from request headers
 */
export function extractSpanId(req: Request): string | null {
  return (
    req.header(TRACE_HEADERS.SPAN_ID) ||
    req.header(TRACE_HEADERS.B3_SPAN_ID) ||
    null
  );
}

/**
 * Extract parent trace ID from request headers
 */
export function extractParentTraceId(req: Request): string | null {
  return (
    req.header(TRACE_HEADERS.PARENT_TRACE_ID) ||
    req.header(TRACE_HEADERS.B3_PARENT_SPAN_ID) ||
    null
  );
}

/**
 * Create a new trace if none exists, or use existing trace ID
 */
export function getOrCreateTraceId(req: Request): string {
  const existingTraceId = extractTraceId(req);
  if (existingTraceId) {
    return existingTraceId;
  }

  // Generate a new trace ID (UUID v4 format)
  return generateTraceId();
}

/**
 * Generate a new trace ID
 * Using UUID v4 format for compatibility with most tracing systems
 */
export function generateTraceId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create a Langfuse trace with proper context
 */
export function createLangfuseTrace(
  name: string,
  traceId: string,
  input?: any,
  metadata?: any
) {
  return langfuse.trace({
    name,
    id: traceId,
    input,
    metadata,
  });
}

/**
 * Create a Langfuse span within an existing trace
 */
export function createLangfuseSpan(
  name: string,
  traceId: string,
  input?: any,
  metadata?: any
) {
  return langfuse.span({
    name,
    traceId,
    input,
    metadata,
  });
}

/**
 * Create a Langfuse generation within an existing trace
 */
export function createLangfuseGeneration(
  name: string,
  traceId: string,
  input?: any,
  metadata?: any
) {
  return langfuse.generation({
    name,
    traceId,
    input,
    metadata,
  });
}

/**
 * Express middleware to extract and set trace context
 */
export function traceMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const traceId = getOrCreateTraceId(req);
  const spanId = extractSpanId(req);
  const parentTraceId = extractParentTraceId(req);

  // Attach trace context to request for use in handlers
  (req as any).traceContext = {
    traceId,
    spanId,
    parentTraceId,
  };

  // Set response headers for trace propagation
  res.setHeader(TRACE_HEADERS.TRACE_ID, traceId);
  if (spanId) {
    res.setHeader(TRACE_HEADERS.SPAN_ID, spanId);
  }

  next();
}

/**
 * Get trace context from request
 */
export function getTraceContext(req: Request) {
  return (
    (req as any).traceContext || {
      traceId: generateTraceId(),
      spanId: null,
      parentTraceId: null,
    }
  );
}
