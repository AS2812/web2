import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { BadRequestError } from '../utils/errors';

/**
 * Validates request payload using a Zod schema.
 * @param schema Zod schema to validate against.
 * @returns Express middleware performing validation.
 * @throws {BadRequestError} When validation fails.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query
    });

    if (!result.success) {
      const message = result.error.issues.map((issue) => issue.message).join('; ');
      throw new BadRequestError(message);
    }

    Object.assign(req, result.data);
    next();
  };
}
