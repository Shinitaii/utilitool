import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '$lib/firebase';

export async function uploadToStorage(file: File, path: string): Promise<string> {
  try {
    const fileRef = ref(storage, path);

    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);

    return url;
  } catch (error) {
    console.error('Error uploading file to Firebase Storage:', error);
    throw error instanceof Error ? error : new Error('Failed to upload file');
  }
}
