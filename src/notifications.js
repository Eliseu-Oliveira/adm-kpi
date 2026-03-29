import { getKpiLabel } from './store';

export function shiftLabel(shift) {
  return { MANHA: 'Manhã', TARDE: 'Tarde', NOITE: 'Noite' }[shift] || shift || '—';
}

export function buildRoleNotifications(state, currentUser) {
  if (!state || !currentUser) return [];
  const deviations = state.deviations || [];
  const entries = state.entries || [];
  const today = new Date().toISOString().slice(0, 10);
  const notifications = [];

  const overdueDeviations = deviations.filter((d) => d.status !== 'CONCLUIDO' && d.dueDate && d.dueDate < today);
  const pendingApprovals = entries.filter((e) => e.approvalStatus === 'AGUARDANDO_APROVACAO');
  const rejectedEntries = entries.filter((e) => e.approvalStatus === 'REPROVADO');
  const qualityQueue = deviations.filter((d) => ['CONTIDO', 'VALIDADO_QUALIDADE'].includes(d.status));
  const recurrentMap = deviations.reduce((acc, dev) => {
    acc[dev.kpiKey] = (acc[dev.kpiKey] || 0) + 1;
    return acc;
  }, {});
  const recurrent = Object.entries(recurrentMap)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);

  switch (currentUser.role) {
    case 'OPERADOR': {
      const ownEntries = entries.filter((e) => e.operatorId && e.operatorId === currentUser.operatorId);
      const ownPending = ownEntries.filter((e) => e.approvalStatus === 'AGUARDANDO_APROVACAO').length;
      const ownRejected = ownEntries.filter((e) => e.approvalStatus === 'REPROVADO').length;
      if (ownPending) notifications.push({ severity: 'warn', title: 'Apontamentos aguardando aprovação', message: `${ownPending} apontamento(s) do seu usuário aguardam validação.` });
      if (ownRejected) notifications.push({ severity: 'bad', title: 'Apontamentos reprovados', message: `${ownRejected} apontamento(s) precisam de revisão e novo envio.` });
      break;
    }
    case 'SUPERVISOR': {
      if (pendingApprovals.length) notifications.push({ severity: 'warn', title: 'Aprovações pendentes', message: `${pendingApprovals.length} apontamento(s) aguardando revisão do fluxo.` });
      if (overdueDeviations.length) notifications.push({ severity: 'bad', title: 'Desvios em atraso', message: `${overdueDeviations.length} desvio(s) com SLA vencido exigem contenção imediata.` });
      if (qualityQueue.length) notifications.push({ severity: 'info', title: 'Itens para Qualidade', message: `${qualityQueue.length} desvio(s) já podem ser encaminhados ou concluídos com a Qualidade.` });
      break;
    }
    case 'QUALIDADE': {
      if (qualityQueue.length) notifications.push({ severity: 'quality', title: 'Fila da Qualidade', message: `${qualityQueue.length} desvio(s) aguardam validação final ou conclusão.` });
      if (overdueDeviations.length) notifications.push({ severity: 'bad', title: 'SLA em risco', message: `${overdueDeviations.length} desvio(s) estão em atraso e precisam de parecer prioritário.` });
      if (recurrent.length) notifications.push({ severity: 'warn', title: 'Reincidência detectada', message: `${getKpiLabel(recurrent[0][0])} já apareceu ${recurrent[0][1]} vez(es).` });
      break;
    }
    case 'GESTAO':
    case 'ADMIN': {
      if (overdueDeviations.length) notifications.push({ severity: 'bad', title: 'Desvios em atraso', message: `${overdueDeviations.length} desvio(s) estão fora do SLA.` });
      if (pendingApprovals.length) notifications.push({ severity: 'warn', title: 'Aprovações pendentes', message: `${pendingApprovals.length} apontamento(s) aguardam aprovação.` });
      if (qualityQueue.length) notifications.push({ severity: 'quality', title: 'Pendências da Qualidade', message: `${qualityQueue.length} item(ns) estão na fila de validação.` });
      if (recurrent.length) notifications.push({ severity: 'info', title: 'KPI reincidente', message: `${getKpiLabel(recurrent[0][0])} lidera reincidência com ${recurrent[0][1]} ocorrência(s).` });
      break;
    }
    default:
      break;
  }

  return notifications.slice(0, 4);
}

export function buildQualityPanelData(state) {
  const deviations = state?.deviations || [];
  const entries = state?.entries || [];
  const today = new Date().toISOString().slice(0, 10);
  const qualityQueue = deviations.filter((d) => ['CONTIDO', 'VALIDADO_QUALIDADE'].includes(d.status));
  const overdueList = deviations.filter((d) => d.status !== 'CONCLUIDO' && d.dueDate && d.dueDate < today);
  const recentlyValidated = deviations
    .filter((d) => d.qualityValidatedAt || d.closedAt)
    .sort((a, b) => String(b.qualityValidatedAt || b.closedAt || '').localeCompare(String(a.qualityValidatedAt || a.closedAt || '')))
    .slice(0, 8);
  const rejectedEntries = entries.filter((e) => e.approvalStatus === 'REPROVADO').slice(0, 8);
  return { qualityQueue, overdueList, recentlyValidated, rejectedEntries };
}
