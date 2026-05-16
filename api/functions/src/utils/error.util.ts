import {z} from "zod";
export const handleValidationError = (error: unknown) => {
  if (error instanceof z.ZodError) {
    return {status: 400, body: {error: error.issues}};
  }
  return {status: 500, body: {error: "Internal server error"}};
};

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "AppError";
  }
}
