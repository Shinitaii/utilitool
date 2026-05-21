jest.mock('../../lib/firestore.lib');

import { describe, it, expect } from '@jest/globals';
import { getMe } from './auth.service';
import { getDocument, setDocument } from '../../lib/firestore.lib';
import { Timestamp } from 'firebase-admin/firestore';

const mockUser = (overrides?: Record<string, any>) => ({
  id: 'user-1',
  email: 'test@example.com',
  display_name: 'Test User',
  role: 'admin' as const,
  created_at: Timestamp.now(),
  updated_at: Timestamp.now(),
  ...overrides,
});

describe('authService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMe', () => {
    // Should return existing user profile
    it('should return existing user profile', async () => {
      const user = mockUser();
      jest.mocked(getDocument).mockResolvedValue(user);

      const result = await getMe('user-1', 'test@example.com', 'Test User');

      expect(result).toMatchObject({ id: 'user-1', email: 'test@example.com', display_name: 'Test User' });
      expect(jest.mocked(getDocument)).toHaveBeenCalledWith('users', 'user-1');
      expect(jest.mocked(setDocument)).not.toHaveBeenCalled();
    });

    // Should create profile on first access if not found (new users default to 'landlord')
    it('should create profile on first access if not found', async () => {
      jest.mocked(getDocument).mockResolvedValue(null);
      jest.mocked(setDocument).mockResolvedValue(
        mockUser({ display_name: 'New User', role: 'landlord' })
      );

      const result = await getMe('user-2', 'newuser@example.com', 'New User');

      expect(jest.mocked(getDocument)).toHaveBeenCalledWith('users', 'user-2');
      expect(jest.mocked(setDocument)).toHaveBeenCalledWith('users', 'user-2', {
        email: 'newuser@example.com',
        display_name: 'New User',
        role: 'landlord',
      });
      expect(result.display_name).toBe('New User');
    });

    // Should handle empty displayName gracefully
    it('should handle empty displayName gracefully', async () => {
      jest.mocked(getDocument).mockResolvedValue(null);
      jest.mocked(setDocument).mockResolvedValue(
        mockUser({ display_name: '', role: 'landlord' })
      );

      const result = await getMe('user-3', 'test3@example.com');

      expect(jest.mocked(setDocument)).toHaveBeenCalledWith('users', 'user-3', {
        email: 'test3@example.com',
        display_name: '',
        role: 'landlord',
      });
    });
  });
});
