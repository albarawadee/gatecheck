// server/src/index.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { supabaseAdmin } = require("./supabase");

const app = express();
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(express.json({ limit: "2mb" }));

app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true);
      if (CORS_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);

// ---------- helpers ----------
function ok(res, data) {
  res.json(data);
}
function fail(res, code, msg) {
  res.status(code).json({ error: msg });
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return fail(res, 401, "Missing token");

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch {
    return fail(res, 401, "Invalid token");
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) return fail(res, 401, "Unauthorized");
  if (String(req.user.role || "").toUpperCase() !== "ADMIN") return fail(res, 403, "Admin only");
  return next();
}

function normalizeToken(t) {
  return String(t || "").trim();
}

function pickRow(row) {
  // يحول أي شكل أعمدة (camel/snake) لشكل واحد
  const seat = row.seatNumber ?? row.seat_number ?? null;
  const invite = row.inviteNumber ?? row.invite_number ?? null;
  const partyId = row.PartyID ?? row.party_id ?? null;
  const partySize = row.PartySize ?? row.party_size ?? null;
  const memberIndex = row.member_index ?? row.party_member_index ?? null;

  const guestName = row.guestName ?? row.guest_name ?? "";
  const tripleName = row.tripleName ?? row.triple_name ?? null;

  const token = row.CheckinToken ?? row.checkin_token ?? "";
  const qrPayload = row.QRPayload ?? row.qr_payload ?? null;
  const qrFile = row.QRFile ?? row.qr_file ?? null;

  const checkedInAt = row.checkedInAt ?? row.checked_in_at ?? null;
  const checkedInByUserId = row.checkedInByUserId ?? row.checked_in_by_id ?? row.checkedInById ?? null;

  return {
    id: Number(row.id),
    seatNumber: seat,
    inviteNumber: invite,
    partyId,
    partySize,
    memberIndex,

    guestName,
    tripleName,

    checkinToken: token,
    qrPayload,
    qrFile,

    isCheckedIn: !!checkedInAt,
    checkedInAt,
    checkedInByUserId: checkedInByUserId ? Number(checkedInByUserId) : null,
    checkedBy: null,
  };
}

async function attachCheckedBy(guests) {
  const ids = [...new Set(guests.map((g) => g.checkedInByUserId).filter(Boolean))];
  if (!ids.length) return guests;

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,name,email")
    .in("id", ids);

  if (error) return guests;

  const map = new Map((data || []).map((u) => [Number(u.id), u]));
  return guests.map((g) => {
    const u = g.checkedInByUserId ? map.get(g.checkedInByUserId) : null;
    return { ...g, checkedBy: u ? { id: Number(u.id), name: u.name, email: u.email } : null };
  });
}

function groupParties(guests) {
  const map = new Map();

  for (const g of guests) {
    const key = (g.partyId || g.inviteNumber || String(g.id)).toString();
    if (!map.has(key)) {
      map.set(key, {
        partyId: g.partyId || null,
        seatNumber: g.seatNumber,
        inviteNumber: g.inviteNumber || null,
        partySize: g.partySize || null,
        members: [],
      });
    }
    map.get(key).members.push(g);
  }

  const parties = [];
  for (const p of map.values()) {
    p.members.sort((a, b) => {
      const ai = a.memberIndex ?? 9999;
      const bi = b.memberIndex ?? 9999;
      if (ai !== bi) return ai - bi;
      return a.id - b.id;
    });

    const student =
      p.members.find((m) => (m.memberIndex ?? 0) === 1) ||
      p.members[0] ||
      null;

    const checkedCount = p.members.filter((m) => m.isCheckedIn).length;
    const totalCount = p.members.length;
    const allIn = totalCount > 0 && checkedCount === totalCount;

    parties.push({
      partyId: p.partyId,
      seatNumber: p.seatNumber,
      inviteNumber: p.inviteNumber,
      partySize: p.partySize,

      student,
      guests: p.members, // نعرض الكل في القائمة (الطالب يكون أول واحد)
      allIn,
      checkedCount,
      totalCount,
    });
  }

  // ترتيب: حسب inviteNumber ثم partyId
  parties.sort((a, b) => {
    const ia = a.inviteNumber || "";
    const ib = b.inviteNumber || "";
    if (ia !== ib) return ia.localeCompare(ib);
    return String(a.partyId || "").localeCompare(String(b.partyId || ""));
  });

  return parties;
}

// ---------- routes ----------
app.get("/", (req, res) => res.send("GateCheck API OK"));

