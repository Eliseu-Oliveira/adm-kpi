export const SESSION_KEY = 'sho_kpi_session_v1';

export const ROLES = {
  OPERATOR: 'OPERADOR',
  SUPERVISOR: 'SUPERVISOR',
  QUALITY: 'QUALIDADE',
  MANAGER: 'GESTAO',
  ADMIN: 'ADMIN',
};

export const ROLE_LABELS = {
  [ROLES.OPERATOR]: 'Operador',
  [ROLES.SUPERVISOR]: 'Supervisor',
  [ROLES.QUALITY]: 'Qualidade',
  [ROLES.MANAGER]: 'Gestão Industrial',
  [ROLES.ADMIN]: 'Administrador',
};

export const PERMISSIONS = {
  VIEW_DASHBOARD: [ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.QUALITY, ROLES.MANAGER, ROLES.ADMIN],
  CREATE_ENTRY: [ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.QUALITY, ROLES.ADMIN],
  APPROVE_ENTRIES: [ROLES.SUPERVISOR, ROLES.QUALITY, ROLES.MANAGER, ROLES.ADMIN],
  EDIT_CONTROLLED_ENTRY: [ROLES.SUPERVISOR, ROLES.QUALITY, ROLES.MANAGER, ROLES.ADMIN],
  MANAGE_DEVIATIONS: [ROLES.SUPERVISOR, ROLES.QUALITY, ROLES.MANAGER, ROLES.ADMIN],
  VALIDATE_DEVIATIONS: [ROLES.QUALITY, ROLES.MANAGER, ROLES.ADMIN],
  MANAGE_MASTERS: [ROLES.ADMIN],
  MANAGE_USERS: [ROLES.ADMIN],
  EXPORT_DATA: [ROLES.SUPERVISOR, ROLES.QUALITY, ROLES.MANAGER, ROLES.ADMIN],
  RESET_APP: [ROLES.ADMIN],
};

export function canRole(role, permission) {
  return (PERMISSIONS[permission] || []).includes(role);
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
