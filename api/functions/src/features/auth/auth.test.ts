jest.mock('../../lib/auth.lib');
jest.mock('./auth.repository');
jest.mock('./auth.validator');

import { describe, it, expect } from '@jest/globals';
import { authService } from './auth.service';
import { userRepository, refreshTokenRepository } from './auth.repository';
import { AuthValidator } from './auth.validator';
import { LoginDTOSchema, RegisterDTOSchema, RefreshTokenDTOSchema } from './auth.dto';
import { authLib } from '../../lib/auth.lib';
import { AppError } from '../../utils/error.util';
import { Timestamp } from 'firebase-admin/firestore';

const mockUser = (overrides?: Record<string, any>) => ({
  id: 'user-1',
  email: 'test@example.com',
  password_hash: '$bcrypt$hash',
  is_active: true,
  created_at: Timestamp.now(),
  updated_at: Timestamp.now(),
  ...overrides,
});

const mockRefreshToken = (overrides?: Record<string, any>) => ({
  id: 'token-id-1',
  user_id: 'user-1',
  token_hash: '',
  expires_at: Date.now() + 86400000 * 60,
  is_revoked: false,
  created_at: Timestamp.now(),
  updated_at: Timestamp.now(),
  ...overrides,
});

describe('authService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    // Should register user with valid email and password
    it('should register user with valid email and password', async () => {
      jest.mocked(AuthValidator.prototype.validateRegister).mockResolvedValue(undefined);
      jest.mocked(authLib.hashPassword).mockResolvedValue('$bcrypt$hashed');
      jest.mocked(userRepository.create).mockResolvedValue(mockUser());
      jest.mocked(refreshTokenRepository.create).mockResolvedValue(mockRefreshToken());
      jest.mocked(authLib.generateAccessToken).mockReturnValue('access-token');
      jest.mocked(authLib.generateRefreshToken).mockReturnValue('refresh-token');
      jest.mocked(authLib.getAccessTokenExpiresIn).mockReturnValue(1800000);

      const result = await authService.register({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.token_type).toBe('Bearer');
      expect(result.expires_in).toBe(1800);
    });

    // Should reject registration with duplicate email
    it('should reject registration with duplicate email', async () => {
      jest.mocked(AuthValidator.prototype.validateRegister).mockRejectedValue(
        new AppError(409, 'Email is already registered')
      );

      await expect(
        authService.register({ email: 'existing@example.com', password: 'password123' })
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'Email is already registered',
      });
    });

    // Should reject registration with weak password
    it('should reject registration with weak password', () => {
      const result = RegisterDTOSchema.safeParse({
        email: 'test@example.com',
        password: 'short',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('login', () => {
    // Should login user with valid credentials
    it('should login user with valid credentials', async () => {
      jest.mocked(AuthValidator.prototype.validateLogin).mockResolvedValue(undefined);
      jest.mocked(userRepository.search).mockResolvedValue({
        data: [mockUser()],
        hasMore: false,
        nextCursor: null,
      });
      jest.mocked(authLib.verifyPassword).mockResolvedValue(true);
      jest.mocked(refreshTokenRepository.create).mockResolvedValue(mockRefreshToken());
      jest.mocked(authLib.generateAccessToken).mockReturnValue('access-token');
      jest.mocked(authLib.generateRefreshToken).mockReturnValue('refresh-token');
      jest.mocked(authLib.getAccessTokenExpiresIn).mockReturnValue(1800000);

      const result = await authService.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.token_type).toBe('Bearer');
    });

    // Should reject login with invalid email
    it('should reject login with invalid email', () => {
      const result = LoginDTOSchema.safeParse({
        email: 'not-email',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    // Should reject login with invalid password
    it('should reject login with user not found or wrong password', async () => {
      jest.mocked(AuthValidator.prototype.validateLogin).mockResolvedValue(undefined);
      jest.mocked(userRepository.search).mockResolvedValue({
        data: [],
        hasMore: false,
        nextCursor: null,
      });

      await expect(
        authService.login({ email: 'test@example.com', password: 'wrongpassword' })
      ).rejects.toMatchObject({
        statusCode: 401,
        message: 'Invalid email or password',
      });
    });

    // Should generate access and refresh tokens on login
    it('should generate access and refresh tokens on login', async () => {
      jest.mocked(AuthValidator.prototype.validateLogin).mockResolvedValue(undefined);
      jest.mocked(userRepository.search).mockResolvedValue({
        data: [mockUser()],
        hasMore: false,
        nextCursor: null,
      });
      jest.mocked(authLib.verifyPassword).mockResolvedValue(true);
      jest.mocked(refreshTokenRepository.create).mockResolvedValue(mockRefreshToken());
      jest.mocked(authLib.generateAccessToken).mockReturnValue('access-token-123');
      jest.mocked(authLib.generateRefreshToken).mockReturnValue('refresh-token-456');
      jest.mocked(authLib.getAccessTokenExpiresIn).mockReturnValue(1800000);

      await authService.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(jest.mocked(authLib.generateAccessToken)).toHaveBeenCalledWith('user-1', 'test@example.com');
      expect(jest.mocked(authLib.generateRefreshToken)).toHaveBeenCalled();
    });

    // Should reject login when user account is inactive
    it('should reject login when user account is inactive', async () => {
      jest.mocked(AuthValidator.prototype.validateLogin).mockResolvedValue(undefined);
      jest.mocked(userRepository.search).mockResolvedValue({
        data: [mockUser({ is_active: false })],
        hasMore: false,
        nextCursor: null,
      });

      await expect(
        authService.login({ email: 'test@example.com', password: 'password123' })
      ).rejects.toMatchObject({
        statusCode: 403,
        message: 'User account is inactive',
      });
    });
  });

  describe('refresh', () => {
    // Should refresh access token with valid refresh token
    it('should refresh access token with valid refresh token', async () => {
      jest.mocked(authLib.verifyRefreshToken).mockReturnValue({
        userId: 'user-1',
        tokenId: 'token-id-1',
      } as any);
      jest.mocked(refreshTokenRepository.getById).mockResolvedValue(mockRefreshToken());
      jest.mocked(userRepository.getById).mockResolvedValue(mockUser());
      jest.mocked(authLib.generateAccessToken).mockReturnValue('new-access-token');
      jest.mocked(authLib.getAccessTokenExpiresIn).mockReturnValue(1800000);

      const result = await authService.refresh({
        refresh_token: 'refresh-token-123',
      });

      expect(result).toHaveProperty('access_token');
      expect(result.token_type).toBe('Bearer');
      expect(result.expires_in).toBe(1800);
    });

    // Should reject refresh with invalid refresh token
    it('should reject refresh with invalid refresh token', async () => {
      jest.mocked(authLib.verifyRefreshToken).mockReturnValue(null);

      await expect(
        authService.refresh({ refresh_token: 'invalid-token' })
      ).rejects.toMatchObject({
        statusCode: 401,
        message: 'Invalid or expired refresh token',
      });
    });

    // Should reject refresh with revoked token
    it('should reject refresh with revoked token', async () => {
      jest.mocked(authLib.verifyRefreshToken).mockReturnValue({
        userId: 'user-1',
        tokenId: 'token-id-1',
      } as any);
      jest.mocked(refreshTokenRepository.getById).mockResolvedValue(
        mockRefreshToken({ is_revoked: true })
      );

      await expect(
        authService.refresh({ refresh_token: 'revoked-token' })
      ).rejects.toMatchObject({
        statusCode: 401,
        message: 'Refresh token has been revoked',
      });
    });

    // Should reject refresh with expired token
    it('should reject refresh with expired token', async () => {
      jest.mocked(authLib.verifyRefreshToken).mockReturnValue({
        userId: 'user-1',
        tokenId: 'token-id-1',
      } as any);
      jest.mocked(refreshTokenRepository.getById).mockResolvedValue(
        mockRefreshToken({ expires_at: Date.now() - 1000 })
      );

      await expect(
        authService.refresh({ refresh_token: 'expired-token' })
      ).rejects.toMatchObject({
        statusCode: 401,
        message: 'Refresh token has expired',
      });
    });
  });

  describe('logout', () => {
    // Should revoke refresh token on logout
    it('should revoke refresh token on logout', async () => {
      jest.mocked(refreshTokenRepository.getById).mockResolvedValue(mockRefreshToken());
      jest.mocked(refreshTokenRepository.update).mockResolvedValue(
        mockRefreshToken({ is_revoked: true })
      );

      await authService.logout('token-id-1');

      expect(jest.mocked(refreshTokenRepository.update)).toHaveBeenCalledWith('token-id-1', {
        is_revoked: true,
      });
    });
  });
});
