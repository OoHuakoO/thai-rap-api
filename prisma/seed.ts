import 'dotenv/config';
import { PrismaClient, type PitchingRound } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL as string) });

interface DimensionSeed {
  id: number;
  name: string;
  nameEn: string;
  weight: number;
  questions: string[];
}

// Question numbers run globally 1–50 across dimensions (not reset per dimension) —
// this is required for the red-flag detection ranges in project-conventions.md
// (e.g. questions 8–14, 28–31, 35/36/39/41) to line up correctly.
const DIMENSIONS: DimensionSeed[] = [
  {
    id: 1,
    name: 'คุณภาพอาหารและนวัตกรรมเมนู',
    nameEn: 'Food Quality & Menu Innovation',
    weight: 12,
    questions: [
      'ร้านมีเมนูหลักที่ขายดีและลูกค้าจดจำได้ชัดเจน',
      'รสชาติอาหารมีความสม่ำเสมอ',
      'มีสูตรมาตรฐานหรือวิธีทำที่บันทึกไว้',
      'วัตถุดิบหลักมีคุณภาพและควบคุมความสดได้',
      'เมนูมีจุดเด่นหรืออัตลักษณ์เฉพาะของร้าน',
      'มีการรับฟังความคิดเห็นลูกค้าเพื่อนำมาปรับเมนู',
      'มีโอกาสพัฒนาเมนู Signature หรือเมนูใหม่เพื่อเพิ่มยอดขาย',
    ],
  },
  {
    id: 2,
    name: 'ความปลอดภัยอาหารและมาตรฐาน',
    nameEn: 'Food Safety & Standards',
    weight: 15,
    questions: [
      'พื้นที่ครัวสะอาด เป็นระเบียบ และแยกโซนเหมาะสม',
      'มีการจัดเก็บวัตถุดิบสด แห้ง และปรุงสุกอย่างถูกสุขลักษณะ',
      'เจ้าของร้านหรือพนักงานมีความรู้พื้นฐานด้านสุขอนามัยอาหาร',
      'มีการควบคุมวันหมดอายุของวัตถุดิบ',
      'อุปกรณ์ครัว ภาชนะ และพื้นที่บริการสะอาดพร้อมใช้งาน',
      'ร้านมีใบอนุญาตหรือเอกสารที่เกี่ยวข้องกับการจำหน่ายอาหาร',
      'มีแนวทางป้องกันความเสี่ยง เช่น อาหารเสีย ปนเปื้อน หรือข้อร้องเรียนด้านสุขภาพ',
    ],
  },
  {
    id: 3,
    name: 'แบรนด์และโมเดลธุรกิจ',
    nameEn: 'Brand & Business Model',
    weight: 10,
    questions: [
      'ร้านมีชื่อ แบรนด์ หรือภาพจำที่ชัดเจน',
      'ร้านอธิบายได้ว่าลูกค้ามากินร้านนี้เพราะอะไร',
      'กลุ่มลูกค้าเป้าหมายของร้านมีความชัดเจน',
      'ร้านมีเรื่องเล่าที่เชื่อมโยงกับอาหาร ท้องถิ่น หรือเจ้าของร้าน',
      'รูปแบบรายได้ของร้านชัดเจน เช่น หน้าร้าน เดลิเวอรี Catering หรือออกบูธ',
      'ร้านมีแนวคิดในการต่อยอด เช่น สินค้าพร้อมขาย แพ็กเกจจิ้ง หรือแฟรนไชส์',
    ],
  },
  {
    id: 4,
    name: 'การตลาดและฐานลูกค้า',
    nameEn: 'Marketing & Customer Base',
    weight: 13,
    questions: [
      'ร้านมีช่องทางออนไลน์ เช่น Facebook, TikTok, LINE OA หรือ Google Maps',
      'ข้อมูลร้านออนไลน์ถูกต้อง เช่น เวลาเปิด–ปิด เบอร์โทร พิกัด และเมนู',
      'มีภาพอาหารหรือคอนเทนต์ที่ช่วยกระตุ้นยอดขาย',
      'ร้านมีฐานลูกค้าประจำหรือมีวิธีทำให้ลูกค้ากลับมาซื้อซ้ำ',
      'มีการทำโปรโมชันหรือกิจกรรมการตลาดอย่างเหมาะสม',
      'ร้านรู้ว่าช่องทางใดสร้างยอดขายดีที่สุด',
      'ร้านมีโอกาสขยายตลาดใหม่ เช่น เดลิเวอรี ออกงาน หน่วยงาน โรงแรม หรือการท่องเที่ยว',
    ],
  },
  {
    id: 5,
    name: 'การเงิน ต้นทุน และกำไร',
    nameEn: 'Finance, Cost & Profit',
    weight: 20,
    questions: [
      'ร้านรู้ต้นทุนวัตถุดิบของเมนูหลัก',
      'ร้านตั้งราคาขายโดยอิงต้นทุนและกำไร',
      'ร้านแยกเงินร้านกับเงินส่วนตัวออกจากกัน',
      'มีการบันทึกรายรับ–รายจ่ายอย่างสม่ำเสมอ',
      'ร้านรู้ยอดขายเฉลี่ยต่อวันและต่อเดือน',
      'ร้านรู้ว่าเมนูใดกำไรดี และเมนูใดควรปรับราคา',
      'ร้านมีเงินหมุนเวียนเพียงพอสำหรับวัตถุดิบ ค่าแรง ค่าเช่า และค่าใช้จ่ายจำเป็น',
    ],
  },
  {
    id: 6,
    name: 'ระบบปฏิบัติการร้านและการบริการ',
    nameEn: 'Operations & Service',
    weight: 18,
    questions: [
      'ร้านมีขั้นตอนการเปิดร้าน–ปิดร้านที่ชัดเจน',
      'มีการแบ่งหน้าที่ของเจ้าของร้าน พนักงานครัว และพนักงานบริการ',
      'เวลาการออกอาหารเหมาะสม ไม่ทำให้ลูกค้ารอนานเกินไป',
      'มีมาตรฐานการบริการ เช่น ต้อนรับ รับออเดอร์ เสิร์ฟอาหาร และรับชำระเงิน',
      'มีระบบจัดการสต็อกวัตถุดิบเพื่อลดของเสีย',
      'ร้านรับมือช่วงลูกค้าเยอะได้โดยคุณภาพไม่ตก',
      'มีระบบจัดการข้อร้องเรียนของลูกค้า',
    ],
  },
  {
    id: 7,
    name: 'เครือข่าย วัตถุดิบ และห่วงโซ่อุปทาน',
    nameEn: 'Network, Ingredients & Supply Chain',
    weight: 5,
    questions: [
      'ร้านมีแหล่งวัตถุดิบประจำที่เชื่อถือได้',
      'มีการใช้วัตถุดิบท้องถิ่นหรือวัตถุดิบเด่นของพื้นที่',
      'ร้านมีซัพพลายเออร์สำรอง หากวัตถุดิบหลักขาดตลาด',
      'มีความร่วมมือกับชุมชน กลุ่มเกษตรกร หรือผู้ผลิตท้องถิ่น',
      'ร้านมีความเชื่อมโยงกับหน่วยงาน ภาคี หรือเครือข่ายธุรกิจในพื้นที่',
    ],
  },
  {
    id: 8,
    name: 'ความพร้อมเติบโตและเข้าร่วมโครงการ',
    nameEn: 'Growth Readiness & Program Participation',
    weight: 7,
    questions: [
      'เจ้าของร้านมีความตั้งใจและเปิดรับการเปลี่ยนแปลง',
      'ร้านพร้อมให้ทีมโครงการลงพื้นที่ ตรวจประเมิน และให้คำปรึกษาแบบ 1-on-1',
      'ร้านสามารถจัดเตรียมข้อมูลสำคัญ เช่น รูปเมนู รูปร้าน ยอดขาย ต้นทุน และปัญหาหลัก',
      'ร้านมีเป้าหมายการพัฒนาภายใน 3–6 เดือน เช่น เพิ่มยอดขาย ลดต้นทุน ปรับเมนู ทำแบรนด์ หรือขยายช่องทางขาย',
    ],
  },
];

