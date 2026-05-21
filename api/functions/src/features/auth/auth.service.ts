import { setDocument } from '../../lib/firestore.lib';
import { userRepository } from './auth.repository';
import { COLLECTIONS } from '../../constants/collection.constants';
import type { User } from './auth.model';
import type { UpdateUserProfileDTO } from './auth.dto';

export async function getMe(userId: string, email: string, displayName?: string): Promise<User> {
  const user = await userRepository.getById(userId);

  if (user) {
    return user;
  }

  return setDocument<User>(COLLECTIONS.USERS, userId, {
    email,
    display_name: displayName || '',
    role: 'landlord',
  });
}

export async function updateMe(userId: string, data: UpdateUserProfileDTO): Promise<User> {
  return userRepository.update(userId, data);
}