// ---- auth
app.post("/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) return fail(res, 400, "Missing email or password");

    // مهم: عمود كلمة المرور عندك password_hash
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("id,email,name,role,password_hash")
      .eq("email", email)
      .maybeSingle();

    if (error || !user) return fail(res, 401, "Invalid email or password");

    const okPass = await bcrypt.compare(password, user.password_hash);
    if (!okPass) return fail(res, 401, "Invalid email or password");

    const token = signToken(user);

    return ok(res, {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (e) {
    return fail(res, 500, e.message || "Login failed");
  }
});

app.get("/me", auth, async (req, res) => {
  return ok(res, { email: req.user.email, role: req.user.role, name: req.user.name });
});

// ---- stats (بدون views)
app.get("/stats", auth, async (req, res) => {
  try {
    const total = await supabaseAdmin
      .from("guests")
      .select("id", { count: "exact", head: true });

    const checked = await supabaseAdmin
      .from("guests")
      .select("id", { count: "exact", head: true })
      .not("checkedInAt", "is", null);

    if (total.error) return fail(res, 500, total.error.message);
    if (checked.error) return fail(res, 500, checked.error.message);

    return ok(res, {
      totalGuests: total.count || 0,
      checkedIn: checked.count || 0,
    });
  } catch (e) {
    return fail(res, 500, e.message || "Stats failed");
  }
});

// ---- seat search (يعتمد على seatNumber بالأساس، ولو فاضي يجرب seat_number)
app.get("/seat/:seat", auth, async (req, res) => {
  try {
    const seatRaw = String(req.params.seat || "").trim();
    if (!seatRaw) return fail(res, 400, "Invalid seat number");

    const seatInt = parseInt(seatRaw, 10);
    let data = null;

    if (Number.isFinite(seatInt)) {
      const r1 = await supabaseAdmin
        .from("guests")
        .select("*")
        .eq("seatNumber", seatInt);

      if (r1.error) return fail(res, 500, r1.error.message);
      data = r1.data || [];

      if (!data.length) {
        const r2 = await supabaseAdmin
          .from("guests")
          .select("*")
          .eq("seat_number", seatRaw);

        if (r2.error) return fail(res, 500, r2.error.message);
        data = r2.data || [];
      }
    } else {
      const r = await supabaseAdmin
        .from("guests")
        .select("*")
        .eq("seat_number", seatRaw);

      if (r.error) return fail(res, 500, r.error.message);
      data = r.data || [];
    }

    if (!data.length) return ok(res, { seatNumber: seatRaw, parties: [] });

    let guests = data.map(pickRow);
    guests = await attachCheckedBy(guests);

    const parties = groupParties(guests);
    return ok(res, { seatNumber: parties[0]?.seatNumber ?? seatRaw, parties });
  } catch (e) {
    return fail(res, 500, e.message || "Seat lookup failed");
  }
});

// ---- checkin by token (QR) يطابق على CheckinToken
app.post("/checkin/token", auth, async (req, res) => {
  try {
    const token = normalizeToken(req.body.token);
    if (!token) return fail(res, 400, "Missing token");

    // جرّب الأعمدة المحتملة
    let found = null;

    const tries = [
      supabaseAdmin.from("guests").select("*").eq("CheckinToken", token).limit(1),
      supabaseAdmin.from("guests").select("*").eq("checkin_token", token).limit(1),
      supabaseAdmin.from("guests").select("*").eq("QRPayload", token).limit(1),
      supabaseAdmin.from("guests").select("*").eq("qr_payload", token).limit(1),
    ];

    for (const q of tries) {
      const r = await q;
      if (r.error) continue;
      if (r.data && r.data.length) {
        found = r.data[0];
        break;
      }
    }

    if (!found) return fail(res, 404, "Token not found");

    const g = pickRow(found);
    const already = g.isCheckedIn;

    if (!already) {
      const now = new Date().toISOString();

      const upd = await supabaseAdmin
        .from("guests")
        .update({
          checkedInAt: now,
          checkedInByUserId: Number(req.user.sub),
        })
        .eq("id", g.id);

      if (upd.error) return fail(res, 500, upd.error.message);
    }

    // رجّع بيانات الكرسي كاملة (Popup)
    const seatNumber = g.seatNumber ?? "";
    // reuse seat endpoint logic سريع:
    req.params.seat = String(seatNumber);
    const seatRes = await (async () => {
      const seatRaw = String(seatNumber).trim();
      const seatInt = parseInt(seatRaw, 10);

      let data = [];
      if (Number.isFinite(seatInt)) {
        const r = await supabaseAdmin.from("guests").select("*").eq("seatNumber", seatInt);
        if (!r.error) data = r.data || [];
        if (!data.length) {
          const r2 = await supabaseAdmin.from("guests").select("*").eq("seat_number", seatRaw);
          if (!r2.error) data = r2.data || [];
        }
      } else {
        const r = await supabaseAdmin.from("guests").select("*").eq("seat_number", seatRaw);
        if (!r.error) data = r.data || [];
      }

      let guests = (data || []).map(pickRow);
      guests = await attachCheckedBy(guests);
      return groupParties(guests);
    })();

    return ok(res, {
      status: already ? "already_checked" : "checked",
      seatNumber: seatNumber,
      parties: seatRes,
    });
  } catch (e) {
    return fail(res, 500, e.message || "Checkin failed");
  }
});

// ---- checkin single guest
app.post("/checkin/guest/:id", auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return fail(res, 400, "Invalid guest id");

    const r = await supabaseAdmin.from("guests").select("*").eq("id", id).maybeSingle();
    if (r.error) return fail(res, 500, r.error.message);
    if (!r.data) return fail(res, 404, "Guest not found");

    const g = pickRow(r.data);
    if (g.isCheckedIn) return ok(res, { status: "already_checked" });

    const now = new Date().toISOString();
    const upd = await supabaseAdmin
      .from("guests")
      .update({ checkedInAt: now, checkedInByUserId: Number(req.user.sub) })
      .eq("id", id);

    if (upd.error) return fail(res, 500, upd.error.message);

    return ok(res, { status: "checked" });
  } catch (e) {
    return fail(res, 500, e.message || "Check failed");
  }
});

