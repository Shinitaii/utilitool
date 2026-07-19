import {Router} from "express";
import {
  createReading,
  createSeedReading,
  getReadingById,
  getReadings,
  updateReading,
  softDeleteReading,
  restoreReading,
  purgeReading,
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
import {ocrRateLimiter} from "../../config/rate-limit.config";

const router = Router();

router.post(
  "/cache/clear",
  requireRole("admin"),
  clearCache
);

router.post(
  "/ocr",
  ocrRateLimiter,
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

// Second step of the archive-then-purge lifecycle (right-to-erasure): only
// works on an already-archived (is_deleted=true) reading, admin-only.
router.delete(
  "/:id/purge",
  validateRequest({params: ReadingByIdParamsDTOSchema}),
  requireRole("admin"),
  purgeReading
);

export const readingRouter = router;
