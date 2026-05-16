import pino from "pino";

const isTest = process.env.APP_ENV === "test" || process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined;

const transport = isTest ? undefined : {
  target: "pino-pretty",
  options: {
    colorize: true,
    translateTime: "SYS:standard",
    ignore: "pid,hostname",
  },
};

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  ...(transport && { transport }),
});
