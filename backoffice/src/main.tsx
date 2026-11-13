import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { Shell } from "@/components/layout/Shell";
import { Loading } from "@/components/ui/states";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Flags } from "@/pages/Flags";
import { Login } from "@/pages/Login";
import { Notifications } from "@/pages/Notifications";
import { Overview } from "@/pages/Overview";
import { Settings } from "@/pages/Settings";
import { SqlStats } from "@/pages/SqlStats";

function App() {
  const { email, checking } = useAuth();
  if (checking) return <Loading />;
  if (!email) return <Login />;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Overview />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="flags" element={<Flags />} />
        <Route path="sql" element={<SqlStats />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/admin">
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
