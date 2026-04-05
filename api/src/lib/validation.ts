import { z } from "zod";

type ZodLikeError = {
  errors?: unknown;
  issues?: unknown;
  name?: string;
};

export function isZodLikeError(error: unknown): error is ZodLikeError {
  return (
    error instanceof z.ZodError ||
    (typeof error === "object" &&
      error !== null &&
      (error as ZodLikeError).name === "ZodError")
  );
}

export function getZodLikeDetails(error: ZodLikeError): unknown {
  return error.errors ?? error.issues ?? [];
}
