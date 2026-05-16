import {Router} from "express";
import {
  createReading,
  getReadingById,
  getReadings,
  updateReading,
  deleteReading,
  softDeleteReading,
  createBatchReadings,
  updateBatchReadings,
} from "./reading.controller";
import {
  CreateReadingBatchDTOSchema,
  CreateReadingDTOSchema,
  ReadingByIdParamsDTOSchema,
  GetReadingsQueryDTOSchema,
  UpdateReadingBatchDTOSchema,
  UpdateReadingDTOSchema,
} from "./reading.dto";
import {validateRequest} from "../../middlewares/validate-request.middleware";

const router = Router();

router.post(
  "/batch",
  validateRequest({body: CreateReadingBatchDTOSchema}),
  createBatchReadings
);

router.put(
  "/batch",
  validateRequest({body: UpdateReadingBatchDTOSchema}),
  updateBatchReadings
);

router.post(
  "/",
  validateRequest({body: CreateReadingDTOSchema}),
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

router.put(
  "/:id",
  validateRequest({params: ReadingByIdParamsDTOSchema, body: UpdateReadingDTOSchema}),
  updateReading
);

router.delete(
  "/:id",
  validateRequest({params: ReadingByIdParamsDTOSchema}),
  deleteReading
);

router.delete(
  "/soft/:id",
  validateRequest({params: ReadingByIdParamsDTOSchema}),
  softDeleteReading
);

export default router;
