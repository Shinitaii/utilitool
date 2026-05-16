import {AppError} from "../../utils/error.util";
import {userRepository} from "./auth.repository";
import {LoginDTO, RegisterDTO} from "./auth.dto";

export class AuthValidator {
  async validateRegister(data: RegisterDTO): Promise<void> {
    const existingUser = await userRepository.search({
      limit: 1,
      orderBy: "created_at",
      filters: {email: data.email},
    });

    if (existingUser.data.length > 0) {
      throw new AppError(409, "Email is already registered");
    }
  }

  async validateLogin(data: LoginDTO): Promise<void> {
    if (!data.email || !data.password) {
      throw new AppError(400, "Email and password are required");
    }
  }
}
