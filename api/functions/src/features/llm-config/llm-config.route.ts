import {Router} from "express";
import {getLlmConfig, upsertLlmConfig, upsertVisionLlmConfig} from "./llm-config.controller";
import {UpsertLlmConfigDTOSchema, UpsertVisionLlmConfigDTOSchema} from "./llm-config.dto";
import {validateRequest} from "../../middlewares/validate-request.middleware";

const router = Router();

router.get("/", getLlmConfig);

router.patch(
  "/",
  validateRequest({body: UpsertLlmConfigDTOSchema}),
  upsertLlmConfig
);

router.patch(
  "/vision",
  validateRequest({body: UpsertVisionLlmConfigDTOSchema}),
  upsertVisionLlmConfig
);

export const llmConfigRouter = router;
