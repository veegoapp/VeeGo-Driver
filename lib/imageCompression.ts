import { Image } from 'react-native';
import { manipulateAsync, SaveFormat, type Action } from 'expo-image-manipulator';
import { File } from 'expo-file-system';

// Camera photos can come back at 4000px+ for no reason, and the backend re-compresses
// everything anyway — this only needs to get us into a reasonable ballpark before upload.
const MAX_DIMENSION = 1600;
const MAX_BYTES = 2 * 1024 * 1024;
// One resize+compress pass, then at most two quality step-downs if still too big.
// Deliberately not a long search loop — this runs on the driver's phone.
const QUALITY_STEPS = [0.8, 0.6, 0.4];

export type CompressedImage = { uri: string; mimeType: 'image/jpeg'; fileName: string };

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

function fileSizeBytes(uri: string): number {
  try {
    return new File(uri).size;
  } catch {
    return 0;
  }
}

/**
 * Resizes to a sane max dimension, forces JPEG (handles iPhone HEIC captures), and
 * steps quality down at most twice to land under MAX_BYTES. Best-effort: falls back
 * to the original capture if manipulation fails for any reason.
 */
export async function compressImage(uri: string, baseName = 'photo'): Promise<CompressedImage> {
  const fileName = `${baseName}.jpg`;
  try {
    const actions: Action[] = [];
    const { width, height } = await getImageSize(uri);
    if (Math.max(width, height) > MAX_DIMENSION) {
      actions.push(width >= height ? { resize: { width: MAX_DIMENSION } } : { resize: { height: MAX_DIMENSION } });
    }

    let result = await manipulateAsync(uri, actions, { compress: QUALITY_STEPS[0], format: SaveFormat.JPEG });

    for (let i = 1; i < QUALITY_STEPS.length && fileSizeBytes(result.uri) > MAX_BYTES; i++) {
      result = await manipulateAsync(result.uri, [], { compress: QUALITY_STEPS[i], format: SaveFormat.JPEG });
    }

    return { uri: result.uri, mimeType: 'image/jpeg', fileName };
  } catch {
    return { uri, mimeType: 'image/jpeg', fileName };
  }
}
