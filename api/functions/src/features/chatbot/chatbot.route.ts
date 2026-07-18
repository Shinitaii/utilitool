import {Router} from "express";
import {postChatMessage} from "./chatbot.controller";
import {ChatRequestDTOSchema} from "./chatbot.dto";
import {validateRequest} from "../../middlewares/validate-request.middleware";
import {chatbotRateLimiter} from "../../config/rate-limit.config";
import {requireRole} from "../../middlewares/require-role.middleware";

const router = Router();

router.post(
  "/",
  chatbotRateLimiter,
  validateRequest({body: ChatRequestDTOSchema}),
  requireRole("admin"),
  postChatMessage
);

export const chatbotRouter = router;
