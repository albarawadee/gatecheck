// web/src/pages/Login.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { signIn } = useAuth();
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await signIn(email, password);
      nav("/dashboard");
    } catch (e: any) {
      setErr(e?.message || "Invalid email or password.");
    } finally {
      setBusy(false);
    }
  }

  const [show, setShow] = useState(false);

  return (
    <div className="AuthWrap">
      <div className="AuthCard">
        <div className="AuthTop">
          <img className="AuthLogo" src="/logo.png" alt="logo" />
          <div>
            <div className="AuthTitle">Graduation Ceremony</div>
            <div className="AuthSub">Staff Sign In</div>
          </div>
        </div>

        <form className="AuthForm" onSubmit={onSubmit}>
          <div className="Field">
            <input
              className="Input"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          <div className="Field">
            <input
              className="Input"
              placeholder="Password"
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className="EyeBtn" onClick={() => setShow((s) => !s)}>
              <span className="EyeIcon" />
            </button>
          </div>

          {err ? <div className="Badge BadgeBad" style={{ justifySelf: "center" }}>{err}</div> : null}

          <button className="LoginBtn" disabled={busy}>
            {busy ? "Signing in..." : "SIGN IN"}
          </button>

          <div className="Footer">programmed by Albara</div>
        </form>
      </div>
    </div>
  );
}
