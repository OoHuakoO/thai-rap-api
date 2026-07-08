import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join, resolve } from 'path';

export const UPLOADS_ROOT = join(process.cwd(), 'uploads');

export interface SavedFile {
  storedName: string;
  relativeUrl: string;
}

export async function saveLocalFile(
  subdir: string,
  originalName: string,
  buffer: Buffer,
): Promise<SavedFile> {
  const dir = join(UPLOADS_ROOT, subdir);
  await fs.mkdir(dir, { recursive: true });
  const storedName = `${randomUUID()}${extname(originalName).toLowerCase()}`;
  await fs.writeFile(join(dir, storedName), buffer);
  return { storedName, relativeUrl: `/uploads/${subdir}/${storedName}` };
}

export async function deleteLocalFile(relativeUrl: string): Promise<void> {
  const absolute = resolve(process.cwd(), relativeUrl.replace(/^\//, ''));
  // Guard against path traversal — only delete inside the uploads root
  if (!absolute.startsWith(UPLOADS_ROOT)) return;
  await fs.unlink(absolute).catch(() => undefined);
}
