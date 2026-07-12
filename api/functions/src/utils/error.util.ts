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

/** Fetch by id via the given lookup, or throw a 404 AppError with a consistent message. */
export async function getOrThrow<T>(
  getById: (id: string) => Promise<T | null>,
  id: string,
  label: string
): Promise<T> {
  const entity = await getById(id);
  if (!entity) {
    throw new AppError(404, `${label} not found`);
  }
  return entity;
}
