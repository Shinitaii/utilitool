import { Request, Response } from 'express';
import { CreateUserDTO } from './user.dto';
import { userRepository } from '../auth/auth.repository';
import { AppError } from '../../utils/error.util';
import type { User } from '../auth/auth.model';

export async function createUser(req: Request<Record<string, never>, {}, CreateUserDTO>, res: Response) {
  const { uid, role } = req.body;

  // Check if user profile already exists (non-deleted)
  const existing = await userRepository.getById(uid);
  if (existing && !existing.is_deleted) {
    throw new AppError(409, 'User profile already exists');
  }

  // For deleted users, restore; for new users, create
  let user: User;
  if (existing && existing.is_deleted) {
    // Restore deleted user (preserves created_at)
    user = await userRepository.restore(uid);
    // Update role if different
    if (user.role !== role) {
      user = await userRepository.update(uid, { role });
    }
  } else {
    // Create new user
    // Note: email and display_name are empty strings as per audit plan
    user = await userRepository.create({
      email: '',
      display_name: '',
      role,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date()
    } as unknown as User);
  }

  res.status(201).json(user);
}
