import {BaseModel} from "../../utils/model.util";

export interface User extends BaseModel {
  email: string;
  password_hash: string;
  is_active: boolean;
}

export interface RefreshToken extends BaseModel {
  user_id: string;
  token_hash: string;
  expires_at: number;
  is_revoked: boolean;
}
