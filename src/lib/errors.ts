export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function badRequest(message: string, code = 'BAD_REQUEST') {
  return new AppError(code, message, 400);
}
export function unauthorized(message = 'Unauthorized') {
  return new AppError('UNAUTHORIZED', message, 401);
}
export function forbidden(message = 'Forbidden') {
  return new AppError('FORBIDDEN', message, 403);
}
export function notFound(message = 'Not found') {
  return new AppError('NOT_FOUND', message, 404);
}
export function conflict(message: string, code = 'CONFLICT') {
  return new AppError(code, message, 409);
}
