import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { Prisma } from '@prisma/client';
import type { ApiErrorResponse } from '../types/api-response.type';

interface PrismaErrorMapping {
  code: string;
  status: number;
  message: string;
}

const PRISMA_ERROR_MAP: Record<string, PrismaErrorMapping> = {
  P2002: { code: 'DB_001', status: HttpStatus.CONFLICT, message: 'Unique constraint violation' },
  P2025: { code: 'DB_002', status: HttpStatus.NOT_FOUND, message: 'Record not found' },
  P2003: {
    code: 'DB_003',
    status: HttpStatus.BAD_REQUEST,
    message: 'Foreign key constraint violation',
  },
  P2000: { code: 'DB_004', status: HttpStatus.BAD_REQUEST, message: 'Invalid data' },
  P2014: {
    code: 'DB_005',
    status: HttpStatus.BAD_REQUEST,
    message: 'Required relation violation',
  },
};

const HTTP_STATUS_TO_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALID_001',
  [HttpStatus.UNAUTHORIZED]: 'AUTH_003',
  [HttpStatus.FORBIDDEN]: 'PERM_001',
  [HttpStatus.NOT_FOUND]: 'DB_002',
  [HttpStatus.CONFLICT]: 'DB_001',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_001',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALID_001',
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.buildErrorBody(exception, request);
    response.status(body.status).json(body.payload);
  }

  private buildErrorBody(
    exception: unknown,
    request: Request,
  ): { status: number; payload: ApiErrorResponse } {
    if (exception instanceof HttpException) {
      return this.handleHttpException(exception, request);
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.handlePrismaKnownError(exception, request);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.warn(`Prisma validation error on [${request.method}] ${request.url}`);
      return {
        status: HttpStatus.BAD_REQUEST,
        payload: {
          success: false,
          error: { code: 'DB_004', message: 'Invalid data provided to database' },
        },
      };
    }

    this.logger.error(
      `Unhandled exception on [${request.method}] ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      payload: {
        success: false,
        error: { code: 'SYS_001', message: 'An unexpected error occurred' },
      },
    };
  }

  private handleHttpException(
    exception: HttpException,
    request: Request,
  ): { status: number; payload: ApiErrorResponse } {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse() as Record<string, unknown>;

    if (status >= 500) {
      this.logger.error(`[${request.method}] ${request.url} → ${status}`, exception.stack);
    } else {
      this.logger.warn(`[${request.method}] ${request.url} → ${status}`);
    }

    // AppException / ValidationAppException — already has { code, message, details? }
    if (exceptionResponse.code) {
      return {
        status,
        payload: {
          success: false,
          error: {
            code: exceptionResponse.code as string,
            message: exceptionResponse.message as string,
            ...(exceptionResponse.details ? { details: exceptionResponse.details as [] } : {}),
          },
        },
      };
    }

    // Standard NestJS HttpException with array of validation messages
    const messages = exceptionResponse.message;
    if (Array.isArray(messages)) {
      return {
        status,
        payload: {
          success: false,
          error: {
            code: 'VALID_001',
            message: 'Validation failed',
            details: messages.map((msg: string) => ({
              field: msg.split(' ')[0] ?? 'unknown',
              message: msg,
            })),
          },
        },
      };
    }

    return {
      status,
      payload: {
        success: false,
        error: {
          code: HTTP_STATUS_TO_CODE[status] ?? 'SYS_001',
          message: (messages as string) ?? exception.message,
        },
      },
    };
  }

  private handlePrismaKnownError(
    exception: Prisma.PrismaClientKnownRequestError,
    request: Request,
  ): { status: number; payload: ApiErrorResponse } {
    const mapped = PRISMA_ERROR_MAP[exception.code];

    this.logger.error(
      `Prisma ${exception.code} on [${request.method}] ${request.url}: ${exception.message}`,
    );

    if (mapped) {
      return {
        status: mapped.status,
        payload: { success: false, error: { code: mapped.code, message: mapped.message } },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      payload: { success: false, error: { code: 'DB_999', message: 'Database error' } },
    };
  }
}
