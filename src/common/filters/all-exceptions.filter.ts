import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null;

    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let code = defaultCode(status);
    let data: Record<string, unknown> = {};

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const respObj = exceptionResponse as Record<string, any>;
      message = respObj.message || message;
      error = respObj.error || statusName(status);
      // Lỗi nghiệp vụ tạo bằng apiError() mang sẵn code + data (vd. OTP_INVALID, { attemptsLeft })
      code = typeof respObj.code === 'string' ? respObj.code : code;
      data = respObj.data && typeof respObj.data === 'object' ? respObj.data : data;
    } else if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const errorPayload = {
      statusCode: status,
      success: false,
      error,
      code,
      message,
      data,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    };

    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} - Status ${status} - Error: ${JSON.stringify(message)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `[${request.method}] ${request.url} - Status ${status} - Message: ${JSON.stringify(message)}`,
      );
    }

    response.status(status).json(errorPayload);
  }
}

// Mã lỗi mặc định khi exception không mang `code` (vd. ValidationPipe → VALIDATION).
function defaultCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'VALIDATION';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHENTICATED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'TOO_MANY_REQUESTS';
    default:
      return status >= 500 ? 'SERVER_ERROR' : String(HttpStatus[status] ?? 'ERROR');
  }
}

// 401 → "Unauthorized", 429 → "Too Many Requests" (giống trường `error` mặc định của Nest).
function statusName(status: number): string {
  const key = HttpStatus[status];
  if (!key) return 'Error';
  return String(key)
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
