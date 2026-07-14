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
import { ERROR_CODES } from '@constants/index';
import type { ApiErrorResponse } from '../types/api-response.type';

interface PrismaErrorMapping {
  code: string;
  status: number;
  message: string;
}

const PRISMA_ERROR_MAP: Record<string, PrismaErrorMapping> = {
  P2002: {
    code: ERROR_CODES.DB.DUPLICATE,
    status: HttpStatus.CONFLICT,
    message: 'ข้อมูลซ้ำกับที่มีอยู่แล้ว',
  },
  P2025: {
    code: ERROR_CODES.DB.NOT_FOUND,
    status: HttpStatus.NOT_FOUND,
    message: 'ไม่พบข้อมูล',
  },
  P2003: {
    code: ERROR_CODES.DB.FOREIGN_KEY,
    status: HttpStatus.BAD_REQUEST,
    message: 'ข้อมูลอ้างอิงไม่ถูกต้อง',
  },
  P2000: {
    code: ERROR_CODES.DB.INVALID_DATA,
    status: HttpStatus.BAD_REQUEST,
    message: 'ข้อมูลไม่ถูกต้อง',
  },
  P2014: {
    code: ERROR_CODES.DB.NULL_CONSTRAINT,
    status: HttpStatus.BAD_REQUEST,
    message: 'ข้อมูลที่จำเป็นไม่ครบถ้วน',
  },
};

const HTTP_STATUS_TO_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: ERROR_CODES.VALID.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ERROR_CODES.AUTH.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ERROR_CODES.PERM.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ERROR_CODES.DB.NOT_FOUND,
  [HttpStatus.CONFLICT]: ERROR_CODES.DB.DUPLICATE,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ERROR_CODES.VALID.VALIDATION_FAILED,
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
          error: {
            code: ERROR_CODES.DB.INVALID_DATA,
            message: 'ข้อมูลที่ส่งไปยังฐานข้อมูลไม่ถูกต้อง',
          },
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
        error: { code: ERROR_CODES.SYS.UNEXPECTED, message: 'เกิดข้อผิดพลาดที่ไม่คาดคิด' },
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

    const messages = exceptionResponse.message;
    if (Array.isArray(messages)) {
      return {
        status,
        payload: {
          success: false,
          error: {
            code: ERROR_CODES.VALID.VALIDATION_FAILED,
            message: 'ข้อมูลไม่ผ่านการตรวจสอบ',
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
          code: HTTP_STATUS_TO_CODE[status] ?? ERROR_CODES.SYS.UNEXPECTED,
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
      payload: {
        success: false,
        error: { code: ERROR_CODES.DB.GENERIC, message: 'เกิดข้อผิดพลาดฐานข้อมูล' },
      },
    };
  }
}
