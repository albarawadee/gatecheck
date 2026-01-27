import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { BrowserQRCodeReader } from "@zxing/browser";
import PartyModal, { type SeatSummary } from "../ui/PartyModal";
import { useNavigate } from "react-router-dom";

type Stats = { total: number; checked: number; allIn: boolean };
const BRAND = "Graduation Ceremony";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const [stats, setStats] = useState<Stats>({ total: 0, checked: 0, allIn: false });

  const [seatNo, setSeatNo] = useState("");
  const [scanOn, setScanOn] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [seatData, setSeatData] = useState<SeatSummary | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef(new BrowserQRCodeReader());

  async function refreshStats() {
    const s = await api<Stats>("/stats", { method: "GET" });
    setStats(s);
  }

  useEffect(() => {
    refreshStats();
    const t = setInterval(refreshStats, 1500);
    return () => clearInterval(t);
  }, []);

  async function seatSearch() {
    const v = seatNo.trim();
    if (!v) return;

    setNotice(null);
    try {
      const p = await api<SeatSummary>(`/lookup/seat/${encodeURIComponent(v)}`, { method: "GET" });
      setSeatData(p);
      setModalOpen(true);
    } catch {
      setSeatData(null);
      setNotice({ kind: "error", text: "No guests found for this seat number." });
      setModalOpen(true);
    }
  }

  async function startScan() {
    setNotice(null);
    setScanOn(true);

    const video = videoRef.current!;
    try {
      await readerRef.current.decodeFromVideoDevice(undefined, video, async (result) => {
        if (!result) return;

        const payload = result.getText().trim();
        if (!payload) return;

        try {
          const p = await api<any>("/scan", { method: "POST", body: JSON.stringify({ payload }) });

          // scan يرجع seat summary لو فيه seatNumber
          setSeatData(p);

          if (p.scanAction === "already") setNotice({ kind: "error", text: "Already checked." });
          else setNotice({ kind: "ok", text: "Checked." });

          setModalOpen(true);
          await refreshStats();
        } catch {
          setSeatData(null);
          setNotice({ kind: "error", text: "QR not recognized." });
          setModalOpen(true);
        } finally {
          stopScan();
        }
      });
    } catch {
      setScanOn(false);
      setNotice({ kind: "error", text: "Camera permission denied." });
      setModalOpen(true);
    }
  }

  function stopScan() {
    try {
      readerRef.current.reset();
    } catch {}
    setScanOn(false);
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
                  <div className="TopTitle">{BRAND}</div>
                  <div className="TopSub">{user?.email || ""}</div>
                </div>
              </div>

              <div className="TopActions">
                {user?.role === "ADMIN" && (
                  <button className="IconBtn" onClick={() => nav("/admin")} aria-label="Admin Panel" title="Admin Panel">
                    Admin
                  </button>
                )}
                <button className="IconBtn" onClick={() => logout()} aria-label="Logout" title="Logout">
                  Logout
                </button>
              </div>
            </div>
          </div>

          <div className="PageBody">
            <div className="StatsRow">
              <div className="StatCard">
                <div className="StatLabel">Checked In</div>
                <div className="StatValue">{stats.checked}</div>
              </div>
              <div className="StatCard">
                <div className="StatLabel">Total Guests</div>
                <div className="StatValue">{stats.total}</div>
              </div>
            </div>

            <div className="GateGrid">
              {/* Scan */}
              <div className="GateCard">
                <div className="GateTitle">Scan QR</div>

                <div className="ScanWrap Compact">
                  <div className="ScanFrame">
                    <div className="ScanInner">
                      {scanOn ? (
                        <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline />
                      ) : (
                        <div className="ScanPlaceholder">Camera</div>
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

                <div className="BtnRowUnder">
                  {!scanOn ? (
                    <button className="BtnMatte" onClick={startScan}>
                      START SCAN
                    </button>
                  ) : (
                    <button className="BtnGhost" onClick={stopScan}>
                      STOP
                    </button>
                  )}
                </div>
              </div>

              {/* Seat Search */}
              <div className="GateCard">
                <div className="GateTitle">Seat Search</div>

                <div className="TicketRow">
                  <input
                    className="TicketInput"
                    inputMode="numeric"
                    placeholder="Seat number"
                    value={seatNo}
                    onChange={(e) => setSeatNo(e.target.value.replace(/\D/g, ""))}
                  />
                  <button className="BtnMatte" onClick={seatSearch}>
                    SEARCH
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="PageFooter">Programmed by Albara</div>

          <PartyModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            seatData={seatData}
            role={user?.role === "ADMIN" ? "ADMIN" : "ORGANIZER"}
            notice={notice}
            onCheckin={async (guestId) => {
              const p = await api<any>("/checkin", { method: "POST", body: JSON.stringify({ guestId }) });
              setSeatData(p);
              setNotice(p.already ? { kind: "error", text: "Already checked." } : { kind: "ok", text: "Checked." });
              await refreshStats();
            }}
            onCheckAllSeat={async (seatNumber) => {
              const p = await api<any>("/checkin/seat", { method: "POST", body: JSON.stringify({ seatNumber }) });
              setSeatData(p);
              setNotice({ kind: "ok", text: "All guests checked in." });
              await refreshStats();
            }}
            onEditName={async (guestId, guestName) => {
              await api(`/admin/guests/${guestId}`, { method: "PATCH", body: JSON.stringify({ guestName }) });
              if (seatData?.party?.seatNumber != null) {
                const fresh = await api<SeatSummary>(`/lookup/seat/${encodeURIComponent(String(seatData.party.seatNumber))}`, { method: "GET" });
                setSeatData(fresh);
              }
              setNotice({ kind: "ok", text: "Updated." });
            }}
            onUndo={async (guestId) => {
              const p = await api<any>("/admin/undo", { method: "POST", body: JSON.stringify({ guestId }) });
              setSeatData(p);
              setNotice({ kind: "info", text: "Undo done." });
              await refreshStats();
            }}
          />
        </div>
      </div>
    </div>
  );
}
