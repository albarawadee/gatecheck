export default function Splash() {
  return (
    <div className="AppShell">
      <div className="Device">
        <div className="Screen" style={{ justifyContent: "center", alignItems: "center", padding: 24 }}>
          <img src="/logo.png" alt="Graduation Ceremony" style={{ width: 64, height: 64, borderRadius: 18 }} />
          <div style={{ marginTop: 14, fontWeight: 900, fontSize: 18, opacity: 0.95 }}>Graduation Ceremony</div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.65 }}>Loading…</div>
        </div>
      </div>
    </div>
  );
}
