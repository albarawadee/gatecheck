import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";

import Splash from "./pages/Splash";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";

function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <Guard>
              <Dashboard />
            </Guard>
          }
        />

        <Route
          path="/admin"
          element={
            <Guard>
              <Admin />
            </Guard>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
