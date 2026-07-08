import { Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import type { RefreshJwtPayload } from './strategies/jwt-refresh.strategy';
import type { AuthTokens } from './auth.service';

const REFRESH_TOKEN_COOKIE = 'refreshToken';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'User registered successfully' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Email already exists' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Validation failed' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.register(dto);
    this.setRefreshCookie(res, result.tokens.refreshToken);
    return { user: result.user, tokens: this.omitRefreshToken(result.tokens) };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Login successful' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Invalid credentials' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Validation failed' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    this.setRefreshCookie(res, result.tokens.refreshToken);
    return { user: result.user, tokens: this.omitRefreshToken(result.tokens) };
  }

  @Public()
  @UseGuards(AuthGuard('jwt-refresh'))
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token cookie' })
  @ApiResponse({ status: HttpStatus.OK, description: 'New tokens issued' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Refresh token invalid or expired' })
  async refresh(@CurrentUser() user: RefreshJwtPayload, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.refresh(user.sub, user.refreshToken);
    this.setRefreshCookie(res, tokens.refreshToken);
    return this.omitRefreshToken(tokens);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Logged out successfully' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  async logout(@CurrentUser() user: JwtPayload, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(user.sub);
    res.clearCookie(REFRESH_TOKEN_COOKIE, this.getRefreshCookieOptions());
    return null;
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Current user profile' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  getMe(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub);
  }

  private getRefreshCookieOptions(): CookieOptions {
    const isProduction = this.configService.get<string>('app.env') === 'production';
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: this.configService.get<'strict' | 'lax' | 'none'>('auth.cookieSameSite', 'lax'),
    };
  }

  private setRefreshCookie(res: Response, refreshToken: string): void {
    const days = this.configService.get<number>('auth.jwtRefreshExpiresInDays', 7);
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...this.getRefreshCookieOptions(),
      maxAge: days * 24 * 60 * 60 * 1000,
    });
  }

  private omitRefreshToken(tokens: AuthTokens): Omit<AuthTokens, 'refreshToken'> {
    const { refreshToken: _refreshToken, ...rest } = tokens;
    return rest;
  }
}
