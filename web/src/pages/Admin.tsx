import React, { useState } from "react";
import { useAuth } from "../lib/auth";
import { api, apiBase, apiForm } from "../lib/api";
import { useNavigate } from "react-router-dom";

const BRAND = "Graduation Ceremony";

export default function Admin() {
  const { user } = useAuth();
  const nav = useNavigate();

  const [msg, setMsg] = useState<string | null>(null);

  // Add guest
  const [guestName, setGuestName] = useState("");
  const [inviteNumber, setInviteNumber] = useState("");
  const [seatNumber, setSeatNumber] = useState("");

  const [created, setCreated] = useState<{ token: string; qrDataUrl: string } | null>(null);

  if (user?.role !== "ADMIN") {
    return (
      <div className="AppShell">
        <div className="Device">
          <div className="Screen">
            <div className="PageBody">
              <div className="GateCard">
                <div className="GateTitle">Admin Panel</div>
                <div className="InfoLine">Admin only.</div>
                <button className="BtnMatte" onClick={() => nav("/")}>Back</button>
              </div>
            </div>
            <div className="PageFooter">Programmed by Albara</div>
          </div>
        </div>
      </div>
    );
  }

  async function importExcel(file: File) {
    setMsg(null);
    setCreated(null);

    const form = new FormData();
    form.append("file", file);

    const r = await apiForm<{ ok: boolean; savedAs: string; imported: number }>("/admin/import-excel-store?mode=replace", form);
    setMsg(`Imported ${r.imported} rows. Saved as: ${r.savedAs}`);
  }

  async function deleteData() {
    if (!confirm("Are you sure you want to delete ALL data?")) return;
    if (!confirm("Final confirmation: delete EVERYTHING?")) return;

    await api("/admin/delete-data", { method: "POST", body: JSON.stringify({ confirm: "DELETE" }) });
    setMsg("All data deleted.");
    setCreated(null);
  }

  async function exportExcel() {
    setMsg(null);
    const res = await fetch(`${apiBase()}/admin/export`, { credentials: "include" });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(t || "Export failed");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "graduation_checkins.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function addGuest() {
    setMsg(null);
    setCreated(null);

    const body = {
      guestName: guestName.trim(),
      inviteNumber: inviteNumber.trim() || null,
      seatNumber: seatNumber.trim() ? Number(seatNumber.replace(/\D/g, "")) : null,
    };

    const r = await api<{ token: string; qrDataUrl: string }>("/admin/add-guest", {
      method: "POST",
      body: JSON.stringify(body),
    });

    setCreated(r);
    setMsg("Guest created.");
    setGuestName("");
    setInviteNumber("");
    setSeatNumber("");
  }

  return (
    <div className="AppShell">
      <div className="Device">
        <div className="Screen">
          <div className="TopBar">
            <div className="TopBarRow">
              <div className="BrandRow">
                <img src="/logo.png" className="BrandLogo" alt={BRAND} />
                <div>
                  <div className="TopTitle">Admin Panel</div>
                  <div className="TopSub">{user?.email || ""}</div>
                </div>
              </div>

              <div className="TopActions">
                <button className="IconBtn" onClick={() => nav("/")}>Back</button>
                <button className="IconBtn" onClick={exportExcel}>Export</button>
              </div>
            </div>
          </div>

          <div className="PageBody">
            <div style={{ padding: "0 16px 12px" }}>
              {/* Upload */}
              <div className="SectionCard">
                <div className="GateTitle">Upload Guest List (Excel)</div>
                <div className="InfoLine">File will be stored on the server as uploads/guest_list.xlsx</div>

                <div className="RowButtons" style={{ marginTop: 10 }}>
                  <label className="BtnMatte" style={{ cursor: "pointer" }}>
                    Upload .xlsx
                    <input
                      type="file"
                      accept=".xlsx"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) importExcel(f);
                      }}
                    />
                  </label>

                  <button className="BtnGhost" onClick={deleteData}>Delete Data</button>
                </div>

                {msg && <div className="InfoLine" style={{ marginTop: 10 }}>{msg}</div>}
              </div>

              <div style={{ height: 12 }} />

              {/* Add guest */}
              <div className="SectionCard">
                <div className="GateTitle">Add Guest (Generates QR Token)</div>

                <div className="FormGrid">
                  <label className="Field">
                    <div className="FieldLabel">Guest Name</div>
                    <input className="InputSm" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
                  </label>

                  <label className="Field">
                    <div className="FieldLabel">Invite Number (optional)</div>
                    <input
                      className="InputSm"
                      value={inviteNumber}
                      onChange={(e) => setInviteNumber(e.target.value.replace(/\D/g, ""))}
                    />
                  </label>

                  <label className="Field">
                    <div className="FieldLabel">Seat Number (optional)</div>
                    <input
                      className="InputSm"
                      value={seatNumber}
                      onChange={(e) => setSeatNumber(e.target.value.replace(/\D/g, ""))}
                    />
                  </label>

                  <button className="BtnMatte" onClick={addGuest} disabled={!guestName.trim()}>
                    CREATE + GENERATE QR
                  </button>
                </div>

                {created && (
                  <div style={{ marginTop: 14 }}>
                    <div className="InfoLine">
                      Token: <b>{created.token}</b>
                    </div>
                    <div style={{ height: 10 }} />
                    <img src={created.qrDataUrl} alt="QR" style={{ width: 220, height: 220, borderRadius: 18 }} />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="PageFooter">Programmed by Albara</div>
        </div>
      </div>
    </div>
  );
}
