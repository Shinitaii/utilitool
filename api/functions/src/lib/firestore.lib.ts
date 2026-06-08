import {FieldValue} from "firebase-admin/firestore";
import {firestore} from "../config/firebase.config";
import {BaseModel, WithoutBaseModel} from "../utils/model.util";
import {snapshotToModel} from "../utils/firestore.util";

const withCreateTimestamps = <T extends Record<string, unknown>>(document: T) => ({
  ...document,
  created_at: FieldValue.serverTimestamp(),
  is_deleted: false,
  deleted_at: null,
});

const withUpdateTimestamp = <T extends Record<string, unknown>>(document: Partial<T>) => ({
  ...document,
  updated_at: FieldValue.serverTimestamp(),
});

const withDeleteTimestamp = <T extends Record<string, unknown>>(document: Partial<T>) => ({
  ...document,
  is_deleted: true,
  deleted_at: FieldValue.serverTimestamp(),
});

const updateAndFetch = async <T extends BaseModel>(
  reference: FirebaseFirestore.DocumentReference,
  data: any
): Promise<T> => {
  await reference.update(data);
  const snapshot = await reference.get();
  return snapshotToModel<T>(snapshot);
};

export const collectionRef = (collectionName: string) => firestore.collection(collectionName);

export const documentRef = (collectionName: string, documentId: string) =>
  collectionRef(collectionName).doc(documentId);

export const createDocument = async <T extends BaseModel>(
  collectionName: string,
  document: WithoutBaseModel<T>,
): Promise<T> => {
  const reference = await collectionRef(collectionName).add(withCreateTimestamps(document));
  const snapshot = await reference.get();

  return snapshotToModel<T>(snapshot);
};

export const setDocument = async <T extends BaseModel>(
  collectionName: string,
  documentId: string,
  document: WithoutBaseModel<T>,
): Promise<T> => {
  const reference = documentRef(collectionName, documentId);

  await reference.set(withCreateTimestamps(document));

  const snapshot = await reference.get();

  return snapshotToModel<T>(snapshot);
};

export const updateDocument = async <T extends BaseModel>(
  collectionName: string,
  documentId: string,
  document: Partial<WithoutBaseModel<T>>,
): Promise<T> => {
  const reference = documentRef(collectionName, documentId);
  return updateAndFetch<T>(reference, withUpdateTimestamp(document));
};

export const getDocument = async <T extends BaseModel>(
  collectionName: string,
  documentId: string,
): Promise<T | null> => {
  const snapshot = await documentRef(collectionName, documentId).get();

  if (!snapshot.exists) {
    return null;
  }

  const model = snapshotToModel<T>(snapshot);
  if (model.is_deleted === true) {
    return null;
  }

  return model;
};

export const softDeleteDocument = async <T extends BaseModel>(
  collectionName: string,
  documentId: string,
): Promise<T> => {
  const reference = documentRef(collectionName, documentId);
  return updateAndFetch<T>(reference, withDeleteTimestamp({}));
};

export const restoreDocument = async <T extends BaseModel>(
  collectionName: string,
  documentId: string,
): Promise<T> => {
  const reference = documentRef(collectionName, documentId);
  return updateAndFetch<T>(reference, {
    is_deleted: false,
    deleted_at: null,
    updated_at: FieldValue.serverTimestamp(),
  });
};

export const deleteDocument = async (collectionName: string, documentId: string) => {
  await documentRef(collectionName, documentId).delete();
};

// Batch creates
export const createDocuments = async <T extends BaseModel>(
  collectionName: string,
  documents: WithoutBaseModel<T>[],
): Promise<T[]> => {
  const batch = firestore.batch();
  const refs = documents.map(() => collectionRef(collectionName).doc());

  refs.forEach((ref, i) => {
    batch.set(ref, withCreateTimestamps(documents[i]));
  });

  await batch.commit();
  const snapshots = await firestore.getAll(...refs);
  return snapshots.map((snap) => snapshotToModel<T>(snap));
};

// Batch updates
export const updateDocuments = async <T extends BaseModel>(
  collectionName: string,
  updates: { id: string; data: Partial<WithoutBaseModel<T>> }[],
): Promise<T[]> => {
  const batch = firestore.batch();
  const refs = updates.map(({id}) => documentRef(collectionName, id));

  updates.forEach(({data}, i) => {
    batch.update(refs[i], withUpdateTimestamp(data));
  });

  await batch.commit();
  const snapshots = await firestore.getAll(...refs);
  return snapshots.map((snap) => snapshotToModel<T>(snap));
};

export const softDeleteDocuments = async <T extends BaseModel>(
  collectionName: string,
  documentIds: string[],
): Promise<T[]> => {
  const batch = firestore.batch();
  const refs = documentIds.map((id) => documentRef(collectionName, id));
  refs.forEach((ref) => {
    batch.update(ref, withDeleteTimestamp({}));
  });
  await batch.commit();
  const snapshots = await firestore.getAll(...refs);
  return snapshots.map((snap) => snapshotToModel<T>(snap));
};

// Batch deletes
export const deleteDocuments = async (collectionName: string, documentIds: string[]) => {
  const batch = firestore.batch();
  documentIds.forEach((id) => {
    batch.delete(documentRef(collectionName, id));
  });
  await batch.commit();
};
