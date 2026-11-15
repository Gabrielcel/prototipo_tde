// Comunicação com a API e conversão dos dados para as telas existentes.
const API_ROOT = '/api/v1';

const API = {
  user: null,
  csrfToken: null,

  async request(path, options = {}) {
    const headers = { Accept: 'application/json', ...options.headers };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (options.write && this.csrfToken) headers['X-CSRF-Token'] = this.csrfToken;

    const response = await fetch(path.startsWith('/api/') ? path : `${API_ROOT}${path}`, {
      credentials: 'same-origin',
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const result = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && this.user) {
        await this.clearSession();
        location.hash = 'login';
        render();
      }
      const error = new Error(result.error || 'Não foi possível concluir a solicitação.');
      error.statusCode = response.status;
      throw error;
    }
    if (result.csrfToken) this.csrfToken = result.csrfToken;
    if (result.user) this.user = result.user;
    return result;
  },

  async login(email, password) {
    const result = await this.request('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    await this.loadApplicationData();
    return result.user;
  },

  async bootstrap(data) {
    const result = await this.request('/auth/bootstrap', { method: 'POST', body: data });
    await this.loadApplicationData();
    return result.user;
  },

  async restoreSession() {
    const result = await this.request('/auth/me');
    this.user = result.user;
    await this.loadApplicationData();
  },

  async clearSession() {
    this.user = null;
    this.csrfToken = null;
    if (typeof S !== 'undefined') {
      S.user = null;
      S.role = 'g';
    }
  },

  async logout() {
    await this.request('/auth/logout', { method: 'POST', write: true });
    await this.clearSession();
  },

  async loadApplicationData() {
    const [families, visits, needs, users] = await Promise.all([
      this.request('/families'),
      this.request('/visits'),
      this.request('/needs'),
      this.request('/users'),
    ]);

    U.splice(0, U.length, ...users.users.map(mapUser));
    FAM.splice(0, FAM.length, ...families.families.map(mapFamily));
    V.splice(0, V.length, ...visits.visits.map(mapVisit));
    NEED.splice(0, NEED.length, ...needs.needs.map(mapNeed));
    S.reportSummaryKey = null;

    if (typeof S !== 'undefined') {
      S.user = this.user;
      S.role = this.user?.role === 'gestor' ? 'g' : 'v';
      if (S.role === 'v') S.rv = 'Todos';
    }
  },

  async refresh() {
    await this.loadApplicationData();
    render();
  },

  async loadReportSummary() {
    if (!this.user) return;
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const fromDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (S.rp === 'Últimos 7 dias') fromDate.setDate(fromDate.getDate() - 6);
    if (S.rp === 'Este mês') fromDate.setDate(1);
    const params = new URLSearchParams();
    if (S.rp !== 'Todo o período') {
      params.set('from', fromDate.toISOString().slice(0, 10));
      params.set('to', to);
    }
    if (S.role === 'g' && S.rv !== 'Todos') {
      const volunteer = U.find(user => sh(user[0]) === S.rv);
      if (volunteer?.uuid) params.set('volunteerId', volunteer.uuid);
    }
    const key = `${S.rp}|${S.rv}|${this.user.id}`;
    S.reportSummaryKey = key;
    const summary = await this.request(`/reports/summary?${params.toString()}`);
    if (S.reportSummaryKey !== key) return;
    S.reportSummary = summary;
    render();
  },
};

function titleStatus(status) {
  const labels = {
    agendada: 'Agendada',
    sem_responsavel: 'Sem responsável',
    reagendada: 'Reagendada',
    concluida: 'Concluída',
    cancelada: 'Cancelada',
    cadastro_recente: 'Cadastro recente',
    em_acompanhamento: 'Em acompanhamento',
    aguardando_visita: 'Aguardando visita',
    pendente: 'Pendente',
    em_andamento: 'Em andamento',
    resolvida: 'Resolvida',
    ativo: 'Ativo',
    inativo: 'Inativo',
  };
  return labels[status] || status;
}

function priorityLabel(priority) {
  return { alta: 'Alta', media: 'Média', baixa: 'Baixa' }[priority] || priority;
}

function incomeLabel(value) {
  return {
    sem_renda: 'Sem renda',
    ate_1_minimo: 'Até 1 salário mínimo',
    '1_a_2_minimos': '1 a 2 salários',
    mais_de_2_minimos: 'Mais de 2 salários',
    nao_informado: 'Não informado',
  }[value] || value || '';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR').format(date);
}

function formatShortDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function mapUser(user) {
  const row = [
    user.fullName,
    user.role === 'gestor' ? 'Gestor' : 'Voluntário',
    titleStatus(user.status),
    { dias: [], turno: 'Não informada', tel: '', em: user.email || '' },
  ];
  row.uuid = user.id;
  return row;
}

function mapFamily(family) {
  const row = {
    id: family.code,
    uuid: family.id,
    nm: family.contactName,
    r: sh(family.contactName),
    tel: family.phone || '',
    ee: family.email || '',
    b: family.neighborhood || '',
    m: family.memberCount || 0,
    s: titleStatus(family.status),
    p: formatShortDate(family.nextVisit),
    end: [family.street, family.neighborhood, family.city].filter(Boolean).join(', '),
    ocup: family.occupation || '',
    renda: incomeLabel(family.incomeRange),
    mem: [],
  };
  return row;
}

function mapVisit(visit) {
  const family = FAM.find(item => item.uuid === visit.familyId);
  const volunteer = U.find(item => item.uuid === visit.assignedTo);
  const scheduledAt = new Date(visit.scheduledAt);
  const row = {
    id: visit.id,
    d: formatShortDate(scheduledAt),
    w: '',
    h: Number.isNaN(scheduledAt.getTime())
      ? ''
      : `${String(scheduledAt.getHours()).padStart(2, '0')}:${String(scheduledAt.getMinutes()).padStart(2, '0')}`,
    f: family?.id || visit.familyCode,
    r: volunteer ? sh(volunteer[0]) : '',
    p: priorityLabel(visit.priority),
    s: titleStatus(visit.status),
    mo: visit.reason || '',
    familyUUID: visit.familyId,
    assignedTo: visit.assignedTo,
    volunteerName: visit.volunteerName,
    scheduledAt: visit.scheduledAt,
  };
  return row;
}

function mapNeed(need) {
  const family = FAM.find(item => item.uuid === need.familyId);
  const referral = need.referrals?.[0];
  const responsible = U.find(item => item.uuid === referral?.responsibleUserId);
  return {
    id: need.id,
    f: family?.id || need.familyCode,
    familyUUID: need.familyId,
    visitUUID: need.visitId,
    t: need.category,
    d: need.description,
    p: priorityLabel(need.priority),
    e: responsible ? sh(responsible[0]) : '',
    referralId: referral?.id,
    status: titleStatus(need.status),
    createdAt: need.createdAt,
  };
}

function localDateTime(date, time) {
  const local = new Date(`${date}T${time}:00`);
  if (Number.isNaN(local.getTime())) throw new Error('Informe uma data e um horário válidos.');
  return local.toISOString();
}

function familyUUID(code) {
  const family = FAM.find(item => item.id === code || item.uuid === code);
  if (!family) throw new Error('Família não encontrada. Atualize a tela e tente novamente.');
  return family.uuid;
}

function volunteerUUID(name) {
  const volunteer = U.find(item => item[1] === 'Voluntário' && (sh(item[0]) === name || item[0] === name));
  return volunteer?.uuid || null;
}

function apiPriority(label) {
  return { Alta: 'alta', Média: 'media', Baixa: 'baixa' }[label] || 'media';
}

async function apiFailure(error) {
  toast(error.message || 'Ocorreu um erro ao salvar.');
}

async function reloadAndRender(message) {
  try {
    await API.refresh();
    if (message) toast(message);
  } catch (error) {
    await apiFailure(error);
  }
}

