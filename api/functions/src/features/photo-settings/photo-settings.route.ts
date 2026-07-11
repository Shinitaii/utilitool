import {Router} from "express";
import {getPhotoSettings, upsertPhotoSettings} from "./photo-settings.controller";
import {UpsertPhotoSettingsDTOSchema} from "./photo-settings.dto";
import {validateRequest} from "../../middlewares/validate-request.middleware";

const router = Router();

router.get("/", getPhotoSettings);

router.patch(
  "/",
  validateRequest({body: UpsertPhotoSettingsDTOSchema}),
  upsertPhotoSettings
);

export const photoSettingsRouter = router;
