import {Router} from "express";
import {postChatMessage} from "./chatbot.controller";
import {ChatRequestDTOSchema} from "./chatbot.dto";
import {validateRequest} from "../../middlewares/validate-request.middleware";
import {chatbotRateLimiter} from "../../config/rate-limit.config";

const router = Router();

router.post(
  "/",
  chatbotRateLimiter,
  validateRequest({body: ChatRequestDTOSchema}),
  postChatMessage
);

export const chatbotRouter = router;
