import { Router } from "express";
import { getMe, updateMe } from "./auth.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate-request.middleware";
import { UpdateUserProfileDTOSchema } from "./auth.dto";

const router = Router();

router.get("/me", authMiddleware, getMe);
router.patch("/me", authMiddleware, validateRequest({ body: UpdateUserProfileDTOSchema }), updateMe);

export default router;
