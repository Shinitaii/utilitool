import {Response} from "express";
import {getMe as getUser, updateMe as updateUser} from "./auth.service";
import {AuthenticatedRequest} from "../../utils/auth.util";
import type {UpdateUserProfileDTO} from "./auth.dto";
import type {User} from "./auth.model";

function shapeUserResponse(user: User) {
  return {
    userId: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    qr_payment_url: user.qr_payment_url,
  };
}

export const getMe = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const {userId, email, displayName} = req.user!;
  const result = await getUser(userId, email, displayName);
  res.status(200).json(shapeUserResponse(result));
};

export const updateMe = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const {userId} = req.user!;
  const result = await updateUser(userId, req.body as UpdateUserProfileDTO);
  res.status(200).json(shapeUserResponse(result));
};