// THAI-RAP covers ภาคตะวันออก only — 8 provinces, not the full 77.
const PROVINCES: string[] = [
  'จันทบุรี',
  'ฉะเชิงเทรา',
  'ชลบุรี',
  'ตราด',
  'ปราจีนบุรี',
  'ระยอง',
  'สระแก้ว',
  'นครนายก',
];

async function seedProvinces(): Promise<void> {
  if (PROVINCES.length !== 8) {
    throw new Error(`Expected 8 provinces, got ${PROVINCES.length}`);
  }
  for (const nameTh of PROVINCES) {
    await prisma.province.upsert({
      where: { nameTh },
      update: {},
      create: { nameTh },
    });
  }
  console.log(`Seeded ${PROVINCES.length} provinces.`);
}

// The ประเภทร้าน list from the THAI-RAP intake workbook (sheet 06_Lists).
const STORE_TYPES: string[] = ['อาหารไทย', 'อาหารทะเล', 'คาเฟ่', 'เดลิเวอรี', 'Catering', 'อื่น ๆ'];

async function seedStoreTypes(): Promise<void> {
  for (const nameTh of STORE_TYPES) {
    await prisma.storeType.upsert({
      where: { nameTh },
      update: {},
      create: { nameTh },
    });
  }
  console.log(`Seeded ${STORE_TYPES.length} store types.`);
}

