/**
 * Graduation Ceremony - GateCheck Server (FULL)
 * - Auth: JWT in httpOnly cookie
 * - Roles: ADMIN / ORGANIZER (string)
 * - Scan: QR payload = checkinToken (unique)
 * - Seat Search: lookup guests by seat number
 * - Check / Check All by seat
 * - Admin:
 *   - Import Excel + store file on server (uploads/guest_list.xlsx)
 *   - Add Guest + generate token + QR data URL
 *   - Edit guest name
 *   - Undo check-in
 *   - Delete all data (confirmation required)
 *   - Export Excel (who checked in / who didn’t)
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const QRCode = require("qrcode");
const xlsx = require("xlsx");

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const app = express();

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

// CORS origins
const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
];
const ORIGINS = (process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : DEFAULT_ORIGINS).map((s) =>
  s.trim()
);

app.use(cors({ origin: ORIGINS, credentials: true }));
app.use(express.json({ limit: "4mb" }));
app.use(cookieParser());

// multer (memory)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ---------- Auth helpers ----------
function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}

function readAuth(req) {
  const token = req.cookies?.session || "";
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const claims = readAuth(req);
  if (!claims) return res.status(401).json({ error: "Unauthorized" });
  req.user = claims;
  next();
}

function requireAdmin(req, res, next) {
  const claims = readAuth(req);
  if (!claims) return res.status(401).json({ error: "Unauthorized" });
  if (claims.role !== "ADMIN") return res.status(403).json({ error: "Forbidden" });
  req.user = claims;
  next();
}

// ---------- Excel import parsing ----------
function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function getCell(row, idxMap, keys, fallback = "") {
  for (const k of keys) {
    const i = idxMap.get(k);
    if (i == null) continue;
    const v = row[i];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return fallback;
}

/**
 * Flexible columns:
 * - guestName: guest_name | name | guest
 * - seatNumber: seat_number | seat | seatno
 * - inviteNumber: invite_number | invite | invitation
 * - partySize: party_size | size
 * - tripleName: triple_name | student_name | group_name
 * - memberIndex: member_index | member | idx
 * - token: token | checkin_token | qr_token | qr
 * - partyId: party_id (optional; if missing, derived from seat/invite)
 */
function parseGuestRowsFromExcelBuffer(buffer) {
  const wb = xlsx.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: true });

  if (!rows.length) return [];

  const header = rows[0];
  const idxMap = new Map();
  header.forEach((h, i) => idxMap.set(normalizeHeader(h), i));

  const out = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const guestName = String(getCell(row, idxMap, ["guest_name", "name", "guest"], "")).trim();
    if (!guestName) continue;

    const seatNumberRaw = getCell(row, idxMap, ["seat_number", "seat", "seatno"], "");
    const seatNumber = seatNumberRaw === "" ? null : Number(String(seatNumberRaw).replace(/\D/g, ""));
    const inviteNumberRaw = getCell(row, idxMap, ["invite_number", "invite", "invitation"], "");
    const inviteNumber = inviteNumberRaw === "" ? null : String(inviteNumberRaw).trim();

    const partySizeRaw = getCell(row, idxMap, ["party_size", "size"], "");
    const partySize = partySizeRaw === "" ? null : Number(String(partySizeRaw).replace(/\D/g, ""));

    const tripleNameRaw = getCell(row, idxMap, ["triple_name", "student_name", "group_name"], "");
    const tripleName = tripleNameRaw === "" ? null : String(tripleNameRaw).trim();

    const memberIndexRaw = getCell(row, idxMap, ["member_index", "member", "idx"], "");
    const memberIndex = memberIndexRaw === "" ? null : Number(String(memberIndexRaw).replace(/\D/g, ""));

    const tokenRaw = getCell(row, idxMap, ["token", "checkin_token", "qr_token", "qr"], "");
    const checkinToken = String(tokenRaw || "").trim() || crypto.randomUUID();

    const partyIdRaw = getCell(row, idxMap, ["party_id"], "");
    const partyId =
      String(partyIdRaw || "").trim() || `SEAT-${Number.isFinite(seatNumber) ? seatNumber : "NA"}-INV-${inviteNumber ?? "NA"}`;

    out.push({
      partyId,
      guestName,
      seatNumber: Number.isFinite(seatNumber) ? seatNumber : null,
      inviteNumber,
      partySize: Number.isFinite(partySize) ? partySize : null,
      tripleName,
      memberIndex: Number.isFinite(memberIndex) ? memberIndex : null,
      checkinToken,
    });
  }

  return out;
}

