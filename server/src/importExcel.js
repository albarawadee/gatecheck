const XLSX = require("xlsx");

/**
 * Reads your Excel and returns normalized rows.
 * Expected columns (from your sheet):
 * رقم المقعد, اسم الضيف, رقم الجلوس, الاسم الثلاثي, PartyID, PartySize, PartyMemberIndex, CheckinToken, QRPayload, QRFile
 */
function parseGuestRowsFromExcelBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  // Normalize:
  return rows.map((r) => {
    const seatNumber = r["رقم المقعد"] !== "" ? Number(r["رقم المقعد"]) : null;
    const guestName = String(r["اسم الضيف"] || "").trim();
    const inviteNumber = String(r["رقم الجلوس"] || "").trim(); // digits only in your file
    const tripleName = String(r["الاسم الثلاثي"] || "").trim();

    const partyId = String(r["PartyID"] || "").trim();
    const partySize = r["PartySize"] !== "" ? Number(r["PartySize"]) : null;
    const memberIndex = r["PartyMemberIndex"] !== "" ? Number(r["PartyMemberIndex"]) : null;

    const checkinToken = String(r["CheckinToken"] || "").trim();
    const qrPayload = String(r["QRPayload"] || "").trim();
    const qrFile = String(r["QRFile"] || "").trim();

    return {
      seatNumber,
      guestName,
      inviteNumber,
      tripleName,
      partyId,
      partySize,
      memberIndex,
      checkinToken,
      qrPayload,
      qrFile,
    };
  }).filter(x => x.partyId && x.checkinToken && x.guestName);
}

module.exports = { parseGuestRowsFromExcelBuffer };
