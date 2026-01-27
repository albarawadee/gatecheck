const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const adminEmail = "admin@example.com";
  const staffEmail = "staff@example.com";

  const adminPass = "Admin@12345";
  const staffPass = "Staff@12345";

  const adminHash = await bcrypt.hash(adminPass, 10);
  const staffHash = await bcrypt.hash(staffPass, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash: adminHash, role: "ADMIN" },
    create: { email: adminEmail, passwordHash: adminHash, role: "ADMIN" },
  });

  await prisma.user.upsert({
    where: { email: staffEmail },
    update: { passwordHash: staffHash, role: "ORGANIZER" },
    create: { email: staffEmail, passwordHash: staffHash, role: "ORGANIZER" },
  });

  console.log("Seeded users:");
  console.log("ADMIN:", adminEmail, adminPass);
  console.log("ORGANIZER:", staffEmail, staffPass);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
