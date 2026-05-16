import {Request, Response, NextFunction} from "express";
import {ZodTypeAny} from "zod";

type ValidateSchema = {
  body?: ZodTypeAny | undefined;
  params?: ZodTypeAny | undefined;
  query?: ZodTypeAny | undefined;
};

export const validateRequest = (schema: ValidateSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      if (schema.params) {
        const parsed = await schema.params.parseAsync(req.params);
        Object.assign(req.params, parsed);
      }
      if (schema.query) {
        const parsed = await schema.query.parseAsync(req.query);
        Object.assign(req.query, parsed);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};