// ---------- Summary helpers ----------
async function partySummaryByPartyId(partyId) {
  const party = await prisma.party.findUnique({
    where: { id: partyId },
    include: { guests: { orderBy: { memberIndex: "asc" } } },
  });
  if (!party) return null;

  const total = party.guests.length;
  const checked = party.guests.filter((g) => !!g.checkedInAt).length;

  return {
    party: {
      id: party.id,
      inviteNumber: party.inviteNumber,
      seatNumber: party.seatNumber,
      partySize: party.partySize,
      tripleName: party.tripleName,
    },
    stats: { checked, total, allIn: total > 0 && checked === total },
    guests: party.guests.map((g) => ({
      id: g.id,
      guestName: g.guestName,
      memberIndex: g.memberIndex,
      checkedInAt: g.checkedInAt,
    })),
  };
}

async function seatSummary(seatNumber) {
  const seat = Number(seatNumber);

  const guests = await prisma.guest.findMany({
    where: { seatNumber: seat },
    orderBy: [{ checkedInAt: "asc" }, { memberIndex: "asc" }, { id: "asc" }],
  });

  const total = guests.length;
  const checked = guests.filter((g) => !!g.checkedInAt).length;

  return {
    party: {
      id: `SEAT-${seat}`,
      seatNumber: seat,
      inviteNumber: null,
      partySize: total,
      tripleName: null,
    },
    stats: { checked, total, allIn: total > 0 && checked === total },
    guests: guests.map((g) => ({
      id: g.id,
      guestName: g.guestName,
      memberIndex: g.memberIndex,
      checkedInAt: g.checkedInAt,
    })),
    groupMode: "seat",
    seatNumber: seat,
  };
}

// ---------- Routes ----------
app.get("/", (req, res) => res.send("GateCheck API OK"));

app.get("/me", (req, res) => {
  const claims = readAuth(req);
  if (!claims) return res.json({ user: null });
  res.json({ user: { id: claims.sub, email: claims.email, role: claims.role } });
});

// Auth
app.post("/auth/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!email || !password) return res.status(400).json({ error: "Missing email or password" });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });

  const token = signToken(user);
  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 7 * 24 * 3600 * 1000,
  });

  res.json({ id: user.id, email: user.email, role: user.role });
});

app.post("/auth/logout", (req, res) => {
  res.clearCookie("session");
  res.json({ ok: true });
});

// Stats overall
app.get("/stats", requireAuth, async (req, res) => {
  const total = await prisma.guest.count();
  const checked = await prisma.guest.count({ where: { checkedInAt: { not: null } } });
  res.json({ total, checked, allIn: total > 0 && checked === total });
});

// Seat Search
app.get("/lookup/seat/:seatNo", requireAuth, async (req, res) => {
  const seatNo = String(req.params.seatNo || "").trim();
  if (!seatNo) return res.status(400).json({ error: "Missing seat number" });

  const seat = Number(seatNo.replace(/\D/g, ""));
  if (!Number.isFinite(seat)) return res.status(400).json({ error: "Invalid seat number" });

  const summary = await seatSummary(seat);
  if (!summary.stats.total) return res.status(404).json({ error: "Not found" });

  res.json(summary);
});

// Check single guest
app.post("/checkin", requireAuth, async (req, res) => {
  const guestId = Number(req.body?.guestId);
  if (!Number.isFinite(guestId)) return res.status(400).json({ error: "Missing guestId" });

  const g = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!g) return res.status(404).json({ error: "Not found" });

  let already = false;
  if (g.checkedInAt) {
    already = true;
  } else {
    await prisma.guest.update({
      where: { id: guestId },
      data: { checkedInAt: new Date(), checkedInById: req.user.sub },
    });
  }

  if (Number.isFinite(g.seatNumber)) {
    const summary = await seatSummary(g.seatNumber);
    return res.json({ ...summary, already });
  }

  const summary = await partySummaryByPartyId(g.partyId);
  res.json({ ...summary, already });
});