// ---- check all by partyId
app.post("/checkin/party", auth, async (req, res) => {
  try {
    const partyId = String(req.body.partyId || "").trim();
    if (!partyId) return fail(res, 400, "Missing partyId");

    const now = new Date().toISOString();

    // جرّب PartyID أول
    let upd = await supabaseAdmin
      .from("guests")
      .update({ checkedInAt: now, checkedInByUserId: Number(req.user.sub) })
      .eq("PartyID", partyId)
      .is("checkedInAt", null);

    if (upd.error) {
      // جرّب party_id
      upd = await supabaseAdmin
        .from("guests")
        .update({ checkedInAt: now, checkedInByUserId: Number(req.user.sub) })
        .eq("party_id", partyId)
        .is("checkedInAt", null);

      if (upd.error) return fail(res, 500, upd.error.message);
    }

    return ok(res, { status: "checked_all" });
  } catch (e) {
    return fail(res, 500, e.message || "Check all failed");
  }
});

// ---- undo (Admin)
app.post("/undo/guest/:id", auth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return fail(res, 400, "Invalid guest id");

    const upd = await supabaseAdmin
      .from("guests")
      .update({ checkedInAt: null, checkedInByUserId: null })
      .eq("id", id);

    if (upd.error) return fail(res, 500, upd.error.message);
    return ok(res, { status: "undone" });
  } catch (e) {
    return fail(res, 500, e.message || "Undo failed");
  }
});

// ---- admin edit guest name
app.put("/admin/guest/:id", auth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return fail(res, 400, "Invalid guest id");

    const guestName = req.body.guestName !== undefined ? String(req.body.guestName).trim() : undefined;
    const tripleName = req.body.tripleName !== undefined ? String(req.body.tripleName).trim() : undefined;

    const patch = {};
    if (guestName !== undefined) patch.guestName = guestName;
    if (tripleName !== undefined) patch.tripleName = tripleName;

    const upd = await supabaseAdmin.from("guests").update(patch).eq("id", id);
    if (upd.error) return fail(res, 500, upd.error.message);

    return ok(res, { status: "updated" });
  } catch (e) {
    return fail(res, 500, e.message || "Edit failed");
  }
});
// ====== ADD THIS in server/src/index.js (near helpers) ======
const crypto = require("crypto");

function randomToken(len = 12) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function getGuestColumnSet() {
  const r = await supabaseAdmin.from("guests").select("*").limit(1);
  if (r.error || !r.data || !r.data[0]) return new Set();
  return new Set(Object.keys(r.data[0]));
}

