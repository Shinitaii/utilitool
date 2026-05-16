import { pinoHttp } from 'pino-http';
import { logger } from '../utils/logger.util';
import { Request, Response } from 'express';

export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req: Request) => {
      const url = req.url || '';
      return url.includes('health') || url.includes('metrics');
    },
  },
  serializers: {
    req: (req: Request) => ({
      method: req.method,
      url: req.url,
      query: req.query,
      params: req.params,
      body: process.env.NODE_ENV !== 'production' ? req.body : undefined,
    }),
    res: (res: Response ) => ({
      statusCode: res.statusCode,
    }),
  },
});