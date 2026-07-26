import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export const REPORT_FORMATS = ['xlsx', 'pdf'] as const;

export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const DEFAULT_REPORT_FORMAT: ReportFormat = 'xlsx';

export class ExportReportDto {
  @ApiPropertyOptional({ enum: REPORT_FORMATS, default: DEFAULT_REPORT_FORMAT })
  @IsOptional()
  @IsEnum(REPORT_FORMATS, { message: 'format must be one of xlsx, pdf' })
  format?: ReportFormat;
}
