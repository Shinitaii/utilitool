import {getRealtimeDb} from "../config/firebase.config";

export const realtimeRef = (path: string) => getRealtimeDb().ref(path);

export const setRealtimeValue = async <T>(path: string, value: T) => {
  await realtimeRef(path).set(value);
};

export const pushRealtimeValue = async <T>(path: string, value: T) => {
  const reference = await realtimeRef(path).push(value);

  return reference;
};

export const getRealtimeValue = async <T>(path: string): Promise<T | null> => {
  const snapshot = await realtimeRef(path).get();

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.val() as T;
};

export const deleteRealtimeValue = async (path: string) => {
  await realtimeRef(path).remove();
};