interface PitchingCriterionSeed {
  id: number;
  round: PitchingRound;
  code: string;
  section: string | null;
  title: string;
  guideline: string;
  maxScore: number;
}

// Transcribed from the two paper forms. Ids are pinned per round (1xx / 2xx) so
// a stored PitchingScore never points at a different criterion; adding a row
// means taking the next free id in that block, never renumbering.
const PITCHING_CRITERIA: PitchingCriterionSeed[] = [
  {
    id: 101,
    round: 'PITCH_DECK',
    code: '1',
    section: null,
    title: 'แนะนำร้านและข้อมูลพื้นฐาน',
    guideline:
      'บอกได้ชัดเจนว่าร้านคือใคร ชื่อร้าน โลโก้ ที่ตั้ง ประเภทอาหาร อายุร้าน จำนวนพนักงาน และภาพรวมกิจการ',
    maxScore: 5,
  },
  {
    id: 102,
    round: 'PITCH_DECK',
    code: '2',
    section: null,
    title: 'จุดแข็งและอัตลักษณ์ของร้าน',
    guideline:
      'มี USP ชัดเจน เมนูเด่นมีเอกลักษณ์ ใช้วัตถุดิบท้องถิ่นหรือเรื่องเล่าที่สร้างความแตกต่างจากคู่แข่ง',
    maxScore: 15,
  },
  {
    id: 103,
    round: 'PITCH_DECK',
    code: '3',
    section: null,
    title: 'ตัวเลขการเงินปัจจุบัน',
    guideline:
      'นำเสนอรายได้ต่อเดือน Food Cost กำไรสุทธิ หรือต้นทุนสำคัญอย่างตรงไปตรงมา มีความเข้าใจตัวเลขของร้าน',
    maxScore: 15,
  },
  {
    id: 104,
    round: 'PITCH_DECK',
    code: '4',
    section: null,
    title: 'ลูกค้าและตลาด',
    guideline:
      'ระบุกลุ่มลูกค้าหลัก ช่องทางขายปัจจุบัน พฤติกรรมลูกค้า และกลุ่มตลาดใหม่ที่อยากขยายได้ชัดเจน',
    maxScore: 10,
  },
  {
    id: 105,
    round: 'PITCH_DECK',
    code: '5',
    section: null,
    title: 'แผนทำร้านให้แข็งแรง',
    guideline:
      'มีแผนพัฒนาระบบร้าน เช่น SOP ต้นทุน เมนู การบริการ และมีเป้าหมายยอดขายหรือเป้าหมายพัฒนาใน 3–6 เดือน',
    maxScore: 15,
  },
  {
    id: 106,
    round: 'PITCH_DECK',
    code: '6',
    section: null,
    title: 'ไอเดียผลิตภัณฑ์ที่อยากต่อยอด',
    guideline:
      'ระบุเมนูหรือผลิตภัณฑ์ที่ต้องการพัฒนาได้ชัดเจน มีความน่าสนใจ มีตลาดเป้าหมาย และมีโอกาสต่อยอดเชิงพาณิชย์',
    maxScore: 10,
  },
  {
    id: 107,
    round: 'PITCH_DECK',
    code: '7',
    section: null,
    title: 'ศักยภาพการขยายธุรกิจ',
    guideline:
      'มองเห็นทิศทางการเติบโต เช่น สาขา แฟรนไชส์ Modern Trade เดลิเวอรี ออกบูธ หรือส่งออกอย่างสมเหตุสมผล',
    maxScore: 10,
  },
  {
    id: 108,
    round: 'PITCH_DECK',
    code: '8',
    section: null,
    title: 'ทีมและความพร้อมของผู้ประกอบการ',
    guideline:
      'ทีมมีประสบการณ์ มีความเข้าใจธุรกิจ พร้อมเรียนรู้ ปรับตัว และลงมือพัฒนาร้านต่อเนื่อง',
    maxScore: 10,
  },
  {
    id: 109,
    round: 'PITCH_DECK',
    code: '9',
    section: null,
    title: 'สิ่งที่ต้องการจากโครงการ',
    guideline:
      'ระบุความต้องการความช่วยเหลือได้ตรงจุด เช่น R&D บรรจุภัณฑ์ มาตรฐาน อย. การเงิน การตลาด หรือช่องทางขาย',
    maxScore: 5,
  },
  {
    id: 110,
    round: 'PITCH_DECK',
    code: '10',
    section: null,
    title: 'เหตุผลที่ควรได้รับคัดเลือก',
    guideline:
      'สื่อสารได้ชัดเจนว่าทำไมร้านนี้ควรไปต่อ มีความมุ่งมั่น มีเป้าหมายวัดผลได้จริงใน 3 เดือน',
    maxScore: 5,
  },

  {
    id: 201,
    round: 'ACCELERATION',
    code: '1.1',
    section: 'A',
    title: 'ผล Score Card 8 มิติ',
    guideline: '10 = 36–40, 8 = 33–35, 6 = 30–32, 0–5 = ต่ำกว่า 30 (ไม่ผ่านขั้นต่ำ)',
    maxScore: 10,
  },
  {
    id: 202,
    round: 'ACCELERATION',
    code: '1.2',
    section: 'A',
    title: 'ระบบหลังบ้านเป็นมาตรฐาน',
    guideline:
      'SOP/สูตรมาตรฐาน ต้นทุน-ราคาขาย บัญชีและสต๊อกที่ใช้จริง: 9–10 = ครบ/ตรวจสอบได้, 6–8 = มีเกือบครบ, 3–5 = มีบางส่วน, 0–2 = ไม่มีหลักฐาน',
    maxScore: 10,
  },
  {
    id: 203,
    round: 'ACCELERATION',
    code: '2.1',
    section: 'A',
    title: 'นำความรู้ไปปรับใช้จริง',
    guideline:
      'มีหลักฐานปรับราคา ต้นทุน เมนู กระบวนการ บริการหรือการตลาด: 7–8 = ชัดหลายด้าน, 4–6 = ชัดบางด้าน, 1–3 = เริ่มดำเนินการ, 0 = ไม่มี',
    maxScore: 8,
  },
  {
    id: 204,
    round: 'ACCELERATION',
    code: '2.2',
    section: 'A',
    title: 'บันทึกข้อมูลธุรกิจสม่ำเสมอ',
    guideline:
      'ยอดขาย ต้นทุน กำไร เงินสดหรือสต๊อก: 5–6 = สม่ำเสมอและใช้ตัดสินใจ, 3–4 = ค่อนข้างต่อเนื่อง, 1–2 = ไม่สม่ำเสมอ, 0 = ไม่มี',
    maxScore: 6,
  },
  {
    id: 205,
    round: 'ACCELERATION',
    code: '2.3',
    section: 'A',
    title: 'เข้าร่วมและส่งงานมีคุณภาพ',
    guideline:
      '6 = ≥95% และคุณภาพดี, 4–5 = 90–94% และงานครบ, 0–3 = ต่ำกว่า 90%/งานไม่ครบ (ไม่ผ่านขั้นต่ำ)',
    maxScore: 6,
  },
  {
    id: 206,
    round: 'ACCELERATION',
    code: '3.1',
    section: 'B',
    title: 'Market Validation',
    guideline:
      'หลักฐานยอดขายทดลอง การสั่งซื้อซ้ำ แบบสอบถาม ลูกค้าทดลอง/หนังสือแสดงความสนใจ: 7–8 = ชัดหลายแหล่ง, 4–6 = เพียงพอ, 1–3 = สมมติฐาน, 0 = ไม่มี',
    maxScore: 8,
  },
  {
    id: 207,
    round: 'ACCELERATION',
    code: '3.2',
    section: 'B',
    title: 'กลุ่มเป้าหมายและช่องทางขาย',
    guideline:
      'ลูกค้า ขนาด/พฤติกรรมตลาด ช่องทางและแผนเข้าถึง: 5–6 = ชัด/สอดคล้อง, 3–4 = ค่อนข้างชัด, 1–2 = ยังกว้าง, 0 = ไม่ชัด',
    maxScore: 6,
  },
  {
    id: 208,
    round: 'ACCELERATION',
    code: '3.3',
    section: 'B',
    title: 'จุดขายและความแตกต่าง',
    guideline:
      'USP/คุณค่าที่ลูกค้าได้รับ อัตลักษณ์หรือข้อได้เปรียบ: 5–6 = แตกต่างชัด, 3–4 = มีจุดต่าง, 1–2 = ใกล้คู่แข่ง, 0 = ไม่ระบุ',
    maxScore: 6,
  },
  {
    id: 209,
    round: 'ACCELERATION',
    code: '4.1',
    section: 'B',
    title: 'กระบวนการผลิตทำซ้ำได้',
    guideline:
      'สูตรมาตรฐาน ขั้นตอนควบคุมคุณภาพ จุดวิกฤต/ผู้รับผิดชอบ: 7–8 = ครบและทดลองใช้, 4–6 = มีระบบส่วนใหญ่, 1–3 = พึ่งบุคคล, 0 = ไม่มี',
    maxScore: 8,
  },
  {
    id: 210,
    round: 'ACCELERATION',
    code: '4.2',
    section: 'B',
    title: 'ขยายกำลังผลิตได้',
    guideline:
      'วัตถุดิบ เครื่องมือ พื้นที่ บุคลากรและกำลังผลิต: 4 = พร้อม, 3 = มีแผนชัด, 1–2 = มีข้อจำกัด, 0 = ไม่มีแผน',
    maxScore: 4,
  },
  {
    id: 211,
    round: 'ACCELERATION',
    code: '4.3',
    section: 'B',
    title: 'ความพร้อมด้านมาตรฐาน',
    guideline:
      'สถานะและแผน GMP/HACCP/อย. หรือมาตรฐานที่เกี่ยวข้อง พร้อมเวลา/ผู้รับผิดชอบ: 5 = พร้อม/ดำเนินการ, 3–4 = แผนชัด, 1–2 = แผนกว้าง, 0 = ไม่มี',
    maxScore: 5,
  },
  {
    id: 212,
    round: 'ACCELERATION',
    code: '4.4',
    section: 'B',
    title: 'บรรจุภัณฑ์เหมาะสม',
    guideline:
      'เหมาะกับสินค้า อายุสินค้า ขนส่ง ฉลาก ต้นทุนและภาพลักษณ์: 3 = มีต้นแบบเหมาะสม, 2 = แนวทางชัด, 1 = แนวคิดเบื้องต้น, 0 = ไม่มี',
    maxScore: 3,
  },
  {
    id: 213,
    round: 'ACCELERATION',
    code: '5.1',
    section: 'B',
    title: 'แผนธุรกิจและยอดขายเติบโต',
    guideline:
      'เป้าหมายยอดขาย ช่องทาง สมมติฐานและระยะเวลา: 5–6 = ชัด/วัดผลได้, 3–4 = สมเหตุผลแต่ข้อมูลยังไม่ครบ, 1–2 = กว้าง, 0 = ไม่มี',
    maxScore: 6,
  },
  {
    id: 214,
    round: 'ACCELERATION',
    code: '5.2',
    section: 'B',
    title: 'รายได้ ต้นทุน กำไรและเงินสด',
    guideline:
      'ประมาณการเชื่อมกับตลาด/กำลังผลิต ระบุเงินลงทุนและทุนหมุนเวียน: 5–6 = ครบ/ตรวจสอบได้, 3–4 = มีข้อมูลหลัก, 1–2 = ไม่ครบ, 0 = ไม่มี',
    maxScore: 6,
  },
  {
    id: 215,
    round: 'ACCELERATION',
    code: '5.3',
    section: 'B',
    title: 'Unit Economics',
    guideline:
      'กำไรต่อหน่วย/Contribution Margin เป็นบวกหรือมีแผนให้เป็นบวก รวมจุดคุ้มทุน: 5–6 = บวก/มีหลักฐาน, 3–4 = แนวโน้มบวก, 1–2 = เสี่ยง, 0 = ไม่คำนวณ',
    maxScore: 6,
  },
  {
    id: 216,
    round: 'ACCELERATION',
    code: '5.4',
    section: 'B',
    title: 'แผนใช้วงเงินและความเสี่ยง',
    guideline:
      'รายการใช้จ่ายเชื่อมกับผลลัพธ์และมีมาตรการความเสี่ยง: 2 = ชัด, 1 = พอใช้, 0 = ไม่ชัด',
    maxScore: 2,
  },
];

