// server/src/importExcel.js
const XLSX = require("xlsx");

function toStr(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}
function toInt(v) {
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function requireHeaders(rows, required) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length) {
    const err = new Error(
      `Excel headers mismatch.\nMissing: ${missing.join(", ")}\nFound: ${headers.join(", ")}`
    );
    err.statusCode = 400;
    throw err;
  }
}

async function hasField(model, field) {
  try {
    await model.findFirst({ select: { [field]: true } });
    return true;
  } catch {
    return false;
  }
}

async function detectGuestMap(prisma) {
  const guest = prisma.guest;

  const nameField = (await hasField(guest, "displayName"))
    ? "displayName"
    : (await hasField(guest, "guestName"))
    ? "guestName"
    : "displayName";

  const fullField = (await hasField(guest, "fullName"))
    ? "fullName"
    : (await hasField(guest, "tripleName"))
    ? "tripleName"
    : null;

  const memberIndex = (await hasField(guest, "memberIndex"))
    ? "memberIndex"
    : (await hasField(guest, "partyMemberIndex"))
    ? "partyMemberIndex"
    : "memberIndex";

  const partySize = (await hasField(guest, "partySize"))
    ? "partySize"
    : "partySize";

  const partyId = (await hasField(guest, "partyId"))
    ? "partyId"
    : (await hasField(guest, "partyRecordId"))
    ? "partyRecordId"
    : "partyId";

  const qrPayload = (await hasField(guest, "qrPayload")) ? "qrPayload" : null;
  const qrFile = (await hasField(guest, "qrFile")) ? "qrFile" : null;

  const boolChecked = (await hasField(guest, "isCheckedIn")) ? "isCheckedIn" : null;
  const checkedAt = (await hasField(guest, "checkedInAt")) ? "checkedInAt" : null;
  const checkedById = (await hasField(guest, "checkedInById")) ? "checkedInById" : null;
  const checkedByEmail = (await hasField(guest, "checkedInByEmail")) ? "checkedInByEmail" : null;

  return {
    nameField,
    fullField,
    memberIndex,
    partySize,
    partyId,
    qrPayload,
    qrFile,
    boolChecked,
    checkedAt,
    checkedById,
    checkedByEmail,
  };
}

async function detectPartySupport(prisma) {
  const hasParty = prisma.party && typeof prisma.party.upsert === "function";
  if (!hasParty) return { hasParty: false };

  const party = prisma.party;
  const partyKey = (await hasField(party, "partyId")) ? "partyId" : "id";

  const hasSeat = await hasField(party, "seatNumber");
  const hasInvite = await hasField(party, "inviteNumber");
  const hasSize = await hasField(party, "partySize");

  return { hasParty: true, partyKey, hasSeat, hasInvite, hasSize };
}

async function importExcel(filePath, prisma) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  if (!rows.length) {
    return { ok: true, importedRows: 0, skippedRows: 0, totalRows: 0 };
  }

  // ✅ Headers exactly as your file
  const REQUIRED = [
    "seatNumber",
    "guestName",
    "inviteNumber",
    "tripleName",
    "PartyID",
    "PartySize",
    "PartyMemberIndex",
    "CheckinToken",
    "QRPayload",
    "QRFile",
  ];
  requireHeaders(rows, REQUIRED);

  const GMAP = await detectGuestMap(prisma);
  const PSUP = await detectPartySupport(prisma);

  let importedRows = 0;
  let skippedRows = 0;

  // 1) Upsert parties first (NO transaction)
  if (PSUP.hasParty) {
    const partyMap = new Map();
    for (const r of rows) {
      const partyId = toStr(r.PartyID);
      if (!partyId) continue;
      if (partyMap.has(partyId)) continue;

      partyMap.set(partyId, {
        partyId,
        seatNumber: toInt(r.seatNumber),
        inviteNumber: toStr(r.inviteNumber),
        partySize: toInt(r.PartySize),
      });
    }

    for (const p of partyMap.values()) {
      const where = { [PSUP.partyKey]: p.partyId };
      const create = { [PSUP.partyKey]: p.partyId };
      const update = {};

      if (PSUP.hasSeat && p.seatNumber) {
        create.seatNumber = p.seatNumber;
        update.seatNumber = p.seatNumber;
      }
      if (PSUP.hasInvite && p.inviteNumber) {
        create.inviteNumber = p.inviteNumber;
        update.inviteNumber = p.inviteNumber;
      }
      if (PSUP.hasSize && p.partySize) {
        create.partySize = p.partySize;
        update.partySize = p.partySize;
      }

      await prisma.party.upsert({ where, create, update });
    }
  }

  // 2) Upsert guests (NO transaction)
  for (const r of rows) {
    const seatNumber = toInt(r.seatNumber);
    const inviteNumber = toStr(r.inviteNumber);
    const guestName = toStr(r.guestName);
    const tripleName = toStr(r.tripleName) || null;

    const partyIdFile = toStr(r.PartyID);
    const partySizeFile = toInt(r.PartySize);
    const memberIndexFile = toInt(r.PartyMemberIndex);

    const checkinToken = toStr(r.CheckinToken);
    const qrPayloadFile = toStr(r.QRPayload);
    const qrFileFile = toStr(r.QRFile) || null;

    if (
      !seatNumber ||
      !inviteNumber ||
      !guestName ||
      !partyIdFile ||
      !partySizeFile ||
      !memberIndexFile ||
      !checkinToken ||
      !qrPayloadFile
    ) {
      skippedRows++;
      continue;
    }

    const update = { seatNumber, inviteNumber };
    update[GMAP.nameField] = guestName;
    if (GMAP.fullField) update[GMAP.fullField] = tripleName;

    update[GMAP.partyId] = partyIdFile;
    update[GMAP.partySize] = partySizeFile;
    update[GMAP.memberIndex] = memberIndexFile;

    if (GMAP.qrPayload) update[GMAP.qrPayload] = qrPayloadFile;
    if (GMAP.qrFile) update[GMAP.qrFile] = qrFileFile;

    const create = { ...update, checkinToken };

    // only on create: set "not checked" if fields exist
    if (GMAP.boolChecked) create[GMAP.boolChecked] = false;
    if (GMAP.checkedAt) create[GMAP.checkedAt] = null;
    if (GMAP.checkedById) create[GMAP.checkedById] = null;
    if (GMAP.checkedByEmail) create[GMAP.checkedByEmail] = null;

    await prisma.guest.upsert({
      where: { checkinToken },
      update,
      create,
    });

    importedRows++;
  }

  return { ok: true, importedRows, skippedRows, totalRows: rows.length };
}

module.exports = importExcel;
module.exports.importExcel = importExcel;
module.exports.default = importExcel;
