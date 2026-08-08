import { ApiPropertyOptional } from '@nestjs/swagger';
import { PitchingRecommendation } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PITCHING_SCORE_CARD_MAX } from '../pitching.const';

export const PITCHING_COMMENT_MAX_LENGTH = 2000;
export const PITCHING_PROTOTYPE_MAX_LENGTH = 200;

// Everything outside the criterion grid: the form header, the minimum-condition
// readings, the evidence checklist, the free-text comments and the verdict.
// Every field is optional so the form can be saved a section at a time; what a
// *submit* requires is enforced in the service, not here.
export class UpdatePitchingDto {
  @ApiPropertyOptional({
    description: 'ผลิตภัณฑ์/เมนูต้นแบบ — acceleration form header',
    maxLength: PITCHING_PROTOTYPE_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(PITCHING_PROTOTYPE_MAX_LENGTH)
  prototypeProduct?: string;

  @ApiPropertyOptional({
    description: 'เงื่อนไขขั้นต่ำ 1 — Score Card 8 มิติ',
    minimum: 0,
    maximum: PITCHING_SCORE_CARD_MAX,
  })
  // Nullable, not merely optional: a judge who mis-keyed the reading has to be
  // able to clear it, and an absent reading is a meaningful state (the
  // condition counts as unmet). Omitting the key leaves the stored value alone.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PITCHING_SCORE_CARD_MAX)
  scoreCardTotal?: number | null;

  @ApiPropertyOptional({ description: 'เงื่อนไขขั้นต่ำ 2 — เข้าร่วมกิจกรรมและส่งงาน (%)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  participationPct?: number | null;

  @ApiPropertyOptional({
    description: 'หลักฐานที่ตรวจสอบ — keys from PITCHING_EVIDENCE_KEYS for this round',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceChecked?: string[];

  @ApiPropertyOptional({
    description: 'ความเห็นของคณะกรรมการ, keyed by that round’s prompts',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  comments?: Record<string, string>;

  @ApiPropertyOptional({ enum: PitchingRecommendation })
  @IsOptional()
  @IsEnum(PitchingRecommendation)
  recommendation?: PitchingRecommendation;

  @ApiPropertyOptional({ maxLength: PITCHING_COMMENT_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(PITCHING_COMMENT_MAX_LENGTH)
  recommendationReason?: string;

  @ApiPropertyOptional({ description: '☐ ข้าพเจ้าไม่มีส่วนได้เสียกับกิจการที่ประเมิน' })
  @IsOptional()
  @IsBoolean()
  noConflictOfInterest?: boolean;

  @ApiPropertyOptional({ description: 'วันที่ตามที่ระบุบนแบบฟอร์ม' })
  @IsOptional()
  @IsDateString()
  evaluatedAt?: string;
}
