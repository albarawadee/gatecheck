import React, { useMemo, useState } from "react";
import { api } from "../lib/api";

export type SeatGuest = {
  id: number | string;
  seat_number?: number; // from view
  seatNumber?: number; // if camelCase
  invite_number?: string;
  inviteNumber?: string;
  guest_name?: string;
  guestName?: string;
  triple_name?: string;
  tripleName?: string;
  party_id?: string;
  PartyID?: string;
  party_size?: number;
  PartySize?: number;
  member_index?: number;
  checked_in_at?: string | null;
  checkedInAt?: string | null;
  checked_in_by_user_id?: number | null;
  checkedInByUserId?: number | null;
};

function pick<T>(...vals: Array<T | undefined | null>): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null) return v;
  return undefined;
}

function padInvite(inv?: string) {
  const s = String(inv ?? "").trim();
  if (!s) return "";
  // فقط لو أرقام: زبطه 8 خانات
  if (/^\d+$/.test(s)) return s.padStart(8, "0");
  return s;
}

function fmtTime(iso?: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return String(iso);
  }
}

export function GuestRow({
  g,
  isAdmin,
  onChecked,
  onEdited,
}: {
  g: SeatGuest;
  isAdmin: boolean;
  onChecked: () => void;
  onEdited: (newName: string) => void;
}) {
  const name = pick(g.guest_name, g.guestName) ?? "";
  const triple = pick(g.triple_name, g.tripleName) ?? "";
  const checkedAt = pick(g.checked_in_at, g.checkedInAt) ?? null;
  const byId = pick(g.checked_in_by_user_id, g.checkedInByUserId) ?? null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);

  return (
    <div className="GuestLine">
      <div style={{ minWidth: 0 }}>
        {!editing ? (
          <>
            <div className="GuestName" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {name}
            </div>
            {!!triple && (
              <div className="InfoLine" style={{ marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {triple}
              </div>
            )}

            {checkedAt ? (
              <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="Badge BadgeOk">Checked</span>
                <span className="Badge">{fmtTime(checkedAt)}</span>
                {byId ? <span className="Badge">By #{byId}</span> : null}
              </div>
            ) : (
              <div style={{ marginTop: 6 }}>
                <span className="Badge BadgeWarn">Not checked</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="InfoLine" style={{ marginBottom: 8 }}>Edit guest name</div>
            <input
              className="Input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Guest name"
              style={{ height: 46, borderRadius: 14 }}
            />
            <div className="BtnRow" style={{ justifyContent: "flex-start", marginTop: 10 }}>
              <button
                className="BtnMatte"
                disabled={saving || !draft.trim()}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onEdited(draft.trim());
                    setEditing(false);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Save
              </button>
              <button
                className="BtnGhost"
                disabled={saving}
                onClick={() => {
                  setDraft(name);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {!editing ? (
          <>
            <button
              className="BtnGhost"
              onClick={onChecked}
              disabled={!!checkedAt}
              title={checkedAt ? "Already checked" : "Check in"}
              style={{ height: 44, padding: "0 14px", borderRadius: 14 }}
            >
              ✓
            </button>

            {isAdmin ? (
              <button
                className="BtnGhost"
                onClick={() => setEditing(true)}
                title="Edit"
                style={{ height: 44, padding: "0 14px", borderRadius: 14 }}
              >
                ✎
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function PartyModal({
  open,
  seatNumber,
  guests,
  isAdmin,
  onClose,
  onRefreshSeat,
}: {
  open: boolean;
  seatNumber: number;
  guests: SeatGuest[];
  isAdmin: boolean;
  onClose: () => void;
  onRefreshSeat: () => Promise<void>;
}) {
  const { studentName, invite8 } = useMemo(() => {
    // الطالب = أقل member_index (غالبًا 1)
    const sorted = [...(guests ?? [])].sort((a, b) => (pick(a.member_index, 999) as number) - (pick(b.member_index, 999) as number));
    const s = sorted[0];
    const nm = pick(s?.guest_name, s?.guestName) ?? "";
    const inv = padInvite(pick(s?.invite_number, s?.inviteNumber) ?? "");
    return { studentName: nm, invite8: inv };
  }, [guests]);

  const allChecked = useMemo(() => {
    if (!guests?.length) return false;
    return guests.every((g) => !!pick(g.checked_in_at, g.checkedInAt));
  }, [guests]);

  if (!open) return null;

  return (
    <div className="ModalBackdrop">
      <div className="ModalCard">
        <div className="ModalHeader">
          <div style={{ minWidth: 0 }}>
            <div className="ModalTitle" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Seat {seatNumber}
            </div>
            <div className="InfoLine" style={{ marginTop: 6 }}>
              <b style={{ color: "rgba(255,255,255,.92)" }}>{studentName || "—"}</b>
              {invite8 ? (
                <span style={{ marginLeft: 10, opacity: 0.9 }}>
                  • Invite: <b style={{ color: "rgba(255,255,255,.92)" }}>{invite8}</b>
                </span>
              ) : null}
            </div>

            <div style={{ marginTop: 10 }}>
              {allChecked ? (
                <span className="Badge BadgeOk">All checked</span>
              ) : (
                <span className="Badge BadgeWarn">Pending</span>
              )}
            </div>
          </div>

          <button className="CloseBtn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="ModalBody">
          <div className="InfoLine" style={{ marginTop: 2 }}>
            Guests ({guests?.length ?? 0})
          </div>

          {/* Guests */}
          <div style={{ display: "grid", gap: 10 }}>
            {guests.map((g) => (
              <GuestRow
                key={String(g.id)}
                g={g}
                isAdmin={isAdmin}
                onChecked={async () => {
                  await api.post(`/checkin/guest/${g.id}`);
                  await onRefreshSeat();
                }}
                onEdited={async (newName) => {
                  // Backend لازم يدعم هالمسار للادمن
                  await api.put(`/admin/guest/${g.id}`, { guestName: newName });
                  await onRefreshSeat();
                }}
              />
            ))}
          </div>

          {/* Check all */}
          <div className="BtnRow" style={{ justifyContent: "space-between" }}>
            <button
              className="BtnMatte"
              disabled={allChecked}
              onClick={async () => {
                const pending = guests.filter((g) => !pick(g.checked_in_at, g.checkedInAt));
                if (!pending.length) return;
                await Promise.all(pending.map((g) => api.post(`/checkin/guest/${g.id}`)));
                await onRefreshSeat();
              }}
            >
              Check All
            </button>

            <button className="BtnGhost" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
