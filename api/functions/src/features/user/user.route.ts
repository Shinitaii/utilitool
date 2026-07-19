import {Router} from "express";
import {validateRequest} from "../../middlewares/validate-request.middleware";
import {requireRole} from "../../middlewares/require-role.middleware";
import {CreateUserDTOSchema} from "./user.dto";
import {createUser} from "./user.controller";
import {AppError} from "../../utils/error.util";

const router = Router();

// Account creation is temporarily disabled — the app is currently single-tenant with
// one active user, so onboarding more accounts isn't needed right now. Re-enable by
// removing this guard (paired with the matching UI guard in
// ui/src/routes/(app)/settings/users/+page.svelte).
function accountCreationDisabled(): never {
  throw new AppError(403, "Account creation is currently disabled.");
}

router.post(
  "/",
  accountCreationDisabled,
  validateRequest({body: CreateUserDTOSchema}),
  requireRole("admin"),
  createUser
);

export const userRouter = router;