function buildInsertGuestPayload(cols, { seatNumber, inviteNumber, guestName, tripleName, partyId, token }) {
  const p = {};
  const set = (k, v) => {
    if (cols.has(k)) p[k] = v;
  };

  // seat
  set("seatNumber", seatNumber);
  set("seat_number", String(seatNumber));

  // invite
  set("inviteNumber", inviteNumber);
  set("invite_number", inviteNumber);

  // names
  set("guestName", guestName);
  set("guest_name", guestName);
  set("tripleName", tripleName);
  set("triple_name", tripleName);

  // party
  set("PartyID", partyId);
  set("party_id", partyId);
  set("PartySize", 1);
  set("party_size", 1);

  // member index (حسب الموجود في جدولك)
  set("PartyMemberIndex", 1);
  set("party_member_index", 1);
  set("member_index", 1);

  // token + QR
  set("CheckinToken", token);
  set("checkin_token", token);
  set("QRPayload", token);
  set("qr_payload", token);
  set("QRFile", null);
  set("qr_file", null);

  // checkin fields (بدون checkedInById نهائيًا)
  set("checkedInAt", null);
  set("checked_in_at", null);
  set("checkedInByUserId", null);
  set("checked_in_by_id", null);

  return p;
}

// ====== ADD THIS route in server/src/index.js ======
app.post("/admin/guest", auth, requireAdmin, async (req, res) => {
  try {
    const seatRaw = req.body.seatNumber ?? req.body.seat_number;
    const inviteRaw = req.body.inviteNumber ?? req.body.invite_number;
    const nameRaw = req.body.guestName ?? req.body.guest_name;
    const tripleRaw = req.body.tripleName ?? req.body.triple_name;

    const seatNumber = parseInt(String(seatRaw || "").trim(), 10);
    const inviteNumber = String(inviteRaw || "").trim();
    const guestName = String(nameRaw || "").trim();
    const tripleName = tripleRaw ? String(tripleRaw).trim() : null;

    if (!Number.isFinite(seatNumber)) return fail(res, 400, "Invalid seat number");
    if (!inviteNumber || !/^\d{8}$/.test(inviteNumber)) return fail(res, 400, "رقم الجلوس لازم يكون 8 أرقام");
    if (!guestName) return fail(res, 400, "Missing guest name");

    const partyId = `S${seatNumber}-${inviteNumber}`;
    const token = randomToken(12);

    const cols = await getGuestColumnSet();
    const payload = buildInsertGuestPayload(cols, { seatNumber, inviteNumber, guestName, tripleName, partyId, token });

    const ins = await supabaseAdmin.from("guests").insert(payload).select("*").single();
    if (ins.error) return fail(res, 500, ins.error.message);

    return ok(res, {
      status: "created",
      token,            // هذا اللي بتولّد منه QR في الفرونت
      qrPayload: token, // نفس token
      guest: pickRow(ins.data),
    });
  } catch (e) {
    return fail(res, 500, e.message || "Add guest failed");
  }
});
// ---- Admin: list organizers
app.get("/admin/organizers", auth, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id,name,email,role")
      .eq("role", "ORGANIZER")
      .order("id", { ascending: true });

    if (error) return fail(res, 500, error.message);
    return ok(res, { organizers: data || [] });
  } catch (e) {
    return fail(res, 500, e.message || "Failed to load organizers");
  }
});

// ---- Admin: update organizer name
app.put("/admin/organizers/:id", auth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return fail(res, 400, "Invalid organizer id");

    const name = String(req.body.name || "").trim();
    if (!name) return fail(res, 400, "Missing name");

    // حماية: لا يعدّل إلا المنظمين
    const { data: org, error: e1 } = await supabaseAdmin
      .from("users")
      .select("id,role")
      .eq("id", id)
      .maybeSingle();

    if (e1) return fail(res, 500, e1.message);
    if (!org) return fail(res, 404, "Organizer not found");
    if (String(org.role).toUpperCase() !== "ORGANIZER") return fail(res, 400, "Not an organizer");

    const { error: e2 } = await supabaseAdmin
      .from("users")
      .update({ name })
      .eq("id", id);

    if (e2) return fail(res, 500, e2.message);

    return ok(res, { status: "updated" });
  } catch (e) {
    return fail(res, 500, e.message || "Failed to update organizer");
  }
});

// ---------- error handler ----------
app.use((err, req, res, next) => {
  console.error(err);
  return fail(res, 500, err.message || "Server error");
});

app.listen(PORT, () => {
  console.log(`GateCheck API running on http://localhost:${PORT}`);
});
