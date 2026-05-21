import {pinoHttp} from "pino-http";
import {logger} from "../utils/logger.util";
import {Request, Response} from "express";

export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req: Request) => {
      const url = req.url || "";
      return url.includes("health") || url.includes("metrics") || url.includes("docs");
    },
  },
  serializers: {
    req: (req: Request) => ({
      method: req.method,
      path: req.url?.split("?")[0],
    }),
    res: (res: Response) => ({
      status: res.statusCode,
    }),
  },
});
