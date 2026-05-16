import {AppError} from "../../utils/error.util";
import {authLib} from "../../lib/auth.lib";
import {userRepository, refreshTokenRepository} from "./auth.repository";
import {AuthValidator} from "./auth.validator";
import {LoginDTO, RegisterDTO, RefreshTokenDTO} from "./auth.dto";

const validator = new AuthValidator();

class AuthService {
  async register(data: RegisterDTO) {
    await validator.validateRegister(data);

    const passwordHash = await authLib.hashPassword(data.password);

    const user = await userRepository.create({
      email: data.email,
      password_hash: passwordHash,
      is_active: true,
    });

    const accessToken = authLib.generateAccessToken(user.id, user.email);
    const tokenId = await this.createRefreshToken(user.id);
    const refreshToken = authLib.generateRefreshToken(user.id, tokenId);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: authLib.getAccessTokenExpiresIn() / 1000,
      token_type: "Bearer",
    };
  }

  async login(data: LoginDTO) {
    await validator.validateLogin(data);

    const user = await userRepository.search({
      limit: 1,
      orderBy: "created_at",
      filters: {email: data.email},
    });

    if (user.data.length === 0) {
      throw new AppError(401, "Invalid email or password");
    }

    const foundUser = user.data[0];

    if (!foundUser.is_active) {
      throw new AppError(403, "User account is inactive");
    }

    const passwordMatch = await authLib.verifyPassword(
      data.password,
      foundUser.password_hash
    );

    if (!passwordMatch) {
      throw new AppError(401, "Invalid email or password");
    }

    const accessToken = authLib.generateAccessToken(foundUser.id, foundUser.email);
    const tokenId = await this.createRefreshToken(foundUser.id);
    const refreshToken = authLib.generateRefreshToken(foundUser.id, tokenId);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: authLib.getAccessTokenExpiresIn() / 1000,
      token_type: "Bearer",
    };
  }

  async refresh(data: RefreshTokenDTO) {
    const payload = authLib.verifyRefreshToken(data.refresh_token);

    if (!payload) {
      throw new AppError(401, "Invalid or expired refresh token");
    }

    const refreshTokenRecord = await refreshTokenRepository.getById(payload.tokenId);

    if (!refreshTokenRecord || refreshTokenRecord.is_revoked) {
      throw new AppError(401, "Refresh token has been revoked");
    }

    if (refreshTokenRecord.expires_at < Date.now()) {
      throw new AppError(401, "Refresh token has expired");
    }

    const user = await userRepository.getById(payload.userId);

    if (!user || !user.is_active) {
      throw new AppError(403, "User not found or inactive");
    }

    const newAccessToken = authLib.generateAccessToken(user.id, user.email);

    return {
      access_token: newAccessToken,
      expires_in: authLib.getAccessTokenExpiresIn() / 1000,
      token_type: "Bearer",
    };
  }

  async logout(refreshTokenId: string) {
    const token = await refreshTokenRepository.getById(refreshTokenId);

    if (token) {
      await refreshTokenRepository.update(refreshTokenId, {is_revoked: true});
    }
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const expiresAt = Date.now() + authLib.getRefreshTokenExpiresIn();

    const refreshToken = await refreshTokenRepository.create({
      user_id: userId,
      token_hash: "",
      expires_at: expiresAt,
      is_revoked: false,
    });

    return refreshToken.id;
  }
}

export const authService = new AuthService();
