import {z} from 'zod'
import {Request, Response, NextFunction} from 'express'
import { handleValidationError } from '../utils/error.util';

export const validateDTO = <T>(schema: z.ZodSchema<T>) => 
	(req: Request, res: Response, next: NextFunction) => {
		try {
			const validated = schema.parse(req.body);
			req.body = validated;
			next();
		} catch (error) {
  		const { status, body } = handleValidationError(error);
  		res.status(status).json(body);
		}
	};