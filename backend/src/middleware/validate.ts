import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

// Parse failures throw ZodError, which errorMiddleware maps to 400 VALIDATION_ERROR

export function validateParams(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.params = schema.parse(req.params) as typeof req.params;
    next();
  };
}
