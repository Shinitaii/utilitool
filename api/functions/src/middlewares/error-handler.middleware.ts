import {Request, Response, NextFunction} from "express";
import {logger} from "../utils/logger.util";
import {AppError} from "../utils/error.util";

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (error instanceof AppError) {
    logger.warn({
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
      statusCode: error.statusCode,
    }, "Request error");

    res.status(error.statusCode).json({error: error.message});
    return;
  }

  logger.error({
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  }, "Request error");

  res.status(500).json({error: "Internal server error"});
};
