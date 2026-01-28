// web/src/pages/Dashboard.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../lib/auth";

type CheckedBy = { id: number; name: string; email: string } | null;

type Guest = {
  id: number;
  seatNumber: string | number | null;
  inviteNumber: string | null;
  partyId: string | null;
  partySize: number | null;
  memberIndex: number | null;

  guestName: string;
  tripleName: string | null;

  checkinToken: string;
  qrPayload: string | null;
  qrFile: string | null;

  isCheckedIn: boolean;
  checkedInAt: string | null;
  checkedBy: CheckedBy;
};

type Party = {
  partyId: string | null;
  seatNumber: string | number | null;
  inviteNumber: string | null;
  partySize: number | null;

  student: Guest | null;
  guests: Guest[];

  allIn: boolean;
  checkedCount: number;
  totalCount: number;
};

type Stats = { totalGuests: number; checkedIn: number };

function displayName(g: Guest | null) {
  if (!g) return "";
  return (g.tripleName || g.guestName || "").toString();
}

export default function Dashboard() {
  const { user, logout } = useAuth() as any;
  const isAdmin = String(user?.role || "").toUpperCase() === "ADMIN";

  const [stats, setStats] = useState<Stats>({ totalGuests: 0, checkedIn: 0 });
  const [busy, setBusy] = useState(false);

  const [seatInput, setSeatInput] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const [seatNumber, setSeatNumber] = useState<string>("");
  const [parties, setParties] = useState<Party[]>([]);
  const [activePartyId, setActivePartyId] = useState<string | null>(null);

  const activeParty = useMemo(() => {
    if (!parties.length) return null;
    if (!activePartyId) return parties[0];
    return parties.find((p) => p.partyId === activePartyId) || parties[0];
  }, [parties, activePartyId]);

  const [statusBadge, setStatusBadge] = useState<{ kind: "ok" | "bad" | "warn"; text: string } | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "bad" | "warn"; text: string } | null>(null);

  // ---- Camera QR (BarcodeDetector) ----
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const [scanOn, setScanOn] = useState(false);
  const [scanSupported, setScanSupported] = useState(true);

  useEffect(() => {
    const supported = typeof (window as any).BarcodeDetector !== "undefined";
    setScanSupported(supported);
  }, []);

  function Badge({ kind, text }: { kind: "ok" | "bad" | "warn"; text: string }) {
    const cls = kind === "ok" ? "Badge BadgeOk" : kind === "bad" ? "Badge BadgeBad" : "Badge BadgeWarn";
    return <span className={cls}>{text}</span>;
  }

  async function refreshStats() {
    try {
      const s = await api.get<Stats>("/stats");
      setStats(s);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refreshStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopScan() {
    setScanOn(false);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        (videoRef.current as any).srcObject = null;
      } catch {}
    }
  }

  async function startScan() {
    setToast(null);
    setStatusBadge(null);

    if (!scanSupported) {
      setToast({ kind: "warn", text: "QR scanning is not supported in this browser." });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current = stream;
      setScanOn(true);

      if (videoRef.current) {
        (videoRef.current as any).srcObject = stream;
        await videoRef.current.play();
      }

      const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      timerRef.current = window.setInterval(async () => {
        try {
          const v = videoRef.current;
          if (!v || v.readyState < 2) return;

          canvas.width = v.videoWidth || 640;
          canvas.height = v.videoHeight || 640;
          ctx?.drawImage(v, 0, 0, canvas.width, canvas.height);

          const codes = await detector.detect(canvas);
          if (codes && codes.length) {
            const raw = String(codes[0].rawValue || "").trim();
            if (!raw) return;

            stopScan();
            await handleToken(raw);
          }
        } catch {
          // ignore tick
        }
      }, 220);
    } catch (e: any) {
      stopScan();
      setToast({ kind: "bad", text: e?.message || "Camera permission denied." });
    }
  }

  async function handleToken(token: string) {
    try {
      setBusy(true);
      setToast(null);

      // يطابق على عمود CheckinToken في السيرفر
      const r = await api.post<any>("/checkin/token", { token });

      setSeatNumber(String(r.seatNumber || ""));
      setParties(r.parties || []);
      setActivePartyId((r.parties && r.parties[0]?.partyId) || null);

      if (r.status === "already_checked") {
        setStatusBadge({ kind: "bad", text: "Already checked" });
      } else {
        setStatusBadge({ kind: "ok", text: "Checked" });
      }

      setModalOpen(true);
      refreshStats();
    } catch (e: any) {
      setToast({ kind: "bad", text: e?.message || "Token check failed." });
    } finally {
      setBusy(false);
    }
  }

  async function seatSearch() {
  const seat = seatInput.trim();
  if (!seat) return;

  try {
    setBusy(true);
    setToast(null);
    setStatusBadge(null);

    const r = await api.get<any>(`/seat/${encodeURIComponent(seat)}`);

    // ✅ خزّن البيانات
    setSeatNumber(String(r.seatNumber || seat));
    setParties(r.parties || []);
    setActivePartyId((r.parties && r.parties[0]?.partyId) || null);

    // ✅ افتح البوب أب
    setModalOpen(true);
  } catch (e: any) {
    setToast({ kind: "bad", text: e?.message || "Seat search failed." });
  } finally {
    setBusy(false);
  }
}


  async function checkGuest(id: number) {
    try {
      setBusy(true);
      await api.post(`/checkin/guest/${id}`);
      // refresh modal content
      if (seatNumber) {
        const r = await api.get<any>(`/seat/${encodeURIComponent(seatNumber)}`);
        setParties(r.parties || []);
      }
      refreshStats();
    } catch (e: any) {
      setToast({ kind: "bad", text: e?.message || "Check failed." });
    } finally {
      setBusy(false);
    }
  }

  async function checkAll(partyId: string | null) {
    if (!partyId) return;
    try {
      setBusy(true);
      await api.post(`/checkin/party`, { partyId });
      if (seatNumber) {
        const r = await api.get<any>(`/seat/${encodeURIComponent(seatNumber)}`);
        setParties(r.parties || []);
      }
      refreshStats();
    } catch (e: any) {
      setToast({ kind: "bad", text: e?.message || "Check all failed." });
    } finally {
      setBusy(false);
    }
  }

  async function undoGuest(id: number) {
    try {
      setBusy(true);
      await api.post(`/undo/guest/${id}`);
      if (seatNumber) {
        const r = await api.get<any>(`/seat/${encodeURIComponent(seatNumber)}`);
        setParties(r.parties || []);
      }
      refreshStats();
    } catch (e: any) {
      setToast({ kind: "bad", text: e?.message || "Undo failed." });
    } finally {
      setBusy(false);
    }
  }

  async function editGuest(g: Guest) {
    const newName = window.prompt("Edit guest name", g.guestName || "");
    if (newName === null) return;
    const newTriple = window.prompt("Edit triple name", g.tripleName || "") ?? "";

    try {
      setBusy(true);
      await api.put(`/admin/guest/${g.id}`, {
        guestName: newName.trim(),
        tripleName: newTriple.trim(),
      });

      if (seatNumber) {
        const r = await api.get<any>(`/seat/${encodeURIComponent(seatNumber)}`);
        setParties(r.parties || []);
      }
    } catch (e: any) {
      setToast({ kind: "bad", text: e?.message || "Edit failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
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
            {isAdmin && (
              <button
                className="Pill"
                onClick={() => (window.location.href = "/admin")}
                style={{ cursor: "pointer" }}
                title="Admin Panel"
              >
                Admin
              </button>
            )}
            <button className="Pill" onClick={logout} style={{ cursor: "pointer" }}>
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="StatsGrid">
        <div className="StatCard">
          <div className="StatLabel">Total Guests</div>
          <div className="StatValue">{stats.totalGuests}</div>
        </div>
        <div className="StatCard">
          <div className="StatLabel">Checked In</div>
          <div className="StatValue">{stats.checkedIn}</div>
        </div>
      </div>

      {toast && (
        <div style={{ marginTop: 12 }}>
          <Badge kind={toast.kind} text={toast.text} />
        </div>
      )}

      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
        {/* SCAN CARD (فوق) */}
        <div className="GateCard">
          <div className="GateTitle">Scan QR</div>

          <div className="ScanWrap">
            <div className="ScanFrame">
              <div className="ScanInner">
                {scanOn ? (
                  <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} playsInline muted />
                ) : (
                  <div className="ScanPlaceholder">{scanSupported ? "Camera ready" : "Scanner not supported"}</div>
                )}
              </div>

              <div className="ScanOverlay">
                <div className="ScanCorner SC1" />
                <div className="ScanCorner SC2" />
                <div className="ScanCorner SC3" />
                <div className="ScanCorner SC4" />
              </div>
            </div>
          </div>

          {/* زر تحت الكاميرا */}
          <div className="BtnRow">
            {!scanOn ? (
              <button className="BtnMatte" onClick={startScan} disabled={busy}>
                Start Scan
              </button>
            ) : (
              <button className="BtnGhost" onClick={stopScan}>
                Stop
              </button>
            )}
          </div>
        </div>

        {/* SEAT SEARCH CARD (تحت) */}
        <div className="GateCard">
          <div className="GateTitle">Seat Search</div>

          <div className="TicketRow">
            <input
              className="TicketInput"
              value={seatInput}
              onChange={(e) => setSeatInput(e.target.value)}
              inputMode="numeric"
              placeholder="Seat number"
              onKeyDown={(e) => {
                if (e.key === "Enter") seatSearch();
              }}
            />
            <button className="BtnGhost" onClick={seatSearch} disabled={busy}>
              Search
            </button>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="ModalBack" onMouseDown={() => setModalOpen(false)}>
          <div className="ModalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ModalTop">
              <div className="ModalTitle">
                Seat {seatNumber}
                {activeParty?.inviteNumber ? ` • Invite ${activeParty.inviteNumber}` : ""}
              </div>
              <button className="CloseBtn" onClick={() => setModalOpen(false)}>
                Close
              </button>
            </div>

            <div className="ModalBody">
              {statusBadge && <Badge kind={statusBadge.kind} text={statusBadge.text} />}

              {/* party selector */}
              {parties.length > 1 && (
                <div className="InfoLine">
                  {parties.map((p) => (
                    <button
                      key={p.partyId || `${p.inviteNumber}-${String(p.seatNumber)}`}
                      className="Pill"
                      style={{
                        marginRight: 8,
                        cursor: "pointer",
                        borderColor: activePartyId === p.partyId ? "rgba(255,255,255,.28)" : undefined,
                      }}
                      onClick={() => setActivePartyId(p.partyId)}
                    >
                      {p.inviteNumber || "Party"}
                    </button>
                  ))}
                </div>
              )}

              {/* Student block */}
              <div className="SectionCard">
                <div className="InfoLine" style={{ marginBottom: 6, fontWeight: 800 }}>
                  Student
                </div>
                <div className="InfoLine">{displayName(activeParty?.student || null)}</div>
                <div className="InfoLine" style={{ marginTop: 6 }}>
                  {activeParty?.allIn ? (
                    <Badge kind="bad" text="All checked" />
                  ) : (
                    <Badge kind="warn" text={`${activeParty?.checkedCount || 0}/${activeParty?.totalCount || 0} checked`} />
                  )}
                </div>
              </div>

              {/* Members list (الطالب + الضيوف) */}
              <div className="SectionCard">
                <div className="InfoLine" style={{ marginBottom: 8, fontWeight: 800 }}>
                  Guests
                </div>

                {activeParty?.guests?.length ? (
                  activeParty.guests.map((g, idx) => {
                    const isStudentRow = (g.memberIndex ?? 0) === 1 || idx === 0;

                    return (
                      <div key={g.id} className="GuestLine">
                        <div style={{ minWidth: 0 }}>
                          <div className="GuestName" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {g.guestName}
                            {g.memberIndex ? <span style={{ opacity: 0.55, marginLeft: 8 }}>#{g.memberIndex}</span> : null}
                          </div>

                          <div className="InfoLine" style={{ marginTop: 4 }}>
                            {g.isCheckedIn ? (
                              <span style={{ color: "var(--ok)" }}>
                                Checked
                                {g.checkedBy?.name ? ` by ${g.checkedBy.name}` : g.checkedBy?.email ? ` by ${g.checkedBy.email}` : ""}
                              </span>
                            ) : (
                              <span style={{ color: "rgba(255,255,255,.62)" }}>Not checked</span>
                            )}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {isAdmin && (
                            <button
                              className="BtnGhost"
                              style={{ height: 40, borderRadius: 14, padding: "0 10px" }}
                              onClick={() => editGuest(g)}
                              title="Edit"
                            >
                              ✎
                            </button>
                          )}

                          {g.isCheckedIn ? (
                            isAdmin ? (
                              <button
                                className="BtnGhost"
                                style={{ height: 40, borderRadius: 14, padding: "0 10px" }}
                                onClick={() => undoGuest(g.id)}
                                title="Undo"
                              >
                                Undo
                              </button>
                            ) : (
                              <button className="BtnGhost" style={{ height: 40, borderRadius: 14, padding: "0 10px", opacity: 0.6 }} disabled>
                                ✓
                              </button>
                            )
                          ) : (
                            <button
                              className="BtnMatte"
                              style={{ height: 40, borderRadius: 14, padding: "0 12px" }}
                              onClick={() => checkGuest(g.id)}
                              disabled={busy}
                              title="Check"
                            >
                              ✓
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="InfoLine">No guests found.</div>
                )}

                <div className="BtnRow" style={{ justifyContent: "space-between" }}>
                  <div />
                  <button className="BtnMatte" onClick={() => checkAll(activeParty?.partyId || null)} disabled={busy || !activeParty?.partyId}>
                    Check All
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
