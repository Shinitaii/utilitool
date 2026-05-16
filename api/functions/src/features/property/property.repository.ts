import {Repository} from "../../lib/repository.lib";
import {COLLECTIONS} from "../../constants/collection.constants";
import {Property} from "./property.model";

export const propertyRepository = new Repository<Property>(COLLECTIONS.PROPERTIES);
