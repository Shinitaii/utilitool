import {Router} from "express";
import {getLlmConfig, upsertLlmConfig} from "./llm-config.controller";
import {UpsertLlmConfigDTOSchema} from "./llm-config.dto";
import {validateRequest} from "../../middlewares/validate-request.middleware";

const router = Router();

router.get("/", getLlmConfig);

router.patch(
  "/",
  validateRequest({body: UpsertLlmConfigDTOSchema}),
  upsertLlmConfig
);

export const llmConfigRouter = router;
