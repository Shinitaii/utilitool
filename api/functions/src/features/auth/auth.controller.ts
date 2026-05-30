import {Response} from "express";
import {getMe as getUser, updateMe as updateUser} from "./auth.service";
import {AuthenticatedRequest} from "../../utils/auth.util";
import type {UpdateUserProfileDTO} from "./auth.dto";

export const getMe = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const {userId, email, displayName} = req.user!;
  const result = await getUser(userId, email, displayName);
  res.status(200).json({
    userId: result.id,
    email: result.email,
    display_name: result.display_name,
    role: result.role,
    qr_payment_url: result.qr_payment_url,
  });
};

export const updateMe = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const {userId} = req.user!;
  const result = await updateUser(userId, req.body as UpdateUserProfileDTO);
  res.status(200).json({
    userId: result.id,
    email: result.email,
    display_name: result.display_name,
    role: result.role,
    qr_payment_url: result.qr_payment_url,
  });
};
