import {Router} from "express";
import {postChatMessage} from "./chatbot.controller";
import {ChatRequestDTOSchema} from "./chatbot.dto";
import {validateRequest} from "../../middlewares/validate-request.middleware";

const router = Router();

router.post(
  "/",
  validateRequest({body: ChatRequestDTOSchema}),
  postChatMessage
);

export const chatbotRouter = router;
