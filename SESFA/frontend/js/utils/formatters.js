// Datas sempre no fuso oficial da aplicação (informado pelo servidor), nunca no fuso do navegador.
let timeZone = 'America/Fortaleza';

export const setTimezone = (value) => {
    timeZone = value;
};
export const getTimezone = () => timeZone;

function zonedParts(date) {
    const parts = new Intl.DateTimeFormat('pt-BR', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type).value;
    return {
        year: get('year'),
        month: get('month'),
        day: get('day'),
        hour: get('hour').padStart(2, '0'),
        minute: get('minute'),
    };
}

export const dateKey = (instant) => {
    const p = zonedParts(new Date(instant));
    return `${p.year}-${p.month}-${p.day}`;
};
export const todayKey = () => dateKey(new Date());

export function formatDate(instant) {
    if (!instant) return '—';
    const p = zonedParts(new Date(instant));
    return `${p.day}/${p.month}/${p.year}`;
}

export function formatTime(instant) {
    if (!instant) return '—';
    const p = zonedParts(new Date(instant));
    return `${p.hour}:${p.minute}`;
}

export const formatDateTime = (instant) => (instant ? `${formatDate(instant)} às ${formatTime(instant)}` : '—');

/** Data AAAA-MM-DD → DD/MM/AAAA, sem converter por Date (evita mudança de dia). */
export function formatDateOnly(value) {
    if (!value) return '—';
    const [year, month, day] = String(value).slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
}

const dayNumber = (key) => {
    const [year, month, day] = key.split('-').map(Number);
    return Math.round(Date.UTC(year, month - 1, day) / 86400000);
};

export function relativeDay(instant) {
    const diff = dayNumber(dateKey(instant)) - dayNumber(todayKey());
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Amanhã';
    if (diff === -1) return 'Ontem';
    return new Intl.DateTimeFormat('pt-BR', { timeZone, weekday: 'long' }).format(new Date(instant));
}

/** Converte data + hora digitadas (no fuso oficial) em instante ISO UTC. */
export function zonedToInstant(dateText, timeText) {
    const [year, month, day] = dateText.split('-').map(Number);
    const [hour, minute] = timeText.split(':').map(Number);
    const wanted = Date.UTC(year, month - 1, day, hour, minute);
    let guess = wanted;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const p = zonedParts(new Date(guess));
        const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
        const offset = asUtc - Math.floor(guess / 60000) * 60000;
        guess = wanted - offset;
    }
    return new Date(guess).toISOString();
}

export function addDays(key, days) {
    const date = new Date(dayNumber(key) * 86400000 + days * 86400000);
    return date.toISOString().slice(0, 10);
}

export function monthStart(key) {
    return `${key.slice(0, 8)}01`;
}

export function ageFrom(birthDate) {
    if (!birthDate) return null;
    const [year, month, day] = String(birthDate).slice(0, 10).split('-').map(Number);
    const [ty, tm, td] = todayKey().split('-').map(Number);
    let age = ty - year;
    if (tm < month || (tm === month && td < day)) age -= 1;
    return age;
}

export function maskPhone(value) {
    const digits = String(value).replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits ? `(${digits}` : '';
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    const split = digits.length > 10 ? 7 : 6;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, split)}-${digits.slice(split)}`;
}

export const maskPostalCode = (value) => {
    const digits = String(value).replace(/\D/g, '').slice(0, 8);
    return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
};

export const LABELS = {
    visitStatus: {
        agendada: 'Agendada',
        sem_responsavel: 'Sem responsável',
        reagendada: 'Reagendada',
        concluida: 'Concluída',
        cancelada: 'Cancelada',
        abertas: 'Em aberto',
    },
    priority: { alta: 'Alta', media: 'Média', baixa: 'Baixa' },
    needStatus: { pendente: 'Pendente', em_andamento: 'Em andamento', resolvida: 'Resolvida' },
    referralStatus: { aberto: 'Aberto', em_andamento: 'Em andamento', concluido: 'Concluído', cancelado: 'Cancelado' },
    referralType: { encaminhamento: 'Encaminhamento', pendencia: 'Pendência' },
    familyStatus: {
        cadastro_recente: 'Cadastro recente',
        aguardando_visita: 'Aguardando visita',
        em_acompanhamento: 'Em acompanhamento',
    },
    income: {
        sem_renda: 'Sem renda',
        ate_1_minimo: 'Até 1 salário mínimo',
        '1_a_2_minimos': '1 a 2 salários mínimos',
        mais_de_2_minimos: 'Mais de 2 salários mínimos',
        nao_informado: 'Não informado',
    },
    role: { gestor: 'Gestor', voluntario: 'Voluntário' },
    userStatus: { ativo: 'Ativo', inativo: 'Inativo' },
};

export const label = (group, key) => LABELS[group][key] ?? key ?? '—';
