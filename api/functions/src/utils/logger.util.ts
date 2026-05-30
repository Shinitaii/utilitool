import pino from "pino";

// Pretty-printed logs are ONLY for local development. `pino-pretty` is a devDependency,
// so it is NOT installed in the deployed runtime (Cloud Run installs `dependencies` only).
// Referencing it as a transport there throws "unable to determine transport target for
// pino-pretty" at startup and crashes the container before it can listen on PORT.
// In production (and tests) we log plain JSON — which is also what Cloud Logging expects.
const usePrettyTransport = process.env.NODE_ENV === "development";

const transport = usePrettyTransport ? {
  targets: [
    {
      // Console output (pretty-printed) — local dev only
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname,req,res,reqId,responseTime",
        singleLine: false,
        levelFirst: true,
      },
    },
  ],
} : undefined;

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  ...(transport && {transport}),
});
