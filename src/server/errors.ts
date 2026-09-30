import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
    public readonly details?: Record<string, unknown>,
    public readonly responseHeaders?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function validationError(error: ZodError): AppError {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "body";
    fields[key] ??= issue.message;
  }
  return new AppError(422, "VALIDATION_ERROR", "请检查填写内容", fields);
}
