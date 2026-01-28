// web/src/pages/Admin.tsx
import React, { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import QRCode from "qrcode";

type Organizer = {
  id: number;
  email: string;
  name: string;
  role: string;
};

type AddGuestPayload = {
  seatNumber: number | string;
  inviteNumber: string; // 8 digits typically
  guestName: string;
  tripleName?: string | null;
  partySize: number;
  partyMemberIndex: number;
  partyId?: string | null; // optional, auto if empty
};

function Badge({ kind, text }: { kind: "ok" | "bad" | "warn"; text: string }) {
  const cls = kind === "ok" ? "Badge BadgeOk" : kind === "bad" ? "Badge BadgeBad" : "Badge BadgeWarn";
  return <span className={cls}>{text}</span>;
}

function pad3(n: number | string) {
  const s = String(n ?? "").trim();
  return s.padStart(3, "0");
}

export default function Admin() {
  const { user, logout } = useAuth() as any;
  const isAdmin = String(user?.role || "").toUpperCase() === "ADMIN";

  // protect (in case)
  useEffect(() => {
    if (!isAdmin) window.location.href = "/dashboard";
  }, [isAdmin]);

  const [toast, setToast] = useState<{ kind: "ok" | "bad" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // ---- Add Guest modal ----
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<AddGuestPayload>({
    seatNumber: "",
    inviteNumber: "",
    guestName: "",
    tripleName: "",
    partySize: 3,
    partyMemberIndex: 1,
    partyId: "",
  });

  // ---- QR modal after create ----
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [qrToken, setQrToken] = useState<string>("");
  const [qrGuestTitle, setQrGuestTitle] = useState<string>("");

  // ---- Organizers modal ----
  const [orgOpen, setOrgOpen] = useState(false);
  const [orgs, setOrgs] = useState<Organizer[]>([]);
  const [orgDraft, setOrgDraft] = useState<Record<number, string>>({});

  const canSaveOrganizers = useMemo(() => {
    if (!orgs.length) return false;
    return orgs.some((o) => (orgDraft[o.id] ?? o.name).trim() !== o.name.trim());
  }, [orgs, orgDraft]);

  async function loadOrganizers() {
    try {
      setBusy(true);
      setToast(null);
      const r = await api.get<{ organizers: Organizer[] }>("/admin/organizers");
      const list = r.organizers || [];
      setOrgs(list);
      const d: Record<number, string> = {};
      for (const o of list) d[o.id] = o.name || "";
      setOrgDraft(d);
    } catch (e: any) {
      setToast({ kind: "bad", text: e?.message || "Failed to load organizers." });
    } finally {
      setBusy(false);
    }
  }

  async function saveOrganizers() {
    try {
      setBusy(true);
      setToast(null);

      const updates = orgs
        .map((o) => ({
          id: o.id,
          name: (orgDraft[o.id] ?? o.name).trim(),
        }))
        .filter((u) => u.name.length > 0);

      await api.put("/admin/organizers", { organizers: updates });

      setToast({ kind: "ok", text: "Organizers updated." });
      await loadOrganizers();
      setOrgOpen(false);
    } catch (e: any) {
      setToast({ kind: "bad", text: e?.message || "Failed to save organizers." });
    } finally {
      setBusy(false);
    }
  }

  async function createGuest() {
    try {
      setBusy(true);
      setToast(null);

      const seatNum = parseInt(String(form.seatNumber || "").trim(), 10);
      const invite = String(form.inviteNumber || "").trim();
      const guestName = String(form.guestName || "").trim();
      const tripleName = String(form.tripleName || "").trim();
      const partySize = parseInt(String(form.partySize || 0), 10);
      const partyMemberIndex = parseInt(String(form.partyMemberIndex || 0), 10);

      if (!Number.isFinite(seatNum)) throw new Error("Seat number is required.");
      if (!invite) throw new Error("Invite number is required.");
      if (!guestName) throw new Error("Guest name is required.");
      if (!Number.isFinite(partySize) || partySize <= 0) throw new Error("Party size must be a positive number.");
      if (!Number.isFinite(partyMemberIndex) || partyMemberIndex <= 0)
        throw new Error("Party member index must be a positive number.");

      // ✅ party_id لازم (عشان ما يرجع لك null value in party_id)
      const partyId =
        String(form.partyId || "").trim() || `${pad3(seatNum)}-${invite}`;

      const payload: AddGuestPayload = {
        seatNumber: seatNum,
        inviteNumber: invite,
        guestName,
        tripleName: tripleName ? tripleName : null,
        partySize,
        partyMemberIndex,
        partyId,
      };

      // server returns token
      const r = await api.post<{ guest: any; token: string }>("/admin/guest", payload);

      const token = r?.token || r?.guest?.checkin_token || r?.guest?.checkinToken;
      if (!token) throw new Error("Guest created, but token missing from server response.");

      const title = `${guestName} • Seat ${seatNum}`;

      const dataUrl = await QRCode.toDataURL(String(token), {
        margin: 1,
        scale: 8,
      });

      setQrToken(String(token));
      setQrGuestTitle(title);
      setQrDataUrl(dataUrl);

      setAddOpen(false);
      setQrOpen(true);

      // reset form nicely
      setForm((f) => ({
        ...f,
        guestName: "",
        tripleName: "",
        partyMemberIndex: 1,
      }));

      setToast({ kind: "ok", text: "Guest added successfully." });
    } catch (e: any) {
      setToast({ kind: "bad", text: e?.message || "Add guest failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* TOP BAR */}
      <div className="TopBar">
        <div className="TopBarRow">
          <div className="TopBrand">
            <img src="/logo.png" alt="logo" />
            <div style={{ minWidth: 0 }}>
              <div className="TopTitle" style={{ whiteSpace: "normal" }}>
                Graduation Ceremony
              </div>
              <div className="TopSub">{user?.name || user?.email}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="Pill"
              onClick={() => (window.location.href = "/dashboard")}
              style={{ cursor: "pointer" }}
              title="Back"
            >
              Back
            </button>
            <button className="Pill" onClick={logout} style={{ cursor: "pointer" }}>
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* toast */}
      {toast && (
        <div style={{ marginTop: 12 }}>
          <Badge kind={toast.kind} text={toast.text} />
        </div>
      )}

      {/* TWO CARDS ONLY */}
      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
        {/* Add Guest */}
        <div className="GateCard">
          <div className="GateTitle">Add Guest</div>
          <div className="GateHint">Create a new guest and generate a QR token.</div>

          <div className="BtnRow">
            <button className="BtnMatte" onClick={() => setAddOpen(true)} disabled={busy}>
              Add Guest
            </button>
          </div>
        </div>

        {/* Edit Organizers */}
        <div className="GateCard">
          <div className="GateTitle">Organizers</div>
          <div className="GateHint">Edit organizers names saved in the database.</div>

          <div className="BtnRow">
            <button
              className="BtnMatte"
              onClick={async () => {
                setOrgOpen(true);
                await loadOrganizers();
              }}
              disabled={busy}
            >
              Edit Organizers
            </button>
          </div>
        </div>
      </div>

      {/* Add Guest Modal */}
      {addOpen && (
        <div className="ModalBack" onMouseDown={() => setAddOpen(false)}>
          <div className="ModalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ModalTop">
              <div className="ModalTitle">Add Guest</div>
              <button className="CloseBtn" onClick={() => setAddOpen(false)}>
                Close
              </button>
            </div>

            <div className="ModalBody">
              <div className="SectionCard">
                <div style={{ display: "grid", gap: 10 }}>
                  <input
                    className="Input"
                    placeholder="Seat Number"
                    inputMode="numeric"
                    value={String(form.seatNumber ?? "")}
                    onChange={(e) => setForm((f) => ({ ...f, seatNumber: e.target.value }))}
                  />

                  <input
                    className="Input"
                    placeholder="Invite Number (8 digits)"
                    inputMode="numeric"
                    value={form.inviteNumber}
                    onChange={(e) => setForm((f) => ({ ...f, inviteNumber: e.target.value }))}
                  />

                  <input
                    className="Input"
                    placeholder="Guest Name"
                    value={form.guestName}
                    onChange={(e) => setForm((f) => ({ ...f, guestName: e.target.value }))}
                  />

                  <input
                    className="Input"
                    placeholder="Triple Name (optional)"
                    value={String(form.tripleName ?? "")}
                    onChange={(e) => setForm((f) => ({ ...f, tripleName: e.target.value }))}
                  />

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <input
                      className="Input"
                      placeholder="Party Size"
                      inputMode="numeric"
                      value={String(form.partySize ?? "")}
                      onChange={(e) => setForm((f) => ({ ...f, partySize: Number(e.target.value) }))}
                    />
                    <input
                      className="Input"
                      placeholder="Member Index"
                      inputMode="numeric"
                      value={String(form.partyMemberIndex ?? "")}
                      onChange={(e) => setForm((f) => ({ ...f, partyMemberIndex: Number(e.target.value) }))}
                    />
                  </div>

                  <input
                    className="Input"
                    placeholder='Party ID (optional) — auto like "001-20201227"'
                    value={String(form.partyId ?? "")}
                    onChange={(e) => setForm((f) => ({ ...f, partyId: e.target.value }))}
                  />
                </div>

                <div className="BtnRow" style={{ justifyContent: "space-between" }}>
                  <button className="BtnGhost" onClick={() => setAddOpen(false)}>
                    Cancel
                  </button>
                  <button className="BtnMatte" onClick={createGuest} disabled={busy}>
                    Save
                  </button>
                </div>
              </div>

              <div className="InfoLine" style={{ opacity: 0.75 }}>
                * QR token will be generated automatically and shown after saving.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {qrOpen && (
        <div className="ModalBack" onMouseDown={() => setQrOpen(false)}>
          <div className="ModalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ModalTop">
              <div className="ModalTitle">QR Token</div>
              <button className="CloseBtn" onClick={() => setQrOpen(false)}>
                Close
              </button>
            </div>

            <div className="ModalBody">
              <div className="SectionCard" style={{ textAlign: "center" }}>
                <div className="InfoLine" style={{ fontWeight: 900, marginBottom: 10 }}>
                  {qrGuestTitle}
                </div>

                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="qr"
                    style={{
                      width: "min(240px, 70vw)",
                      height: "auto",
                      borderRadius: 18,
                      border: "1px solid rgba(255,255,255,.12)",
                      background: "rgba(0,0,0,.18)",
                      padding: 10,
                    }}
                  />
                ) : (
                  <div className="InfoLine">Generating QR...</div>
                )}

                <div className="InfoLine" style={{ marginTop: 10 }}>
                  Token: <span style={{ fontWeight: 900 }}>{qrToken}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Organizers Modal */}
      {orgOpen && (
        <div className="ModalBack" onMouseDown={() => setOrgOpen(false)}>
          <div className="ModalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ModalTop">
              <div className="ModalTitle">Edit Organizers</div>
              <button className="CloseBtn" onClick={() => setOrgOpen(false)}>
                Close
              </button>
            </div>

            <div className="ModalBody">
              <div className="SectionCard">
                {!orgs.length ? (
                  <div className="InfoLine">No organizers found.</div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {orgs.map((o) => (
                      <div key={o.id} className="GuestLine" style={{ alignItems: "center" }}>
                        <div style={{ minWidth: 0 }}>
                          <div className="GuestName" style={{ marginBottom: 4 }}>
                            {o.email}
                          </div>
                          <div className="InfoLine" style={{ opacity: 0.7 }}>
                            Role: {o.role}
                          </div>
                        </div>

                        <input
                          className="Input"
                          style={{ height: 46, borderRadius: 14, width: 170 }}
                          value={orgDraft[o.id] ?? o.name ?? ""}
                          onChange={(e) => setOrgDraft((d) => ({ ...d, [o.id]: e.target.value }))}
                          placeholder="Name"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="BtnRow" style={{ justifyContent: "space-between" }}>
                  <button className="BtnGhost" onClick={() => setOrgOpen(false)}>
                    Cancel
                  </button>
                  <button className="BtnMatte" onClick={saveOrganizers} disabled={busy || !canSaveOrganizers}>
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="Footer">Programmed by Albara</div>
    </div>
  );
}