// Check all by seat
app.post("/checkin/seat", requireAuth, async (req, res) => {
  const seatNumber = Number(req.body?.seatNumber);
  if (!Number.isFinite(seatNumber)) return res.status(400).json({ error: "Missing seatNumber" });

  const now = new Date();
  const r = await prisma.guest.updateMany({
    where: { seatNumber, checkedInAt: null },
    data: { checkedInAt: now, checkedInById: req.user.sub },
  });

  const summary = await seatSummary(seatNumber);
  res.json({ ok: true, newlyChecked: r.count, ...summary });
});

// Scan QR (payload = token)
app.post("/scan", requireAuth, async (req, res) => {
  const payload = String(req.body?.payload || "").trim();
  if (!payload) return res.status(400).json({ error: "Missing payload" });

  const guest = await prisma.guest.findUnique({ where: { checkinToken: payload } });
  if (!guest) return res.status(404).json({ error: "QR not recognized" });

  let scanAction = "already";
  if (!guest.checkedInAt) {
    await prisma.guest.update({
      where: { id: guest.id },
      data: { checkedInAt: new Date(), checkedInById: req.user.sub },
    });
    scanAction = "checked";
  }

  if (Number.isFinite(guest.seatNumber)) {
    const summary = await seatSummary(guest.seatNumber);
    return res.json({ ...summary, scannedGuestId: guest.id, scanAction });
  }

  const summary = await partySummaryByPartyId(guest.partyId);
  res.json({ ...summary, scannedGuestId: guest.id, scanAction });
});

// ---------- Admin ----------
app.patch("/admin/guests/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const guestName = req.body?.guestName != null ? String(req.body.guestName).trim() : null;

  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  if (!guestName) return res.status(400).json({ error: "Missing guestName" });

  const g = await prisma.guest.update({ where: { id }, data: { guestName } });
  res.json({ ok: true, id: g.id, guestName: g.guestName });
});

// UNDO (Admin)
app.post("/admin/undo", requireAdmin, async (req, res) => {
  const guestId = Number(req.body?.guestId);
  if (!Number.isFinite(guestId)) return res.status(400).json({ error: "Missing guestId" });

  const g = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!g) return res.status(404).json({ error: "Not found" });

  await prisma.guest.update({
    where: { id: guestId },
    data: { checkedInAt: null, checkedInById: null },
  });

  if (Number.isFinite(g.seatNumber)) {
    const summary = await seatSummary(g.seatNumber);
    return res.json({ ok: true, ...summary });
  }

  const summary = await partySummaryByPartyId(g.partyId);
  res.json({ ok: true, ...summary });
});

// Delete all data (Admin)
app.post("/admin/delete-data", requireAdmin, async (req, res) => {
  const confirm = String(req.body?.confirm || "");
  if (confirm !== "DELETE") return res.status(400).json({ error: "Confirmation required" });

  await prisma.$transaction(async (tx) => {
    await tx.guest.deleteMany();
    await tx.party.deleteMany();
  });

  res.json({ ok: true });
});

