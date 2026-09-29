import 'dotenv/config';
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

async function cleanupData() {
  console.log("🔄 بدء حذف البيانات التجريبية...");
  
  const connection = await mysql.createConnection(DATABASE_URL);
  
  try {
    // تعطيل فحص المفاتيح الأجنبية مؤقتاً
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
    
    // حذف البيانات بالترتيب الصحيح (من الجداول الفرعية إلى الأساسية)
    const tables = [
      'archive_audit',
      'archive_documents',
      'audit_log',
      'exclusion_sequence',
      'clearance_records',
      'asset_exclusions',
      'asset_transfers',
      'custody_documents',
      'asset_documents',
      'custody_items',
      'assets',
      'employees',
      'exclusion_types',
      'departments',
      'locations',
    ];
    
    for (const table of tables) {
      const [result] = await connection.execute(`DELETE FROM \`${table}\``);
      console.log(`  ✅ ${table}: حذف ${result.affectedRows} سجل`);
    }
    
    // حذف المستخدمين ما عدا admin
    const [usersResult] = await connection.execute(
      "DELETE FROM `users` WHERE `username` != 'admin' OR `username` IS NULL"
    );
    console.log(`  ✅ users: حذف ${usersResult.affectedRows} مستخدم (الإبقاء على admin)`);
    
    // إعادة تفعيل فحص المفاتيح الأجنبية
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
    
    // التحقق من وجود مستخدم admin
    const [adminRows] = await connection.execute(
      "SELECT id, username, name, role FROM `users` WHERE `username` = 'admin'"
    );
    
    if (adminRows.length > 0) {
      console.log(`\n✅ مستخدم admin موجود: ${JSON.stringify(adminRows[0])}`);
    } else {
      console.log("\n⚠️ مستخدم admin غير موجود!");
    }
    
    console.log("\n🎉 تم حذف جميع البيانات التجريبية بنجاح!");
    
  } catch (error) {
    console.error("❌ خطأ:", error.message);
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    await connection.end();
  }
}

cleanupData();
