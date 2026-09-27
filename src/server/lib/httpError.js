// Small helper for HTTP-aware errors handled by the Express error middleware.
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function badRequest(message, details) {
  return new HttpError(400, message, details);
}

export function notFound(message = 'Not found') {
  return new HttpError(404, message);
}

export function conflict(message) {
  return new HttpError(409, message);
}
