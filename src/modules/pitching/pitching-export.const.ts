import { PitchingRecommendation, PitchingRound } from '@prisma/client';
import type { PitchingLevel } from './pitching.const';

// Labels for the two export writers. They are the paper forms' own wording, and
// the web's constants/pitching.constants.ts carries the same strings for the
// screen — a file and the page it was downloaded from must not disagree.
export const PITCHING_ROUND_LABELS: Record<PitchingRound, string> = {
  [PitchingRound.PITCH_DECK]: 'รอบคัดเลือกเข้า Incubation',
  [PitchingRound.ACCELERATION]: 'รอบ Incubation สู่ Acceleration',
};

export const PITCHING_LEVEL_LABELS: Record<PitchingLevel, string> = {
  HIGHLY_SUITABLE: 'เหมาะสมมาก',
  SUITABLE: 'เหมาะสม',
  FAIR: 'พอใช้ / สำรอง',
  NOT_READY: 'ยังไม่พร้อม',
};

export const PITCHING_RECOMMENDATION_LABELS: Record<PitchingRecommendation, string> = {
  [PitchingRecommendation.SELECTED]: 'เห็นควรคัดเลือก',
  [PitchingRecommendation.WAITING_LIST]: 'เห็นควรจัดเป็นรายชื่อสำรอง',
  [PitchingRecommendation.MINIMUM_NOT_MET]: 'ไม่ผ่านเงื่อนไขขั้นต่ำ',
  [PitchingRecommendation.NOT_SELECTED]: 'ยังไม่เห็นควรคัดเลือกในรอบนี้',
};

export const PITCHING_COMMENT_LABELS: Record<PitchingRound, readonly [string, string][]> = {
  [PitchingRound.PITCH_DECK]: [
    ['strengths', 'จุดแข็งของร้าน'],
    ['urgentImprovements', 'จุดที่ควรปรับปรุงเร่งด่วน'],
    ['salesCostFeasibility', 'ความเป็นไปได้ในการพัฒนายอดขาย / ลดต้นทุน / เพิ่มประสิทธิภาพ'],
    ['productMarketPotential', 'ศักยภาพในการต่อยอดผลิตภัณฑ์หรือขยายตลาด'],
    ['suggestions', 'ข้อเสนอแนะจากคณะกรรมการ'],
  ],
  [PitchingRound.ACCELERATION]: [
    ['strengths', 'จุดแข็งสำคัญของร้านและผลิตภัณฑ์'],
    ['risks', 'ประเด็นที่ต้องปรับปรุง / ความเสี่ยงสำคัญ'],
    ['conditions', 'เงื่อนไขหรือเป้าหมายหากได้รับคัดเลือก'],
    ['fundingSuggestions', 'ข้อเสนอแนะด้านวงเงินสนับสนุนและแผนพัฒนา'],
  ],
};

export const PITCHING_EXPORT_TEXT = {
  storeReportTitle: (round: string) => `รายงานผลการประเมิน Pitching — ${round}`,
  rankingTitle: (round: string) => `อันดับคะแนน Pitching — ${round}`,
  storeSection: 'ข้อมูลร้าน',
  resultSection: 'ผลการประเมินโดยรวม',
  criterionSection: 'คะแนนเฉลี่ยรายเกณฑ์',
  judgeSection: 'ผลการประเมินรายกรรมการ',
  storeCode: 'รหัสร้าน',
  storeName: 'ชื่อร้าน',
  province: 'จังหวัด',
  round: 'รอบการประเมิน',
  avgScore: 'คะแนนเฉลี่ย',
  level: 'ระดับผลการประเมิน',
  rank: 'อันดับ',
  rankedStoreCount: 'จำนวนร้านที่จัดอันดับ',
  judgeCount: 'จำนวนกรรมการ',
  judgeName: 'กรรมการ',
  totalScore: 'คะแนนรวม',
  recommendation: 'ความเห็นสรุป',
  recommendationReason: 'เหตุผลประกอบการพิจารณา',
  submittedAt: 'วันที่ส่งผล',
  criterionCode: 'ข้อ',
  criterionTitle: 'หัวข้อประเมิน',
  criterionMax: 'เต็ม',
  criterionAvg: 'เฉลี่ย',
  criterionPct: 'คิดเป็น (%)',
  score: 'คะแนน',
  note: 'หลักฐาน / ข้อสังเกต',
  minimumConditions: 'เงื่อนไขขั้นต่ำ',
  scoreCardTotal: 'Score Card 8 มิติ',
  participationPct: 'เข้าร่วม / ส่งงาน (%)',
  minimumPassed: 'ผ่าน',
  minimumFailed: 'ไม่ผ่าน',
  minimumPassedCount: 'กรรมการที่ให้ผ่านขั้นต่ำ',
  selectedCount: 'เห็นควรคัดเลือก',
  waitingListCount: 'รายชื่อสำรอง',
  minimumNotMetCount: 'ไม่ผ่านขั้นต่ำ',
  notSelectedCount: 'ยังไม่เห็นควรคัดเลือก',
  noJudge: 'ยังไม่มีแบบประเมินที่ส่งแล้วในรอบนี้',
  noStore: 'ยังไม่มีร้านที่มีแบบประเมินที่ส่งแล้วในรอบนี้',
  storeReportSheet: 'ผลการประเมิน Pitching',
  judgeSheet: 'รายกรรมการ',
  rankingSheet: 'อันดับคะแนน Pitching',
} as const;