async function seedPitchingCriteria(): Promise<void> {
  // Both forms are scored out of 100 — a round whose maxScores no longer sum to
  // 100 would silently rescale every stored total against the paper form.
  for (const round of ['PITCH_DECK', 'ACCELERATION'] as const) {
    const total = PITCHING_CRITERIA.filter((c) => c.round === round).reduce(
      (sum, c) => sum + c.maxScore,
      0,
    );
    if (total !== 100) throw new Error(`${round} criteria must sum to 100, got ${total}`);
  }

  let sortOrder = 0;
  for (const criterion of PITCHING_CRITERIA) {
    sortOrder += 1;
    const data = {
      round: criterion.round,
      code: criterion.code,
      section: criterion.section,
      title: criterion.title,
      guideline: criterion.guideline,
      maxScore: criterion.maxScore,
      sortOrder,
    };
    await prisma.pitchingCriterion.upsert({
      where: { id: criterion.id },
      update: data,
      create: { id: criterion.id, ...data },
    });
  }
  console.log(`Seeded ${PITCHING_CRITERIA.length} pitching criteria.`);
}

async function main(): Promise<void> {
  await seedProvinces();
  await seedStoreTypes();
  await seedPitchingCriteria();

  const totalWeight = DIMENSIONS.reduce((sum, d) => sum + d.weight, 0);
  const totalQuestions = DIMENSIONS.reduce((sum, d) => sum + d.questions.length, 0);
  if (totalWeight !== 100) throw new Error(`Dimension weights must sum to 100, got ${totalWeight}`);
  if (totalQuestions !== 50) throw new Error(`Expected 50 questions total, got ${totalQuestions}`);

  let questionNo = 0;
  for (const dimension of DIMENSIONS) {
    await prisma.dimension.upsert({
      where: { id: dimension.id },
      update: {
        name: dimension.name,
        nameEn: dimension.nameEn,
        weight: dimension.weight,
        questionCount: dimension.questions.length,
      },
      create: {
        id: dimension.id,
        name: dimension.name,
        nameEn: dimension.nameEn,
        weight: dimension.weight,
        questionCount: dimension.questions.length,
      },
    });

    for (const questionText of dimension.questions) {
      questionNo += 1;
      await prisma.question.upsert({
        where: { id: questionNo },
        update: { dimensionId: dimension.id, questionNo, questionText, maxScore: 4 },
        create: {
          id: questionNo,
          dimensionId: dimension.id,
          questionNo,
          questionText,
          maxScore: 4,
        },
      });
    }
  }

  console.log(`Seeded ${DIMENSIONS.length} dimensions and ${questionNo} questions.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
