import {Router} from "express";
import {z} from "zod";
import {register, login, refresh, logout} from "./auth.controller";
import {LoginDTOSchema, RegisterDTOSchema, RefreshTokenDTOSchema} from "./auth.dto";
import {validateRequest} from "../../middlewares/validate-request.middleware";

const router = Router();

const LogoutDTOSchema = z.object({
  refreshTokenId: z.string().min(1),
});

router.post("/register", validateRequest({body: RegisterDTOSchema}), register);
router.post("/login", validateRequest({body: LoginDTOSchema}), login);
router.post("/refresh", validateRequest({body: RefreshTokenDTOSchema}), refresh);
router.post("/logout", validateRequest({body: LogoutDTOSchema}), logout);

export default router;
