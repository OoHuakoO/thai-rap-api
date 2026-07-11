import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
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

async function main(): Promise<void> {
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
