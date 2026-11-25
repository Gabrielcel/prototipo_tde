// Valores permitidos compartilhados por validações e pela rota /meta.
export const PRIORITIES = ['alta', 'media', 'baixa'];
export const FAMILY_STATUSES = ['cadastro_recente', 'aguardando_visita', 'em_acompanhamento'];
export const INCOME_RANGES = ['sem_renda', 'ate_1_minimo', '1_a_2_minimos', 'mais_de_2_minimos', 'nao_informado'];
export const RELATIONSHIPS = [
    'Responsável',
    'Cônjuge',
    'Filho(a)',
    'Pai/Mãe',
    'Irmão(ã)',
    'Avô/Avó',
    'Neto(a)',
    'Outro',
];
export const VISIT_OPEN_STATUSES = ['agendada', 'reagendada', 'sem_responsavel'];
export const VISIT_ASSIGNED_OPEN_STATUSES = ['agendada', 'reagendada'];
export const VISIT_STATUSES = [...VISIT_OPEN_STATUSES, 'concluida', 'cancelada'];
export const NEED_STATUSES = ['pendente', 'em_andamento', 'resolvida'];
export const NEED_CATEGORIES = [
    'Alimentação',
    'Saúde',
    'Educação',
    'Moradia',
    'Documentação',
    'Renda e trabalho',
    'Outros',
];
export const REFERRAL_TYPES = ['encaminhamento', 'pendencia'];
export const REFERRAL_STATUSES = ['aberto', 'em_andamento', 'concluido', 'cancelado'];
export const USER_ROLES = ['gestor', 'voluntario'];
export const USER_STATUSES = ['ativo', 'inativo'];
export const CHECKLIST_ANSWERS = ['Sim', 'Não', 'Não se aplica'];
export const CHECKLIST_ITEMS = [
    'Moradia em condições adequadas de higiene e segurança',
    'Acesso a água potável e saneamento',
    'Alimentos disponíveis para todos os moradores',
    'Crianças e adolescentes frequentando a escola',
    'Moradores com acompanhamento de saúde em dia',
    'Documentação pessoal em dia',
];

// Transições permitidas. "gestorOnly" lista destinos que exigem o perfil de gestor.
export const NEED_TRANSITIONS = {
    pendente: { to: ['em_andamento', 'resolvida'], gestorOnly: [] },
    em_andamento: { to: ['pendente', 'resolvida'], gestorOnly: [] },
    resolvida: { to: ['em_andamento'], gestorOnly: ['em_andamento'] },
};
export const REFERRAL_TRANSITIONS = {
    aberto: { to: ['em_andamento', 'concluido', 'cancelado'], gestorOnly: [] },
    em_andamento: { to: ['aberto', 'concluido', 'cancelado'], gestorOnly: [] },
    concluido: { to: ['em_andamento'], gestorOnly: ['em_andamento'] },
    cancelado: { to: ['aberto'], gestorOnly: ['aberto'] },
};
