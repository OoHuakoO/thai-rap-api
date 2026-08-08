import type { Response } from 'express';
import { EXPORT_CONTENT_TYPE, type ReportFormat } from '@common/dto/export-format.dto';

// A controller that takes @Res() opts out of TransformInterceptor's
// { success, data } envelope — the client needs the raw binary, not JSON. These
// two are the only way an export route should write its headers, so every
// download in the project agrees on Content-Type and filename shape.
export function setFileHeaders(res: Response, format: ReportFormat, basename: string): void {
  res.setHeader('Content-Type', EXPORT_CONTENT_TYPE[format]);
  res.setHeader('Content-Disposition', `attachment; filename="${basename}.${format}"`);
}

export function sendFile(
  res: Response,
  file: Buffer,
  format: ReportFormat,
  basename: string,
): void {
  setFileHeaders(res, format, basename);
  res.send(file);
}
