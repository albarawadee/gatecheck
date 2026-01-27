// server/prisma/seed.js
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const USERS = [
  // 2 Admin
  { email: "admin1@graduation.local", role: "ADMIN", password: "bara0000" },
  { email: "admin2@graduation.local", role: "ADMIN", password: "alaa1111" },

  // 8 Organizers
  { email: "org1@graduation.local", role: "ORGANIZER", password: "1010101010" },
  { email: "org2@graduation.local", role: "ORGANIZER", password: "3929293143" },
  { email: "org3@graduation.local", role: "ORGANIZER", password: "4934232345" },
  { email: "org4@graduation.local", role: "ORGANIZER", password: "4594593459" },
  { email: "org5@graduation.local", role: "ORGANIZER", password: "3492349393" },
  { email: "org6@graduation.local", role: "ORGANIZER", password: "4045034504" },
  { email: "org7@graduation.local", role: "ORGANIZER", password: "4503450345" },
  { email: "org8@graduation.local", role: "ORGANIZER", password: "4503450435" },
];

async function main() {
  console.log("Seeding users...");

  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);

    await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role }, // تحديث الدور فقط
      create: {
        email: u.email,
        role: u.role,
        passwordHash,
      },
    });
  }

  console.log("✅ Done. Users created/updated.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
