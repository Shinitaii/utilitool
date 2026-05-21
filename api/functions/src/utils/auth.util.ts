import {Request} from "express";
import type {User} from "../features/auth/auth.model";

export type Role = User["role"];

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    displayName?: string;
    role?: Role;
  };
}

export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
