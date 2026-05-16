import { DocumentSnapshot } from "firebase-admin/firestore";
import { BaseModel } from "./model.util";

export const snapshotToModel = <T extends BaseModel>(snapshot: DocumentSnapshot) => {
    const data = snapshot.data();

    if (!data) {
        throw new Error(`Document ${snapshot.ref.path} does not exist.`);
    }

    return {
        ...(data as Omit<T, "id">),
        id: snapshot.id,
    } as T;
};