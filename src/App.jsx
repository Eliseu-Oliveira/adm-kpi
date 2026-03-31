import React, { useEffect, useMemo, useState } from "react";
import { BrowserRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { appendAudit, createAuditEvent, exportCSV, loadState, saveState, seedState } from "./store";
import Dashboard from "./pages/Dashboard";
import Entries from "./pages/Entries";
import Deviations from "./pages/Deviations";
import Masters from "./pages/Masters";
import KpiMoagemSHO from "./pages/KpiMoagemSHO";
import AuditTrail from "./pages/AuditTrail";
import Users from "./pages/Users";
import QualityPanel from "./pages/QualityPanel";
import ControlRoom from "./pages/ControlRoom";
import Login from "./pages/Login";
import { canRole, clearSession, loadSession, saveSession, ROLE_LABELS } from "./auth";
import { buildRoleNotifications } from "./notifications";
import { AppUIProvider, NotificationBell, useAppUI } from "./ui";
import admLogo from "./assets/adm-logo.png";

function Protected({ allowed, user, children }) {
  if (!user) return <Navigate to="/login" replace />;
  if (allowed && !canRole(user.role, allowed)) return <Navigate to="/" replace />;
  return children;
}

function AppShell({ state, setState, currentUser, login, logout }) {
  const ui = useAppUI();

  const ctx = useMemo(() => ({
    state,
    setState,
    currentUser,
    can: (permission) => canRole(currentUser?.role, permission),
    notify: ui.notify,
    confirmAction: ui.confirmAction,
    promptAction: ui.promptAction,
    exportCSV: () => {
      exportCSV(state);
      ui.notify({ title: 'Exportação concluída', message: 'O arquivo CSV do sistema foi gerado com sucesso.', tone: 'success' });
    },
  }), [state, setState, currentUser, ui]);

  const menu = [
    { to: "/", label: "Dashboard", permission: "VIEW_DASHBOARD" },
    { to: "/apontamentos", label: "Apontamentos", permission: "CREATE_ENTRY" },
    { to: "/desvios", label: "Desvios & Ações", permission: "MANAGE_DEVIATIONS" },
    { to: "/painel-qualidade", label: "Painel da Qualidade", permission: "VALIDATE_DEVIATIONS" },
    { to: "/cadastros", label: "Cadastros", permission: "MANAGE_MASTERS" },
    { to: "/usuarios", label: "Usuários & Permissões", permission: "MANAGE_USERS" },
    { to: "/auditoria", label: "Auditoria", permission: "MANAGE_DEVIATIONS" },
    { to: "/sala-controle", label: "Sala de Controle", permission: "VIEW_DASHBOARD" },
  ].filter((item) => canRole(currentUser?.role, item.permission));

  async function handleReset() {
    const ok = await ui.confirmAction({
      title: 'Resetar dados locais',
      message: 'Isso apaga apontamentos, desvios, auditoria e cadastros locais desta instalação. Deseja continuar?',
      confirmText: 'Resetar sistema',
      cancelText: 'Cancelar',
      danger: true,
      tone: 'error',
    });
    if (!ok) return;
    setState(seedState());
    clearSession();
    logout(false);
    ui.notify({ title: 'Sistema resetado', message: 'Todos os dados locais foram reinicializados.', tone: 'warning' });
  }

  return (
    <>
      {!currentUser ? (
        <Routes>
          <Route path="/login" element={<Login onLogin={login} users={state.users || []} logoSrc={admLogo} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      ) : (
        <div className="layout">
          <aside className="sidebar">
            <div className="brandLockup">
              <img src={admLogo} alt="ADM" className="brandLogo" />
              <div>
                <div className="brand">Sistema de Gestão ADM</div>
                <div className="brandSub">Qualidade, conformidade e monitoramento operacional</div>
              </div>
            </div>

            <div className="card cardInverse" style={{ marginBottom: 12, padding: 14 }}>
              <div className="small smallInverse">Usuário logado</div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>{currentUser.name}</div>
              <div className="small smallInverse" style={{ marginTop: 4 }}>
                {ROLE_LABELS[currentUser.role] || currentUser.role} • {currentUser.plant || "ADM"}
              </div>
              <div className="small smallInverse" style={{ marginTop: 4 }}>{currentUser.email}</div>
              <div className="btnRow" style={{ marginTop: 10 }}>
                <button onClick={() => logout(true)}>Sair</button>
              </div>
            </div>

            <div className="nav">
              {menu.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>{item.label}</NavLink>
              ))}
            </div>

            <div className="hr hrInverse" />
            <div className="btnRow">
              {ctx.can("EXPORT_DATA") ? <button onClick={ctx.exportCSV}>Exportar CSV</button> : null}
              {ctx.can("RESET_APP") ? <button className="danger" onClick={handleReset}>Reset</button> : null}
            </div>

            <div className="small smallInverse" style={{ marginTop: 10 }}>
              Ambiente corporativo com identidade ADM, rastreabilidade de ações e controle por perfil.
            </div>
          </aside>

          <main className="content">
            <div className="container">
              <div className="appTopbar">
                <div>
                  <div className="topbarTitle">Centro Operacional ADM</div>
                  <div className="small">Alertas internos, confirmações do sistema e monitoramento em tempo real.</div>
                </div>
                <div className="topbarActions">
                  <NotificationBell />
                </div>
              </div>
              <Routes>
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route path="/" element={<Protected user={currentUser} allowed="VIEW_DASHBOARD"><Dashboard ctx={ctx} /></Protected>} />
                <Route path="/apontamentos" element={<Protected user={currentUser} allowed="CREATE_ENTRY"><Entries ctx={ctx} /></Protected>} />
                <Route path="/desvios" element={<Protected user={currentUser} allowed="MANAGE_DEVIATIONS"><Deviations ctx={ctx} /></Protected>} />
                <Route path="/cadastros" element={<Protected user={currentUser} allowed="MANAGE_MASTERS"><Masters ctx={ctx} /></Protected>} />
                <Route path="/usuarios" element={<Protected user={currentUser} allowed="MANAGE_USERS"><Users ctx={ctx} /></Protected>} />
                <Route path="/painel-qualidade" element={<Protected user={currentUser} allowed="VALIDATE_DEVIATIONS"><QualityPanel ctx={ctx} /></Protected>} />
                <Route path="/auditoria" element={<Protected user={currentUser} allowed="MANAGE_DEVIATIONS"><AuditTrail ctx={ctx} /></Protected>} />
                <Route path="/sala-controle" element={<Protected user={currentUser} allowed="VIEW_DASHBOARD"><ControlRoom ctx={ctx} /></Protected>} />
                <Route path="/kpi-moagem-sho" element={<Protected user={currentUser} allowed="VIEW_DASHBOARD"><KpiMoagemSHO ctx={ctx} /></Protected>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </main>
        </div>
      )}
    </>
  );
}

export default function App() {
  const [state, setState] = useState(null);
  const [session, setSession] = useState(() => loadSession());

  useEffect(() => {
    const loaded = loadState();
    const initial = loaded || seedState();
    setState(initial);
  }, []);

  useEffect(() => {
    if (state) saveState(state);
  }, [state]);

  const currentUser = useMemo(() => {
    if (!state || !session?.userId) return null;
    return (state.users || []).find((user) => user.id === session.userId && user.active) || null;
  }, [state, session]);

  useEffect(() => {
    if (session?.userId && !currentUser) {
      clearSession();
      setSession(null);
    }
  }, [session, currentUser]);

  function login(email, password) {
    const user = (state.users || []).find(
      (item) => item.active && item.email.toLowerCase() === String(email).trim().toLowerCase() && item.password === password,
    );
    if (!user) return false;

    const nextSession = { userId: user.id, loggedAt: new Date().toISOString() };
    saveSession(nextSession);
    setSession(nextSession);
    setState((prev) => appendAudit(prev, createAuditEvent({
      entityType: "AUTH",
      entityId: user.id,
      action: "LOGIN",
      actorName: user.name,
      details: `${ROLE_LABELS[user.role] || user.role} • ${user.email}`,
    })));
    return true;
  }

  function logout(writeAudit = true) {
    if (writeAudit && currentUser) {
      setState((prev) => appendAudit(prev, createAuditEvent({
        entityType: "AUTH",
        entityId: currentUser.id,
        action: "LOGOUT",
        actorName: currentUser.name,
        details: `${ROLE_LABELS[currentUser.role] || currentUser.role} • ${currentUser.email}`,
      })));
    }
    clearSession();
    setSession(null);
  }

  const roleNotifications = useMemo(() => buildRoleNotifications(state, currentUser), [state, currentUser]);

  if (!state) return null;

  return (
    <BrowserRouter>
      <AppUIProvider roleNotifications={roleNotifications}>
        <AppShell state={state} setState={setState} currentUser={currentUser} login={login} logout={logout} />
      </AppUIProvider>
    </BrowserRouter>
  );
}
