import {Repository} from "../../lib/repository.lib";
import {COLLECTIONS} from "../../constants/collection.constants";
import {User, RefreshToken} from "./auth.model";

export const userRepository = new Repository<User>(COLLECTIONS.USERS);
export const refreshTokenRepository = new Repository<RefreshToken>(
  COLLECTIONS.REFRESH_TOKENS
);
