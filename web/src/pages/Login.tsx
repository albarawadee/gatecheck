import React, { useState } from "react";
import { useAuth } from "../lib/auth";
import { useNavigate } from "react-router-dom";

const BRAND = "Graduation Ceremony";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await login(email, password);
      nav("/");
    } catch {
      setErr("Invalid email or password.");
    }
  }

  return (
    <div className="AppShell">
      <div className="Device">
        <div className="Screen">
          <div className="SectionCard">
            <div className="BrandRow" style={{ marginBottom: 12 }}>
              <img src="/logo.png" className="BrandLogo" alt={BRAND} />
              <div>
                <div className="TopTitle">{BRAND}</div>
                <div className="TopSub">Sign in</div>
              </div>
            </div>

            <form onSubmit={onSubmit}>
              <input className="InputSm" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <div style={{ height: 10 }} />
              <input className="InputSm" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <div style={{ height: 12 }} />
              <button className="BtnMatte" type="submit">LOGIN</button>
            </form>

            {err ? <div className="Banner BannerRed" style={{ marginTop: 12 }}>{err}</div> : null}
            <div className="Footer" style={{ marginTop: 12 }}>Programmed by Albara</div>
          </div>
        </div>
      </div>
    </div>
  );
}
