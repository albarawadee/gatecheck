require("dotenv").config();
const bcrypt = require("bcryptjs");
const supabase = require("./supabase");

async function upsertUser(u) {
  // نجيب المستخدم لو موجود
  const { data: existing, error: findErr } = await supabase
    .from("users")
    .select("id,email")
    .eq("email", u.email)
    .limit(1);

  if (findErr) throw findErr;

  const passwordHash = await bcrypt.hash(String(u.password), 10);

  const payload = {
    email: u.email,
    name: u.name,
    role: u.role,
    passwordHash,
  };

  if (existing && existing.length) {
    const { error: updErr } = await supabase
      .from("users")
      .update(payload)
      .eq("email", u.email);
    if (updErr) throw updErr;
    return "updated";
  } else {
    const { error: insErr } = await supabase.from("users").insert(payload);
    if (insErr) throw insErr;
    return "inserted";
  }
}

async function main() {
  const users = [
    // 2 Admin
    { email: "admin1@graduation.local", name: "albara", role: "ADMIN", password: "bara0000" },
    { email: "admin2@graduation.local", name: "alaa", role: "ADMIN", password: "alaa1111" },

    // 8 Organizers
    { email: "org1@graduation.local", name: "Organizer 1", role: "ORGANIZER", password: "1010101010" },
    { email: "org2@graduation.local", name: "Organizer 2", role: "ORGANIZER", password: "3929293143" },
    { email: "org3@graduation.local", name: "Organizer 3", role: "ORGANIZER", password: "4934232345" },
    { email: "org4@graduation.local", name: "Organizer 4", role: "ORGANIZER", password: "4594593459" },
    { email: "org5@graduation.local", name: "Organizer 5", role: "ORGANIZER", password: "3492349393" },
    { email: "org6@graduation.local", name: "Organizer 6", role: "ORGANIZER", password: "4045034504" },
    { email: "org7@graduation.local", name: "Organizer 7", role: "ORGANIZER", password: "4503450345" },
    { email: "org8@graduation.local", name: "Organizer 8", role: "ORGANIZER", password: "4503450435" },
  ];

  console.log("Seeding users to Supabase...");

  let ins = 0, upd = 0;
  for (const u of users) {
    const r = await upsertUser(u);
    if (r === "inserted") ins++;
    if (r === "updated") upd++;
  }

  console.log(`✅ Done. Inserted: ${ins}, Updated: ${upd}`);
}

main().catch((e) => {
  console.error("❌ Seed failed:", e?.message || e);
  process.exit(1);
});
