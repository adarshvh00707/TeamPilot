import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { Logger } from 'pino';
import { InvalidTransitionError } from '@teampilot/shared';
import { AppError } from '../utils/errors';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found', requestId: req.id } });
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown;

    if (err instanceof AppError) {
      ({ status, code, message, details } = err);
    } else if (err instanceof ZodError) {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = 'Request validation failed';
      details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    } else if (err instanceof InvalidTransitionError) {
      status = 409;
      code = 'INVALID_STATE_TRANSITION';
      message = err.message;
    } else if (err?.type === 'entity.parse.failed') {
      status = 400;
      code = 'INVALID_JSON';
      message = 'Malformed JSON body';
    } else if (err?.type === 'entity.too.large') {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'Request body too large';
    } else if (typeof err?.code === 'string' && err.code === '23505') {
      status = 409;
      code = 'CONFLICT';
      message = 'A record with these values already exists';
    } else if (typeof err?.code === 'string' && (err.code === '23503' || err.code === '23514')) {
      status = 400;
      code = 'CONSTRAINT_VIOLATION';
      message = 'The request violates a data constraint';
    }

    if (status >= 500) logger.error({ err, requestId: req.id }, 'request failed');
    res.status(status).json({ error: { code, message, ...(details ? { details } : {}), requestId: req.id } });
  };
}
