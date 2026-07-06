import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES } from '@constants/index';
import type { ValidationErrorDetail } from '../types/api-response.type';

export class AppException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus,
  ) {
    super({ code, message }, status);
  }
}

export class ValidationAppException extends HttpException {
  constructor(public readonly details: ValidationErrorDetail[]) {
    super(
      { code: ERROR_CODES.VALID.VALIDATION_FAILED, message: 'Validation failed', details },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class UnauthorizedException extends AppException {
  constructor(code: string = ERROR_CODES.AUTH.UNAUTHORIZED, message = 'Unauthorized') {
    super(code, message, HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenException extends AppException {
  constructor(code: string = ERROR_CODES.PERM.FORBIDDEN, message = 'Forbidden') {
    super(code, message, HttpStatus.FORBIDDEN);
  }
}

export class NotFoundException extends AppException {
  constructor(code: string = ERROR_CODES.DB.NOT_FOUND, message = 'Resource not found') {
    super(code, message, HttpStatus.NOT_FOUND);
  }
}

export class ConflictException extends AppException {
  constructor(code: string = ERROR_CODES.DB.DUPLICATE, message = 'Resource already exists') {
    super(code, message, HttpStatus.CONFLICT);
  }
}

export class BadRequestException extends AppException {
  constructor(code: string = ERROR_CODES.VALID.BAD_REQUEST, message = 'Bad request') {
    super(code, message, HttpStatus.BAD_REQUEST);
  }
}
