import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join, resolve, sep } from 'path';
import { BadRequestException } from '@common/exceptions/app.exception';
import { ERROR_CODES } from '@constants/index';

export const UPLOADS_ROOT = join(process.cwd(), 'uploads');

export interface SavedFile {
  storedName: string;
  relativeUrl: string;
}

// The MIME validators upstream trust the client-reported content type, and
// /uploads is served by express static which picks Content-Type from the
// extension — an unrestricted extension means a fake-MIME .html upload becomes
// stored XSS. The extension whitelist is the real gate.
export async function saveLocalFile(
  subdir: string,
  originalName: string,
  buffer: Buffer,
  allowedExtensions: readonly string[],
): Promise<SavedFile> {
  const ext = extname(originalName).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    throw new BadRequestException(ERROR_CODES.FILE.INVALID_TYPE, 'File extension is not allowed');
  }
  const dir = join(UPLOADS_ROOT, subdir);
  await fs.mkdir(dir, { recursive: true });
  const storedName = `${randomUUID()}${ext}`;
  await fs.writeFile(join(dir, storedName), buffer);
  return { storedName, relativeUrl: `/uploads/${subdir}/${storedName}` };
}

function resolveInsideUploadsRoot(relativeUrl: string): string | null {
  const absolute = resolve(process.cwd(), relativeUrl.replace(/^\//, ''));
  // Guard against path traversal — only touch paths inside the uploads root.
  // The trailing sep matters: "/app/uploads-evil" also startsWith "/app/uploads".
  return absolute.startsWith(UPLOADS_ROOT + sep) ? absolute : null;
}

export async function deleteLocalFile(relativeUrl: string): Promise<void> {
  const absolute = resolveInsideUploadsRoot(relativeUrl);
  if (!absolute) return;
  await fs.unlink(absolute).catch(() => undefined);
}

export async function deleteLocalDir(subdir: string): Promise<void> {
  const absolute = resolveInsideUploadsRoot(`/uploads/${subdir}`);
  if (!absolute) return;
  await fs.rm(absolute, { recursive: true, force: true }).catch(() => undefined);
}
