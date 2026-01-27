import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Login() {
  const nav = useNavigate();
  const auth = useAuth();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [err, setErr] = React.useState<string>("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await auth.login(email.trim(), password);
      nav("/dashboard");
    } catch (e: any) {
      setErr(e?.message || "Invalid email or password.");
    }
  }

  return (
    <div className="AuthWrap">
      <div className="AuthCard">
        <div className="AuthTop">
          <img className="AuthLogo" src="/logo.png" alt="Logo" />
          <div style={{ textAlign: "center" }}>
            <div className="AuthTitle">Graduation Ceremony</div>
            <div className="AuthSub">Sign in to continue</div>
          </div>
        </div>

        <form className="AuthForm" onSubmit={onSubmit}>
          <div className="Field">
            <input
              className="Input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              inputMode="email"
              required
            />
          </div>

          <div className="Field">
            <input
              className="Input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              type={showPw ? "text" : "password"}
              required
            />
            <button
              type="button"
              className="EyeBtn"
              onClick={() => setShowPw((s) => !s)}
              aria-label="Toggle password visibility"
            >
              <span className="EyeIcon" />
            </button>
          </div>

          {err ? (
            <div style={{ textAlign: "center", color: "rgba(255,120,120,.95)", fontSize: 13 }}>
              {err}
            </div>
          ) : null}

          <button className="LoginBtn" type="submit">
            SIGN IN
          </button>
        </form>
      </div>
    </div>
  );
}
