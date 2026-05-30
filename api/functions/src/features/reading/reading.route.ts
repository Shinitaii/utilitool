import {Router} from "express";
import {
  createReading,
  createSeedReading,
  getReadingById,
  getReadings,
  updateReading,
  softDeleteReading,
  restoreReading,
  createBatchReadings,
  updateBatchReadings,
  ocrReading,
  clearCache,
} from "./reading.controller";
import {
  CreateReadingBatchDTOSchema,
  CreateReadingDTOSchema,
  CreateSeedReadingDTOSchema,
  ReadingByIdParamsDTOSchema,
  GetReadingsQueryDTOSchema,
  UpdateReadingBatchDTOSchema,
  UpdateReadingDTOSchema,
  OcrReadingDTOSchema,
} from "./reading.dto";
import {validateRequest} from "../../middlewares/validate-request.middleware";
import {requireRole} from "../../middlewares/require-role.middleware";

const router = Router();

router.post(
  "/cache/clear",
  requireRole("admin"),
  clearCache
);

router.post(
  "/ocr",
  validateRequest({body: OcrReadingDTOSchema}),
  requireRole("admin", "landlord", "assistant"),
  ocrReading
);

router.post(
  "/batch",
  validateRequest({body: CreateReadingBatchDTOSchema}),
  requireRole("admin", "landlord", "assistant"),
  createBatchReadings
);

router.patch(
  "/batch",
  validateRequest({body: UpdateReadingBatchDTOSchema}),
  requireRole("admin", "landlord", "assistant"),
  updateBatchReadings
);

router.post(
  "/seed",
  validateRequest({body: CreateSeedReadingDTOSchema}),
  requireRole("admin", "landlord", "assistant"),
  createSeedReading
);

router.post(
  "/",
  validateRequest({body: CreateReadingDTOSchema}),
  requireRole("admin", "landlord", "assistant"),
  createReading
);

router.get(
  "/",
  validateRequest({query: GetReadingsQueryDTOSchema}),
  getReadings
);

router.get(
  "/:id",
  validateRequest({params: ReadingByIdParamsDTOSchema}),
  getReadingById
);

router.patch(
  "/:id",
  validateRequest({params: ReadingByIdParamsDTOSchema, body: UpdateReadingDTOSchema}),
  requireRole("admin", "landlord", "assistant"),
  updateReading
);

router.delete(
  "/:id",
  validateRequest({params: ReadingByIdParamsDTOSchema}),
  requireRole("admin", "landlord"),
  softDeleteReading
);

router.patch(
  "/:id/restore",
  validateRequest({params: ReadingByIdParamsDTOSchema}),
  requireRole("admin", "landlord"),
  restoreReading
);

export const readingRouter = router;
