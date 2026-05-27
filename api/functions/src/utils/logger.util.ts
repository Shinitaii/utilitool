import pino from "pino";
import path from "path";
import fs from "fs";

const isTest = process.env.APP_ENV === "test" || process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined;

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), "logs");
if (!isTest && !fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const transport = isTest ? undefined : {
  targets: [
    {
      // Console output (pretty-printed)
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname,req,res,reqId,responseTime",
        singleLine: false,
        levelFirst: true,
      },
    },
    {
      // File output (JSON, verbose)
      target: "pino/file",
      options: {
        destination: path.join(logsDir, "app.log"),
      },
    },
  ],
};

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  ...(transport && { transport }),
});
