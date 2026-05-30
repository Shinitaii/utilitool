import {Router} from "express";
import {validateRequest} from "../../middlewares/validate-request.middleware";
import {requireRole} from "../../middlewares/require-role.middleware";
import {CreateUserDTOSchema} from "./user.dto";
import {createUser} from "./user.controller";

const router = Router();

router.post(
  "/",
  validateRequest({body: CreateUserDTOSchema}),
  requireRole("admin"),
  createUser
);

export const userRouter = router;
