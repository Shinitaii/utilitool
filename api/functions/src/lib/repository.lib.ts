import {BaseModel, WithoutBaseModel} from "../utils/model.util";
import {
  createDocument,
  createDocuments,
  updateDocument,
  updateDocuments,
  getDocument,
  deleteDocument,
  softDeleteDocument,
  softDeleteDocuments,
  deleteDocuments,
  collectionRef,
} from "./firestore.lib";
import {PaginatedResult} from "../utils/pagination.util";
import {firestore} from "../config/firebase.config";
import {snapshotToModel} from "../utils/firestore.util";

export type SearchOptions<T extends BaseModel> = {
	limit: number;
	orderBy: keyof WithoutBaseModel<T> | "created_at";
	orderDirection?: "asc" | "desc";
	cursor?: string | null;
	filters?: Partial<WithoutBaseModel<T>>;
};

export class Repository<T extends BaseModel> {
  constructor(private collectionName: string) {}

  async create(document: WithoutBaseModel<T>): Promise<T> {
    return createDocument<T>(this.collectionName, document);
  }

  async createBatch(documents: WithoutBaseModel<T>[]): Promise<T[]> {
    return createDocuments<T>(this.collectionName, documents);
  }

  async update(id: string, document: Partial<WithoutBaseModel<T>>): Promise<T> {
    return updateDocument<T>(this.collectionName, id, document);
  }

  async updateBatch(updates: { id: string; data: Partial<WithoutBaseModel<T>> }[]): Promise<T[]> {
    return updateDocuments<T>(this.collectionName, updates);
  }

  async search(options: SearchOptions<T>): Promise<PaginatedResult<T>> {
    let query: FirebaseFirestore.Query = collectionRef(this.collectionName);

    if (options.filters) {
      for (const [field, value] of Object.entries(options.filters)) {
        if (value !== undefined) {
          query = query.where(field, "==", value as never);
        }
      }
    }

    query = query.orderBy(options.orderBy as string, options.orderDirection ?? "desc");

    if (options.cursor) {
      const cursorSnapshot = await firestore
        .collection(this.collectionName)
        .doc(options.cursor)
        .get();

      if (cursorSnapshot.exists) {
        query = query.startAfter(cursorSnapshot);
      }
    }

    const snapshot = await query.limit(options.limit + 1).get();
    const hasMore = snapshot.docs.length > options.limit;
    const docs = hasMore ? snapshot.docs.slice(0, options.limit) : snapshot.docs;

    return {
      data: docs.map((doc) => snapshotToModel(doc)),
      hasMore,
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }

  async getById(id: string): Promise<T | null> {
    return getDocument<T>(this.collectionName, id);
  }

  async softDelete(id: string): Promise<T> {
    return softDeleteDocument<T>(this.collectionName, id);
  }

  async softDeleteBatch(ids: string[]): Promise<T[]> {
    return softDeleteDocuments<T>(this.collectionName, ids);
  }

  async delete(id: string) {
    return deleteDocument(this.collectionName, id);
  }

  async deleteBatch(ids: string[]) {
    return deleteDocuments(this.collectionName, ids);
  }
}
