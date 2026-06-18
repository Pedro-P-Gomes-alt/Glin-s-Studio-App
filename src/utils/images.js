// Local image storage for the Details workspace.
//
// Per CLAUDE.md: images live in a folder beside the DB (here: <AppData>/images),
// the DB stores only relative paths, and phone photos are resized/compressed
// client-side before saving (they are often several MB).

import { mkdir, writeFile, remove, exists, BaseDirectory } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";

const IMAGES_DIR = "images";

// Resize/compress a File to a JPEG Uint8Array. Longest side capped at maxDim.
export async function resizeImageFile(file, maxDim = 1600, quality = 0.8) {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise(resolve =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  return new Uint8Array(await blob.arrayBuffer());
}

// Resize, save under <AppData>/images, return the relative filename to store in the DB.
export async function saveProjectImage(projectId, file) {
  await mkdir(IMAGES_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
  const bytes = await resizeImageFile(file);
  const name = `p${projectId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const relPath = `${IMAGES_DIR}/${name}`;
  await writeFile(relPath, bytes, { baseDir: BaseDirectory.AppData });
  return relPath;
}

// Delete a stored image file (ignores missing files).
export async function deleteProjectImage(relPath) {
  try {
    if (await exists(relPath, { baseDir: BaseDirectory.AppData })) {
      await remove(relPath, { baseDir: BaseDirectory.AppData });
    }
  } catch { /* best effort */ }
}

// Resolve a stored relative path to a webview-displayable src URL.
export async function imageSrc(relPath) {
  const dir = await appDataDir();
  const abs = await join(dir, relPath);
  return convertFileSrc(abs);
}
