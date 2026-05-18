import {Repository} from "../../lib/repository.lib";
import {COLLECTIONS} from "../../constants/collection.constants";
import {User} from "./auth.model";

export const userRepository = new Repository<User>(COLLECTIONS.USERS);
