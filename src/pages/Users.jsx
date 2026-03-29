import React, { useState } from 'react';
import { ROLE_LABELS, ROLES } from '../auth';
import { appendAudit, createAuditEvent } from '../store';

const ROLE_OPTIONS = [ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.QUALITY, ROLES.MANAGER, ROLES.ADMIN];

function blankUser() {
  return {
    name: '',
    email: '',
    password: '123456',
    role: ROLES.OPERATOR,
    plant: 'Preparação',
    operatorId: '',
    leaderId: '',
  };
}

export default function Users({ ctx }) {
  const { state, setState, currentUser } = ctx;
  const [draft, setDraft] = useState(blankUser());

  function addUser() {
    if (!draft.name.trim() || !draft.email.trim()) return alert('Informe nome e e-mail do usuário.');
    if ((state.users || []).some((user) => user.email.toLowerCase() === draft.email.trim().toLowerCase())) {
      return alert('Já existe um usuário com este e-mail.');
    }

    setState((prev) => {
      const created = { id: crypto.randomUUID(), active: true, ...draft, email: draft.email.trim().toLowerCase() };
      let next = { ...prev, users: [created, ...(prev.users || [])] };
      next = appendAudit(next, createAuditEvent({ entityType: 'USER', entityId: created.id, action: 'USER_CREATED', actorName: currentUser?.name || 'Administrador', details: `${created.name} • ${created.email} • ${ROLE_LABELS[created.role] || created.role}` }));
      return next;
    });
    setDraft(blankUser());
  }

  function updateUser(userId, patch, action = 'USER_UPDATED') {
    setState((prev) => {
      const current = (prev.users || []).find((user) => user.id === userId);
      if (!current) return prev;
      let next = { ...prev, users: prev.users.map((user) => (user.id === userId ? { ...user, ...patch } : user)) };
      next = appendAudit(next, createAuditEvent({ entityType: 'USER', entityId: userId, action, actorName: currentUser?.name || 'Administrador', details: `${current.name} • campos alterados: ${Object.keys(patch).join(', ')}` }));
      return next;
    });
  }

  return (
    <>
      <div className="header">
        <div>
          <div className="h1">Usuários & Permissões</div>
          <div className="sub">Controle de acesso por perfil para operação, gestão de desvios, auditoria e administração do sistema.</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="cardTitle">Novo usuário</div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <div className="field"><label>Nome</label><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
          <div className="field"><label>E-mail</label><input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
          <div className="field"><label>Senha inicial</label><input value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} /></div>
          <div className="field"><label>Planta</label><input value={draft.plant} onChange={(e) => setDraft({ ...draft, plant: e.target.value })} /></div>
          <div className="field"><label>Perfil</label><select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>{ROLE_OPTIONS.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></div>
          <div className="field"><label>Vínculo de operador</label><select value={draft.operatorId} onChange={(e) => setDraft({ ...draft, operatorId: e.target.value })}><option value="">Não vinculado</option>{state.masters.operators.filter((x) => x.active).map((operator) => <option key={operator.id} value={operator.id}>{operator.name}</option>)}</select></div>
          <div className="field"><label>Vínculo de responsável</label><select value={draft.leaderId} onChange={(e) => setDraft({ ...draft, leaderId: e.target.value })}><option value="">Não vinculado</option>{state.masters.leaders.filter((x) => x.active).map((leader) => <option key={leader.id} value={leader.id}>{leader.name}</option>)}</select></div>
        </div>
        <div className="btnRow"><button className="primary" onClick={addUser}>Adicionar usuário</button></div>
      </div>

      <div className="card">
        <div className="cardTitle">Usuários cadastrados</div>
        <table className="table">
          <thead><tr><th className="th">Nome</th><th className="th">E-mail</th><th className="th">Perfil</th><th className="th">Planta</th><th className="th">Status</th><th className="th">Senha</th><th className="th"></th></tr></thead>
          <tbody>
            {(state.users || []).map((user) => (
              <tr key={user.id} className="tr">
                <td className="td">{user.name}</td>
                <td className="td">{user.email}</td>
                <td className="td"><select value={user.role} onChange={(e) => updateUser(user.id, { role: e.target.value })}>{ROLE_OPTIONS.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></td>
                <td className="td">{user.plant || '—'}</td>
                <td className="td">{user.active ? 'Ativo' : 'Inativo'}</td>
                <td className="td"><input value={user.password || ''} onChange={(e) => updateUser(user.id, { password: e.target.value })} /></td>
                <td className="td" style={{ textAlign: 'right' }}><button onClick={() => updateUser(user.id, { active: !user.active }, user.active ? 'USER_DEACTIVATED' : 'USER_ACTIVATED')}>{user.active ? 'Desativar' : 'Ativar'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
