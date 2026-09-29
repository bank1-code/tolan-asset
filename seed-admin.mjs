import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const db = drizzle(process.env.DATABASE_URL);

async function seedAdmin() {
  try {
    // Check if admin exists
    const [existing] = await db.execute(
      `SELECT id FROM users WHERE username = 'admin' LIMIT 1`
    );
    
    if (existing && Array.isArray(existing) && existing.length > 0) {
      console.log("Admin user already exists, updating password...");
      const hash = await bcrypt.hash("ADMIN1", 10);
      await db.execute(
        `UPDATE users SET passwordHash = '${hash}', role = 'admin', name = 'سوبر أدمن', loginMethod = 'local' WHERE username = 'admin'`
      );
      console.log("Admin password updated successfully!");
    } else {
      console.log("Creating admin user...");
      const hash = await bcrypt.hash("ADMIN1", 10);
      const openId = `local_admin_${Date.now()}`;
      await db.execute(
        `INSERT INTO users (openId, username, passwordHash, name, role, loginMethod, lastSignedIn) VALUES ('${openId}', 'admin', '${hash}', 'سوبر أدمن', 'admin', 'local', NOW())`
      );
      console.log("Admin user created successfully!");
    }
    
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

seedAdmin();
