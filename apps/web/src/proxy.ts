import { NextRequest, NextResponse } from 'next/server';
import { proxy as rateLimitProxy } from './rate-limit';

const CORRELATION_ID_HEADER = 'x-correlation-id';
const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Next.js 16 proxy entry (successor to middleware.ts). Applies API rate
 * limiting via `proxy` from ./rate-limit and stamps every API response with a
 * correlation ID and request ID so requests can be traced end to end.
 */
export function proxy(request: NextRequest): NextResponse {
  // Stamp a request ID (formerly done by middleware.ts) so downstream route
  // handlers and the structured logger can correlate logs.
  let requestId = request.headers.get(REQUEST_ID_HEADER);
  if (!requestId) {
    requestId = crypto.randomUUID();
  }
  request.headers.set(REQUEST_ID_HEADER, requestId);

  const correlationId = request.headers.get(CORRELATION_ID_HEADER) || generateCorrelationId();
  request.headers.set(CORRELATION_ID_HEADER, correlationId);

  const response = rateLimitProxy(request);

  response.headers.set(CORRELATION_ID_HEADER, correlationId);
  response.headers.set('X-Correlation-ID', correlationId);
  response.headers.set(REQUEST_ID_HEADER, requestId);

  // Forward the mutated request headers downstream for pass-through responses.
  if (response.status === 200) {
    const passThrough = NextResponse.next({
      request: { headers: request.headers },
    });
    for (const [key, value] of response.headers.entries()) {
      passThrough.headers.set(key, value);
    }
    return passThrough;
  }

  return response;
}

export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}-${Math.random().toString(36).substring(2, 11)}`;
}

export const config = {
  matcher: ['/api/:path*'],
};

