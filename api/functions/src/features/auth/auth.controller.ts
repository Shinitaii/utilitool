import {Request, Response} from "express";
import {authService} from "./auth.service";
import {LoginDTO, RegisterDTO, RefreshTokenDTO} from "./auth.dto";

export const register = async (req: Request, res: Response): Promise<void> => {
  const data = req.body as RegisterDTO;
  const result = await authService.register(data);
  res.status(201).json(result);
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const data = req.body as LoginDTO;
  const result = await authService.login(data);
  res.status(200).json(result);
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  const data = req.body as RefreshTokenDTO;
  const result = await authService.refresh(data);
  res.status(200).json(result);
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  const {refreshTokenId} = req.body as {refreshTokenId: string};
  await authService.logout(refreshTokenId);
  res.status(204).send();
};
