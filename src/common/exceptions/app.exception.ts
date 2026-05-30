import { HttpException, HttpStatus } from '@nestjs/common';
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
      { code: 'VALID_001', message: 'Validation failed', details },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class UnauthorizedException extends AppException {
  constructor(code = 'AUTH_003', message = 'Unauthorized') {
    super(code, message, HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenException extends AppException {
  constructor(code = 'PERM_001', message = 'Forbidden') {
    super(code, message, HttpStatus.FORBIDDEN);
  }
}

export class NotFoundException extends AppException {
  constructor(code = 'DB_002', message = 'Resource not found') {
    super(code, message, HttpStatus.NOT_FOUND);
  }
}

export class ConflictException extends AppException {
  constructor(code = 'DB_001', message = 'Resource already exists') {
    super(code, message, HttpStatus.CONFLICT);
  }
}

export class BadRequestException extends AppException {
  constructor(code = 'VALID_001', message = 'Bad request') {
    super(code, message, HttpStatus.BAD_REQUEST);
  }
}
