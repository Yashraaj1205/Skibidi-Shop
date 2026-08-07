import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, ZodType } from 'zod';

function fieldErrors(error: ZodError): Record<string, string> {
  const details: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!details[key]) details[key] = issue.message;
  }
  return details;
}

function validate(source: 'body' | 'params' | 'query', schema: ZodType): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      res.status(400).json({ error: 'Validation failed', details: fieldErrors(result.error) });
      return;
    }
    Object.defineProperty(req, source, { value: result.data, writable: true });
    next();
  };
}

export function validateBody(schema: ZodType): RequestHandler {
  return validate('body', schema);
}

export function validateParams(schema: ZodType): RequestHandler {
  return validate('params', schema);
}

export function validateQuery(schema: ZodType): RequestHandler {
  return validate('query', schema);
}
