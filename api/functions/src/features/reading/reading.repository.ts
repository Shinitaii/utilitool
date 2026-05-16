import {Repository} from "../../lib/repository.lib";
import {Reading} from "./reading.model";
import {COLLECTIONS} from "../../constants/collection.constants";

export const readingRepository = new Repository<Reading>(COLLECTIONS.READINGS);
