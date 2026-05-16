import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const JWT_SECRET = process.env.JWT_SECRET || "";
const BCRYPT_SALT_ROUNDS = 15;
const ACCESS_TOKEN_EXPIRES_IN = 30 * 60; // 30 minutes in seconds
const REFRESH_TOKEN_EXPIRES_IN = 60 * 24 * 60 * 60; // 60 days in seconds

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set");
}

export interface JWTPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
  iat?: number;
  exp?: number;
}

export const authLib = {
  // Hash password with bcrypt
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  },

  // Compare password with hash
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  },

  // Generate access token (short-lived)
  generateAccessToken(userId: string, email: string): string {
    return jwt.sign(
      {userId, email},
      JWT_SECRET,
      {expiresIn: ACCESS_TOKEN_EXPIRES_IN}
    );
  },

  // Generate refresh token (long-lived)
  generateRefreshToken(userId: string, tokenId: string): string {
    return jwt.sign(
      {userId, tokenId},
      JWT_SECRET,
      {expiresIn: REFRESH_TOKEN_EXPIRES_IN}
    );
  },

  // Verify and decode access token
  verifyAccessToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch {
      return null;
    }
  },

  // Verify and decode refresh token
  verifyRefreshToken(token: string): RefreshTokenPayload | null {
    try {
      return jwt.verify(token, JWT_SECRET) as RefreshTokenPayload;
    } catch {
      return null;
    }
  },

  // Get token expiration times in ms
  getAccessTokenExpiresIn(): number {
    return ACCESS_TOKEN_EXPIRES_IN * 1000;
  },

  getRefreshTokenExpiresIn(): number {
    return REFRESH_TOKEN_EXPIRES_IN * 1000;
  },
};
