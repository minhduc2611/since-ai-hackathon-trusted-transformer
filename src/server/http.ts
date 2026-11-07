import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ApiError, ApiResponse } from "../shared/api.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/*
Send a successful JSON API response.
*/
export function ok<T>(res: Response, data: T): void {
  const body: ApiResponse<T> = { success: true, data };
  res.json(body);
}

/*
Wrap async route handlers so rejections reach the error middleware.
*/
export function asyncRoute(fn: (req: Request, res: Response) => Promise<void> | void): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

/*
Convert errors into JSON API error responses.
*/
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const status = statusOf(err);
  const message = err instanceof Error ? err.message : String(err);
  if (status === 500) console.error(err);
  const body: ApiError = { success: false, error: message };
  res.status(status).json(body);
}

/*
Map an error to an HTTP status code.
*/
function statusOf(err: unknown): number {
  if (err instanceof HttpError) return err.status;
  if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "ENOENT") return 404;
  return 500;
}

/*
Read and validate a path parameter.
*/
export function param(req: Request, name: string): string {
  const v = req.params[name];
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]+$/.test(v)) {
    throw new HttpError(400, `Invalid ${name}`);
  }
  return v;
}
