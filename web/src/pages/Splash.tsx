import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Splash() {
  const nav = useNavigate();
  const { token } = useAuth();

  React.useEffect(() => {
    const t = setTimeout(() => {
      nav(token ? "/dashboard" : "/login", { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [token, nav]);

  return (
    <div className="AuthWrap">
      <div className="AuthCard">
        <div className="AuthTop">
          <img className="AuthLogo" src="/logo.png" alt="Logo" />
          <div>
            <div className="AuthTitle">Graduation Ceremony</div>
            <div className="AuthSub">Loading…</div>
          </div>
        </div>
        <div className="Footer">Programmed by Albara</div>
      </div>
    </div>
  );
}
