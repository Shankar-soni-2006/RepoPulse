import { Response } from 'express';
import { ApiSuccess, ApiError } from '../types';

export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  const body: ApiSuccess<T> = { success: true, data };
  res.status(status).json(body);
}

export function sendError(res: Response, status: number, code: string, message: string): void {
  const body: ApiError = { success: false, error: { code, message } };
  res.status(status).json(body);
}
