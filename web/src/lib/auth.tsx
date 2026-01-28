// web/src/lib/auth.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

type User = { email: string; name: string; role: "ADMIN" | "ORGANIZER" };
type Ctx = {
  user: User | null;
  token: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<Ctx | null>(null);

const TOKEN_KEY = "gc_token";
const USER_KEY = "gc_user";

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw === "undefined" || raw === "null") return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) || "");
  const [user, setUser] = useState<User | null>(() => readJson<User>(USER_KEY));

  useEffect(() => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }, [token]);

  useEffect(() => {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  }, [user]);

  async function signIn(email: string, password: string) {
    const res = await api.post("/auth/login", { email, password });
    const t = (res as any).token as string;
    const u = (res as any).user as User;
    setToken(t);
    setUser(u);
  }

  function signOut() {
    setToken("");
    setUser(null);
  }

  const value = useMemo(() => ({ user, token, signIn, signOut }), [user, token]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
