import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

export type SeatSummary = {
  party: { id: string; seatNumber?: number | null; inviteNumber?: string | null; partySize?: number | null; tripleName?: string | null };
  stats: { checked: number; total: number; allIn: boolean };
  guests: { id: number; guestName: string; memberIndex?: number | null; checkedInAt?: string | null }[];
  groupMode?: "seat";
  seatNumber?: number;
  scannedGuestId?: number | null;
  scanAction?: "checked" | "already";
};

type Notice = { kind: "ok" | "error" | "info"; text: string } | null;

export default function PartyModal({
  open,
  onOpenChange,
  seatData,
  role,
  notice,
  onCheckin,
  onCheckAllSeat,
  onEditName,
  onUndo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  seatData: SeatSummary | null;
  role: "ADMIN" | "ORGANIZER";
  notice: Notice;
  onCheckin: (guestId: number) => Promise<void>;
  onCheckAllSeat: (seatNumber: number) => Promise<void>;
  onEditName: (guestId: number, name: string) => Promise<void>;
  onUndo: (guestId: number) => Promise<void>;
}) {
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const bannerClass =
    notice?.kind === "error" ? "Banner BannerRed" : notice?.kind === "ok" ? "Banner BannerGreen" : notice?.kind ? "Banner" : "";

  function startEdit(id: number, name: string) {
    setEditId(id);
    setEditName(name || "");
  }

  async function saveEdit() {
    if (!editId) return;
    await onEditName(editId, editName.trim());
    setEditId(null);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setEditId(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="ModalBack">
          <Dialog.Content className="ModalCard">
            <div className="ModalTop">
              <div className="ModalTitle">Seat Guests</div>
              <Dialog.Close asChild>
                <button className="CloseBtn">Close</button>
              </Dialog.Close>
            </div>

            <div className="ModalBody">
              {notice?.text ? <div className={bannerClass}>{notice.text}</div> : null}

              {!seatData ? (
                <div className="InfoLine">No data.</div>
              ) : (
                <>
                  <div className="StudentBlock">
                    <div className="StudentName">Seat #{seatData.party.seatNumber ?? "-"}</div>
                    <div className="StudentMeta">
                      <span>
                        Checked: <b>{seatData.stats.checked}</b>
                      </span>
                      <span>
                        Total: <b>{seatData.stats.total}</b>
                      </span>
                    </div>
                    {seatData.stats.allIn ? <div className="AllInBanner">All guests have entered.</div> : null}
                  </div>

                  <div className="GuestListTitle">Guests</div>

                  {seatData.guests.map((g) => {
                    const checked = !!g.checkedInAt;

                    return (
                      <div key={g.id} className="GuestRow">
                        <div className="GuestLeft">
                          <div className="GuestName">{g.guestName}</div>
                          <div className={`GuestStatus ${checked ? "BadgeOk" : "BadgeWarn"}`}>{checked ? "IN" : "OUT"}</div>
                        </div>

                        <div className="GuestActions">
                          {!checked ? (
                            <button className="IconBtnSmall IconBtnOk" onClick={() => onCheckin(g.id)} title="Check">
                              ✓
                            </button>
                          ) : role === "ADMIN" ? (
                            <button className="IconBtnSmall" onClick={() => onUndo(g.id)} title="Undo">
                              ↺
                            </button>
                          ) : (
                            <button className="IconBtnSmall IconBtnDim" disabled title="Already checked">
                              ✓
                            </button>
                          )}

                          {role === "ADMIN" ? (
                            <button className="IconBtnSmall" onClick={() => startEdit(g.id, g.guestName)} title="Edit">
                              ✎
                            </button>
                          ) : null}
                        </div>

                        {role === "ADMIN" && editId === g.id ? (
                          <div className="EditBox">
                            <input className="InputSm" value={editName} onChange={(e) => setEditName(e.target.value)} />
                            <div className="SplitRow" style={{ justifyContent: "flex-end" }}>
                              <button className="MiniBtn" onClick={() => setEditId(null)}>
                                Cancel
                              </button>
                              <button className="MiniBtn MiniBtnPrimary" onClick={saveEdit}>
                                Save
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}

                  <div className="ModalFooterRow">
                    <button
                      className="BtnMatte"
                      onClick={() => onCheckAllSeat(Number(seatData.party.seatNumber))}
                      disabled={!seatData.party.seatNumber}
                    >
                      CHECK ALL
                    </button>
                  </div>
                </>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
