// سكريبت تعبئة البيانات الأولية من البرنامج الأصلي
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

async function seed() {
  const connection = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(connection);

  console.log("🌱 بدء تعبئة البيانات الأولية...");

  // 1. الأقسام
  const deptNames = [
    "بار كوفي الملقا",
    "مطبخ كوفي الملقا",
    "صالة الجلوس كوفي الملقا",
    "محل كون زون",
    "ورشة اللحام والحداده",
    "مطعم البطاطس",
    "ورشة النجارة",
    "المحاسبة",
    "الإدارة",
    "المستودع",
    "خدمة العملاء",
    "التسويق",
    "الموارد البشرية",
    "تقنية المعلومات",
  ];

  console.log("📁 إضافة الأقسام...");
  for (const name of deptNames) {
    await connection.execute(
      "INSERT IGNORE INTO departments (name, createdAt, updatedAt) VALUES (?, NOW(), NOW())",
      [name]
    );
  }
  console.log(`✅ تم إضافة ${deptNames.length} قسم`);

  // 2. المواقع
  const locNames = [
    "مؤسسة الملقا",
    "سكن الشركة",
    "سكن الفوطه",
    "الصيانة",
    "المستودع الرئيسي",
  ];

  console.log("📍 إضافة المواقع...");
  for (const name of locNames) {
    await connection.execute(
      "INSERT IGNORE INTO locations (name, createdAt, updatedAt) VALUES (?, NOW(), NOW())",
      [name]
    );
  }
  console.log(`✅ تم إضافة ${locNames.length} موقع`);

  // 3. أنواع الاستبعاد
  const exTypes = ["تالف", "مفقود", "هالك", "بيع", "تبرع", "إرجاع"];

  console.log("🏷️ إضافة أنواع الاستبعاد...");
  for (const name of exTypes) {
    await connection.execute(
      "INSERT IGNORE INTO exclusion_types (name, createdAt) VALUES (?, NOW())",
      [name]
    );
  }
  console.log(`✅ تم إضافة ${exTypes.length} نوع استبعاد`);

  // 4. الموظفين
  const employees = [
    { fullName: "أحمد محمد العلي", fingerprintId: "101", nationalId: "1098765432", phone: "0501234567" },
    { fullName: "خالد عبدالله السعيد", fingerprintId: "102", nationalId: "1087654321", phone: "0509876543" },
    { fullName: "محمد فهد الدوسري", fingerprintId: "103", nationalId: "1076543210", phone: "0551234567" },
    { fullName: "سعد ناصر القحطاني", fingerprintId: "104", nationalId: "1065432109", phone: "0559876543" },
    { fullName: "عبدالرحمن يوسف", fingerprintId: "105", nationalId: "1054321098", phone: "0561234567" },
    { fullName: "فهد سلطان المطيري", fingerprintId: "106", nationalId: "1043210987", phone: "0571234567" },
    { fullName: "عبدالله حمد الشمري", fingerprintId: "107", nationalId: "1032109876", phone: "0579876543" },
    { fullName: "ناصر عبدالعزيز", fingerprintId: "108", nationalId: "1021098765", phone: "0581234567" },
    { fullName: "يوسف إبراهيم الحربي", fingerprintId: "109", nationalId: "1010987654", phone: "0589876543" },
    { fullName: "تركي محمد العتيبي", fingerprintId: "110", nationalId: "1009876543", phone: "0591234567" },
    { fullName: "بندر خالد الزهراني", fingerprintId: "111", nationalId: "1098765431", phone: "0599876543" },
    { fullName: "ماجد سعود الغامدي", fingerprintId: "112", nationalId: "1087654320", phone: "0501112233" },
    { fullName: "حسن علي الشهري", fingerprintId: "113", nationalId: "1076543219", phone: "0502223344" },
    { fullName: "عمر فيصل البقمي", fingerprintId: "114", nationalId: "1065432108", phone: "0503334455" },
    { fullName: "رائد عادل الحارثي", fingerprintId: "115", nationalId: "1054321097", phone: "0504445566" },
  ];

  console.log("👥 إضافة الموظفين...");
  for (const emp of employees) {
    await connection.execute(
      "INSERT IGNORE INTO employees (fullName, fingerprintId, nationalId, phone, createdAt, updatedAt) VALUES (?, ?, ?, ?, NOW(), NOW())",
      [emp.fullName, emp.fingerprintId, emp.nationalId, emp.phone]
    );
  }
  console.log(`✅ تم إضافة ${employees.length} موظف`);

  // 5. الأصول
  console.log("📦 إضافة الأصول...");
  const assetsList = [
    { assetName: "جهاز كمبيوتر مكتبي Dell", assetCode: "AST-001", quantity: 3, assetValue: "4500.00", condition: "جيد جدًا", assignedTo: 1, departmentId: 1, locationId: 1, status: "ACTIVE", notes: "" },
    { assetName: "طابعة HP LaserJet", assetCode: "AST-002", quantity: 1, assetValue: "2800.00", condition: "جيد", assignedTo: 2, departmentId: 2, locationId: 1, status: "ACTIVE", notes: "" },
    { assetName: "مكيف سبليت 2 طن", assetCode: "AST-003", quantity: 5, assetValue: "12000.00", condition: "جيد", assignedTo: 3, departmentId: 5, locationId: 4, status: "ACTIVE", notes: "يحتاج صيانة دورية" },
    { assetName: "ماكينة قهوة احترافية", assetCode: "AST-004", quantity: 2, assetValue: "8500.00", condition: "جيد جدًا", assignedTo: 1, departmentId: 1, locationId: 1, status: "EXCLUDED_PARTIAL", notes: "تم استبعاد واحدة", excludedQuantity: 1 },
    { assetName: "ثلاجة عرض تجارية", assetCode: "AST-005", quantity: 1, assetValue: "6200.00", condition: "جيد جدًا", assignedTo: 4, departmentId: 4, locationId: 1, status: "ACTIVE", notes: "" },
    { assetName: "جهاز كاشير", assetCode: "AST-006", quantity: 2, assetValue: "3200.00", condition: "جيد", assignedTo: 4, departmentId: 4, locationId: 1, status: "ACTIVE", notes: "" },
    { assetName: "كاميرا مراقبة", assetCode: "AST-007", quantity: 8, assetValue: "1200.00", condition: "جيد جدًا", assignedTo: 1, departmentId: 1, locationId: 1, status: "ACTIVE", notes: "" },
    { assetName: "فرن صناعي", assetCode: "AST-008", quantity: 1, assetValue: "15000.00", condition: "متهالك", assignedTo: 5, departmentId: 6, locationId: 1, status: "EXCLUDED_FULL", notes: "تم استبعاده بالكامل - تالف", excludedQuantity: 1 },
    { assetName: "غسالة صناعية", assetCode: "AST-009", quantity: 2, assetValue: "7500.00", condition: "جيد", assignedTo: 6, departmentId: 2, locationId: 1, status: "ACTIVE", notes: "" },
    { assetName: "مولد كهربائي", assetCode: "AST-010", quantity: 1, assetValue: "25000.00", condition: "جيد جدًا", assignedTo: 7, departmentId: 5, locationId: 4, status: "ACTIVE", notes: "" },
    { assetName: "ماكينة لحام كهربائية", assetCode: "AST-011", quantity: 3, assetValue: "4200.00", condition: "جيد", assignedTo: 3, departmentId: 5, locationId: 4, status: "ACTIVE", notes: "" },
    { assetName: "منشار خشب كهربائي", assetCode: "AST-012", quantity: 2, assetValue: "3500.00", condition: "جيد", assignedTo: 8, departmentId: 7, locationId: 4, status: "ACTIVE", notes: "" },
  ];

  for (const asset of assetsList) {
    await connection.execute(
      `INSERT INTO assets (assetName, assetCode, quantity, assetValue, \`condition\`, assignedTo, departmentId, locationId, status, notes, excludedQuantity, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        asset.assetName, asset.assetCode, asset.quantity, asset.assetValue,
        asset.condition, asset.assignedTo, asset.departmentId, asset.locationId,
        asset.status, asset.notes, asset.excludedQuantity || 0,
      ]
    );
  }
  console.log(`✅ تم إضافة ${assetsList.length} أصل`);

  // 6. العهد
  console.log("🤝 إضافة العهد...");
  const custodyList = [
    { name: "مفاتيح المحل", code: "CUS-001", quantity: 3, assetValue: "150.00", condition: "جيد جدًا", assignedTo: 1, departmentId: 1, locationId: 1, status: "ACTIVE", notes: "" },
    { name: "هاتف جوال سامسونج", code: "CUS-002", quantity: 1, assetValue: "2500.00", condition: "جيد", assignedTo: 2, departmentId: 2, locationId: 1, status: "ACTIVE", notes: "" },
    { name: "بدلة عمل", code: "CUS-003", quantity: 5, assetValue: "350.00", condition: "جيد", assignedTo: 3, departmentId: 5, locationId: 4, status: "ACTIVE", notes: "" },
    { name: "عدة صيانة كاملة", code: "CUS-004", quantity: 2, assetValue: "1200.00", condition: "جيد", assignedTo: 3, departmentId: 5, locationId: 4, status: "EXCLUDED_PARTIAL", notes: "تم استبعاد واحدة", excludedQuantity: 1 },
    { name: "لابتوب Lenovo", code: "CUS-005", quantity: 1, assetValue: "3800.00", condition: "جيد جدًا", assignedTo: 4, departmentId: 4, locationId: 1, status: "ACTIVE", notes: "" },
    { name: "جهاز لاسلكي", code: "CUS-006", quantity: 4, assetValue: "800.00", condition: "جيد جدًا", assignedTo: 1, departmentId: 1, locationId: 1, status: "ACTIVE", notes: "" },
    { name: "حقيبة أدوات", code: "CUS-007", quantity: 2, assetValue: "450.00", condition: "جيد", assignedTo: 6, departmentId: 7, locationId: 4, status: "ACTIVE", notes: "" },
    { name: "جهاز قياس حرارة", code: "CUS-008", quantity: 3, assetValue: "600.00", condition: "جيد جدًا", assignedTo: 7, departmentId: 6, locationId: 1, status: "ACTIVE", notes: "" },
  ];

  for (const item of custodyList) {
    await connection.execute(
      `INSERT INTO custody_items (name, code, quantity, assetValue, \`condition\`, assignedTo, departmentId, locationId, status, notes, excludedQuantity, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        item.name, item.code, item.quantity, item.assetValue,
        item.condition, item.assignedTo, item.departmentId, item.locationId,
        item.status, item.notes, item.excludedQuantity || 0,
      ]
    );
  }
  console.log(`✅ تم إضافة ${custodyList.length} عهدة`);

  console.log("\n🎉 تم تعبئة جميع البيانات الأولية بنجاح!");
  await connection.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ خطأ في تعبئة البيانات:", err);
  process.exit(1);
});
