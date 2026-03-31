import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'adm-ui-notification-center-v1';
const UIContext = createContext(null);

function loadCenterItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCenterItems(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 80)));
  } catch {}
}

function toneMeta(tone) {
  const map = {
    success: { className: 'success', label: 'Sucesso' },
    error: { className: 'error', label: 'Erro' },
    warning: { className: 'warning', label: 'Alerta' },
    info: { className: 'info', label: 'Informação' },
    quality: { className: 'quality', label: 'Qualidade' },
  };
  return map[tone] || map.info;
}

function normalizeRoleNotification(item) {
  return {
    id: `role-${item.title}-${item.message}`,
    title: item.title,
    message: item.message,
    tone: item.severity === 'bad' ? 'error' : item.severity === 'warn' ? 'warning' : item.severity === 'quality' ? 'quality' : 'info',
    createdAt: new Date().toISOString(),
    read: false,
    transient: true,
  };
}

function ToastViewport({ toasts, removeToast }) {
  return (
    <div className="toastViewport">
      {toasts.map((toast) => {
        const meta = toneMeta(toast.tone);
        return (
          <div key={toast.id} className={`toastCard ${meta.className}`}>
            <div className="toastHeader">
              <strong>{toast.title}</strong>
              <button className="iconButton" onClick={() => removeToast(toast.id)} aria-label="Fechar notificação">×</button>
            </div>
            {toast.message ? <div className="toastBody">{toast.message}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function ModalShell({ modal, closeWith }) {
  const [value, setValue] = useState(modal?.defaultValue || '');

  useEffect(() => {
    setValue(modal?.defaultValue || '');
  }, [modal]);

  if (!modal) return null;
  const isPrompt = modal.type === 'prompt';
  const meta = toneMeta(modal.tone || (modal.danger ? 'error' : 'info'));

  return (
    <div className="modalBackdrop">
      <div className="modalCard">
        <div className="modalTitleRow">
          <div>
            <div className="modalEyebrow">Sistema de Gestão ADM</div>
            <div className="modalTitle">{modal.title}</div>
          </div>
        </div>
        {modal.message ? <div className="modalMessage">{modal.message}</div> : null}
        {isPrompt ? (
          <div className="field" style={{ marginTop: 12 }}>
            {modal.label ? <label>{modal.label}</label> : null}
            {modal.multiline ? (
              <textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={modal.placeholder || ''} />
            ) : (
              <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={modal.placeholder || ''} />
            )}
          </div>
        ) : null}
        <div className="btnRow" style={{ justifyContent: 'flex-end' }}>
          <button onClick={() => closeWith(false)}>{modal.cancelText || 'Cancelar'}</button>
          <button
            className={modal.danger ? 'danger' : 'primary'}
            onClick={() => closeWith(isPrompt ? value : true)}
          >
            {modal.confirmText || 'Confirmar'}
          </button>
        </div>
        {isPrompt && modal.required ? <div className={`small modalHelper ${meta.className}`}>Campo obrigatório para continuar.</div> : null}
      </div>
    </div>
  );
}

export function NotificationBell() {
  const ui = useAppUI();
  const unread = ui.unreadCount;
  return (
    <div className="notificationBellWrap">
      <button className="notificationBell" onClick={ui.toggleCenter}>
        <span aria-hidden="true">🔔</span>
        {unread > 0 ? <span className="notificationBadge">{unread > 99 ? '99+' : unread}</span> : null}
      </button>
      {ui.centerOpen ? (
        <div className="notificationDropdown">
          <div className="notificationDropdownHeader">
            <div>
              <div className="cardTitle" style={{ marginBottom: 0 }}>Central de notificações</div>
              <div className="small">Alertas do sistema e do fluxo operacional</div>
            </div>
            <button onClick={ui.markAllRead}>Marcar tudo como lido</button>
          </div>
          <div className="notificationList">
            {ui.centerItems.length ? ui.centerItems.map((item) => {
              const meta = toneMeta(item.tone);
              return (
                <div key={item.id} className={`notificationItem ${meta.className} ${item.read ? 'is-read' : ''}`}>
                  <div className="notificationItemTop">
                    <strong>{item.title}</strong>
                    <span className="small">{new Date(item.createdAt).toLocaleString('pt-BR')}</span>
                  </div>
                  {item.message ? <div className="small notificationText">{item.message}</div> : null}
                </div>
              );
            }) : <div className="small">Nenhuma notificação no momento.</div>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AppUIProvider({ children, roleNotifications = [] }) {
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState(null);
  const [centerOpen, setCenterOpen] = useState(false);
  const [centerItems, setCenterItems] = useState(() => loadCenterItems());
  const timeoutsRef = useRef(new Map());
  const roleSignatureRef = useRef('');

  useEffect(() => {
    saveCenterItems(centerItems.filter((item) => !item.transient));
  }, [centerItems]);

  useEffect(() => {
    const incoming = roleNotifications.map(normalizeRoleNotification);
    const signature = JSON.stringify(incoming.map((item) => item.id));
    if (signature === roleSignatureRef.current) return;
    roleSignatureRef.current = signature;
    setCenterItems((prev) => {
      const persistent = prev.filter((item) => !item.transient);
      return [...incoming, ...persistent].slice(0, 80);
    });
  }, [roleNotifications]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const notify = useCallback(({ title, message = '', tone = 'info', persist = true }) => {
    const id = crypto.randomUUID();
    const item = { id, title, message, tone, createdAt: new Date().toISOString(), read: false, transient: false };
    setToasts((prev) => [item, ...prev].slice(0, 5));
    const timeout = setTimeout(() => removeToast(id), 4200);
    timeoutsRef.current.set(id, timeout);
    if (persist) setCenterItems((prev) => [item, ...prev.filter((entry) => entry.id !== id)].slice(0, 80));
  }, [removeToast]);

  const confirmAction = useCallback((options) => new Promise((resolve) => {
    setModal({ type: 'confirm', ...options, resolve });
  }), []);

  const promptAction = useCallback((options) => new Promise((resolve) => {
    setModal({ type: 'prompt', multiline: true, ...options, resolve });
  }), []);

  const closeWith = useCallback((value) => {
    setModal((current) => {
      if (!current) return null;
      if (current.type === 'prompt') {
        if (value === false) current.resolve(null);
        else if (current.required && !String(value || '').trim()) return current;
        else current.resolve(String(value || ''));
      } else {
        current.resolve(Boolean(value));
      }
      return null;
    });
  }, []);

  const unreadCount = useMemo(() => centerItems.filter((item) => !item.read).length, [centerItems]);

  const markAllRead = useCallback(() => {
    setCenterItems((prev) => prev.map((item) => ({ ...item, read: true })));
  }, []);

  const toggleCenter = useCallback(() => {
    setCenterOpen((prev) => {
      const next = !prev;
      if (next) setCenterItems((items) => items.map((item) => ({ ...item, read: true })));
      return next;
    });
  }, []);

  const value = useMemo(() => ({
    notify,
    confirmAction,
    promptAction,
    centerOpen,
    toggleCenter,
    centerItems,
    unreadCount,
    markAllRead,
  }), [notify, confirmAction, promptAction, centerOpen, toggleCenter, centerItems, unreadCount, markAllRead]);

  return (
    <UIContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} removeToast={removeToast} />
      <ModalShell modal={modal} closeWith={closeWith} />
    </UIContext.Provider>
  );
}

export function useAppUI() {
  return useContext(UIContext);
}
