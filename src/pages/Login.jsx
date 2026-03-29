import React, { useState } from 'react';
import { ROLE_LABELS } from '../auth';

export default function Login({ onLogin, users, logoSrc }) {
  const [email, setEmail] = useState('admin@sho.local');
  const [password, setPassword] = useState('123456');
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const ok = onLogin(email, password);
    if (!ok) setError('Credenciais inválidas ou usuário inativo.');
  }

  return (
    <div className="loginShell">
      <div className="loginHero card">
        <div className="loginBrandLockup">
          {logoSrc ? <img src={logoSrc} alt="ADM" className="loginLogo" /> : null}
          <div>
            <div className="entryEyebrow">ADM Operational Excellence</div>
            <div className="h1" style={{ fontSize: 30 }}>Sistema de Gestão ADM</div>
            <div className="sub" style={{ maxWidth: 520 }}>
              Acesso corporativo ao monitoramento operacional, conformidade de processo, gestão de desvios e rastreabilidade de ações.
            </div>
          </div>
        </div>

        <div className="loginInfoGrid">
          <div className="summaryTile highlight">
            <span>Ambiente</span>
            <strong>ADM Corporate</strong>
            <small>Uso restrito a usuários autorizados</small>
          </div>
          <div className="summaryTile">
            <span>Escopo</span>
            <strong>Sistema de Gestão ADM</strong>
            <small>Qualidade, apontamentos, desvios, aprovação e auditoria</small>
          </div>
          <div className="summaryTile">
            <span>Compliance</span>
            <strong>Audit Trail Active</strong>
            <small>Todas as ações relevantes podem ser rastreadas</small>
          </div>
        </div>
      </div>

      <div className="loginPanel card">
        <div className="cardTitle">Entrar no sistema</div>
        <form onSubmit={handleSubmit} className="loginForm">
          <div className="field">
            <label>E-mail corporativo</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu.email@empresa.com" />
          </div>
          <div className="field">
            <label>Senha</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          {error ? <div className="alertBox alertBad loginAlert">{error}</div> : null}
          <button className="primary" type="submit">Entrar</button>
        </form>

        <div className="hr" />
        <div className="small" style={{ marginBottom: 8 }}>
          Usuários de demonstração disponíveis nesta versão offline:
        </div>
        <div className="loginDemoList">
          {users.filter((u) => u.active).map((user) => (
            <div key={user.id} className="pill loginDemoPill">
              <b>{ROLE_LABELS[user.role] || user.role}</b> • {user.email} • senha 123456
            </div>
          ))}
        </div>
        <div className="small" style={{ marginTop: 12 }}>
          Restricted system access. User activity may be monitored and audited.
        </div>
      </div>
    </div>
  );
}
