import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '$lib/firebase';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export async function uploadToStorage(file: File, path: string): Promise<string> {
	if (file.size > MAX_FILE_SIZE) {
		throw new Error('File size exceeds 5 MB limit. Please choose a smaller file.');
	}

	const fileRef = ref(storage, path);
	await uploadBytes(fileRef, file);
	return getDownloadURL(fileRef);
}
