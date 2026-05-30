import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route as public — bypasses JwtAuthGuard.
 * Usage: @Public() on controller method or controller class.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
