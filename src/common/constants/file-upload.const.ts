export const FILE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const FILE_MAX_SIZE_MB = FILE_MAX_SIZE_BYTES / (1024 * 1024);

export const PHOTO_MIME_REGEX = /^image\/(jpeg|png|webp)$/;

export const STORE_DOCUMENT_MIME_REGEX =
  /^(application\/(pdf|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)|text\/csv)$/;

export const ASSESSMENT_EVIDENCE_MIME_REGEX =
  /^(image\/(jpeg|png|webp)|application\/(pdf|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet))$/;

export const PHOTO_ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;

export const STORE_DOCUMENT_ALLOWED_EXTENSIONS = ['.pdf', '.xlsx', '.docx', '.csv'] as const;

export const ASSESSMENT_EVIDENCE_ALLOWED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.pdf',
  '.xlsx',
] as const;
