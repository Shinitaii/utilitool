import type {AuthenticatedRequest} from "../../utils/auth.util";
import {Response} from "express";
import {chatbotService} from "./chatbot.service";
import {ChatRequestDTO} from "./chatbot.dto";

export const postChatMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const {message, history} = req.body as ChatRequestDTO;
  const reply = await chatbotService.chat(userId, message, history);
  res.status(200).json({reply});
};