// Export Excel (Admin)
app.get("/admin/export", requireAdmin, async (req, res) => {
  const guests = await prisma.guest.findMany({
    orderBy: [{ seatNumber: "asc" }, { memberIndex: "asc" }, { id: "asc" }],
  });

  const rows = guests.map((g) => ({
    guestId: g.id,
    guestName: g.guestName,
    seatNumber: g.seatNumber ?? "",
    inviteNumber: g.inviteNumber ?? "",
    memberIndex: g.memberIndex ?? "",
    token: g.checkinToken,
    checkedIn: g.checkedInAt ? "YES" : "NO",
    checkedInAt: g.checkedInAt ? g.checkedInAt.toISOString() : "",
  }));

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(rows);
  xlsx.utils.book_append_sheet(wb, ws, "Checkins");

  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="graduation_checkins.xlsx"`);
  res.send(buf);
});

// Import Excel + store file
app.post("/admin/import-excel-store", requireAdmin, upload.single("file"), async (req, res) => {
  const mode = String(req.query.mode || "replace"); // replace | upsert
  if (!req.file?.buffer) return res.status(400).json({ error: "Missing file" });

  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const savedAbs = path.join(uploadsDir, "guest_list.xlsx");
  fs.writeFileSync(savedAbs, req.file.buffer);

  const rows = parseGuestRowsFromExcelBuffer(req.file.buffer);

  await prisma.$transaction(async (tx) => {
    if (mode === "replace") {
      await tx.guest.deleteMany();
      await tx.party.deleteMany();
    }

    // upsert parties
    const partyMap = new Map();
    for (const r of rows) {
      if (!partyMap.has(r.partyId)) {
        partyMap.set(r.partyId, {
          id: r.partyId,
          inviteNumber: r.inviteNumber || null,
          seatNumber: r.seatNumber ?? null,
          partySize: r.partySize ?? null,
          tripleName: r.tripleName || null,
        });
      }
    }

    for (const p of partyMap.values()) {
      await tx.party.upsert({ where: { id: p.id }, update: p, create: p });
    }

    // upsert guests by checkinToken (unique)
    for (const r of rows) {
      await tx.guest.upsert({
        where: { checkinToken: r.checkinToken },
        update: {
          partyId: r.partyId,
          guestName: r.guestName,
          inviteNumber: r.inviteNumber || null,
          seatNumber: r.seatNumber ?? null,
          partySize: r.partySize ?? null,
          tripleName: r.tripleName || null,
          memberIndex: r.memberIndex ?? null,
          qrPayload: r.checkinToken,
        },
        create: {
          partyId: r.partyId,
          guestName: r.guestName,
          inviteNumber: r.inviteNumber || null,
          seatNumber: r.seatNumber ?? null,
          partySize: r.partySize ?? null,
          tripleName: r.tripleName || null,
          memberIndex: r.memberIndex ?? null,
          checkinToken: r.checkinToken,
          qrPayload: r.checkinToken,
        },
      });
    }
  });

  res.json({ ok: true, savedAs: "uploads/guest_list.xlsx", imported: rows.length, mode });
});

// Add guest + QR
app.post("/admin/add-guest", requireAdmin, async (req, res) => {
  const guestName = String(req.body?.guestName || "").trim();
  const inviteNumber = req.body?.inviteNumber != null ? String(req.body.inviteNumber).trim() : null;
  const seatNumber = req.body?.seatNumber != null ? Number(req.body.seatNumber) : null;

  if (!guestName) return res.status(400).json({ error: "Missing guestName" });

  const token = crypto.randomUUID();

  // group manual by seat if provided
  const partyId = Number.isFinite(seatNumber) ? `SEAT-${seatNumber}-MANUAL` : `MANUAL-${Date.now()}`;

  await prisma.party.upsert({
    where: { id: partyId },
    update: {
      seatNumber: Number.isFinite(seatNumber) ? seatNumber : null,
      inviteNumber: inviteNumber || null,
    },
    create: {
      id: partyId,
      seatNumber: Number.isFinite(seatNumber) ? seatNumber : null,
      inviteNumber: inviteNumber || null,
      partySize: null,
      tripleName: null,
    },
  });

  const currentCount = await prisma.guest.count({ where: { partyId } });

  await prisma.guest.create({
    data: {
      partyId,
      guestName,
      inviteNumber: inviteNumber || null,
      seatNumber: Number.isFinite(seatNumber) ? seatNumber : null,
      partySize: null,
      tripleName: null,
      memberIndex: currentCount + 1,
      checkinToken: token,
      qrPayload: token,
    },
  });

  const qrDataUrl = await QRCode.toDataURL(token, { margin: 1, width: 420 });
  res.json({ token, qrDataUrl });
});

app.listen(PORT, () => {
  console.log(`GateCheck API OK on http://localhost:${PORT}`);
});
