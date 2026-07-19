import {Request, Response} from "express";
import * as admin from "firebase-admin";
import {CreateUserDTO} from "./user.dto";
import {userRepository} from "../auth/auth.repository";
import {setDocument} from "../../lib/firestore.lib";
import {COLLECTIONS} from "../../constants/collection.constants";
import {AppError} from "../../utils/error.util";
import type {User} from "../auth/auth.model";

// Maps Firebase Admin SDK auth error codes to messages matching what the UI
// previously mapped from the client SDK, since account creation now happens
// entirely server-side (the client no longer calls createUserWithEmailAndPassword,
// which used to hijack the acting admin's own session by signing the client SDK
// into the newly created account).
const ADMIN_AUTH_ERROR_MESSAGES: Record<string, {status: number; message: string}> = {
  "auth/email-already-exists": {status: 409, message: "An account with this email already exists."},
  "auth/invalid-password": {status: 400, message: "Password is too weak. Use at least 8 characters."},
  "auth/invalid-email": {status: 400, message: "Invalid email address."},
};

export async function createUser(req: Request<Record<string, never>, unknown, CreateUserDTO>, res: Response) {
  const {email, password, displayName, role} = req.body;

  let uid: string;
  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      ...(displayName ? {displayName} : {}),
    });
    uid = userRecord.uid;
  } catch (err: unknown) {
    const code = (err as {code?: string}).code ?? "";
    const mapped = ADMIN_AUTH_ERROR_MESSAGES[code];
    if (mapped) {
      throw new AppError(mapped.status, mapped.message);
    }
    throw new AppError(400, "Failed to create user account");
  }

  // Check if user profile already exists (non-deleted)
  const existing = await userRepository.getById(uid);
  if (existing && !existing.is_deleted) {
    throw new AppError(409, "User profile already exists");
  }

  // For deleted users, restore; for new users, create
  let user: User;
  if (existing && existing.is_deleted) {
    // Restore deleted user (preserves created_at)
    user = await userRepository.restore(uid);
    // Update role if different
    if (user.role !== role) {
      user = await userRepository.update(uid, {role});
    }
  } else {
    // Create new user, keyed by the Firebase Auth uid — required so that
    // requireRole's getById(req.user.userId) (userId being this same uid, from
    // the verified ID token) actually finds this profile and its chosen role
    // on the new user's first request, instead of GET /auth/me's auto-create
    // silently defaulting them to "landlord" because no doc existed at that ID.
    // Note: email and display_name are empty strings as per audit plan
    user = await setDocument<User>(COLLECTIONS.USERS, uid, {
      email: "",
      display_name: "",
      role,
    });
  }

  res.status(201).json(user);
}
