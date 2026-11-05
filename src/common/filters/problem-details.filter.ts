import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance: string;
  errors?: string[];
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, title, detail, errors } = this.describe(exception);

    const problem: ProblemDetails = {
      type: `https://httpstatuses.com/${status}`,
      title,
      status,
      instance: request.url,
      ...(detail ? { detail } : {}),
      ...(errors ? { errors } : {}),
    };

    response.status(status).contentType('application/problem+json').send(problem);
  }

  private describe(exception: unknown): {
    status: number;
    title: string;
    detail?: string;
    errors?: string[];
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        return { status, title: exception.message, detail: body };
      }

      if (this.isHealthCheckResult(body)) {
        const failed = Object.entries(body.error ?? {}).map(
          ([key, value]) => `${key}: ${(value as { message?: string }).message ?? 'down'}`,
        );
        return { status, title: 'Service Unavailable', errors: failed.length > 0 ? failed : undefined };
      }

      const { message, error } = body as { message?: string | string[]; error?: string };
      const errors = Array.isArray(message) ? message : undefined;
      const detail = !errors && typeof message === 'string' ? message : undefined;

      return { status, title: error ?? exception.message, detail, errors };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: 'Internal Server Error',
    };
  }

  /** Reconoce el `HealthCheckResult` que lanza `@nestjs/terminus` como `ServiceUnavailableException`. */
  private isHealthCheckResult(body: unknown): body is { error?: Record<string, unknown> } {
    return typeof body === 'object' && body !== null && 'status' in body && 'details' in body;
  }
}
