// Leitura e validação das variáveis de ambiente.
const env = process.env;

const toInt = (value, fallback) => {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const toList = (value) =>
    String(value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

const nodeEnv = env.NODE_ENV || 'development';

export const config = Object.freeze({
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    host: env.HOST || '127.0.0.1',
    port: toInt(env.PORT, 3000),
    timezone: env.APP_TIMEZONE || 'America/Fortaleza',
    logLevel: env.LOG_LEVEL || (nodeEnv === 'test' ? 'silent' : 'info'),
    database: Object.freeze({
        host: env.PGHOST,
        port: toInt(env.PGPORT, 5432),
        name: env.PGDATABASE,
        user: env.PGUSER,
        password: env.PGPASSWORD,
        ssl: env.PGSSL === 'true',
        poolMax: toInt(env.PG_POOL_MAX, 10),
        statementTimeoutMs: toInt(env.PG_STATEMENT_TIMEOUT_MS, 15000),
    }),
    session: Object.freeze({
        cookieName: 'sesfa_session',
        idleSeconds: toInt(env.SESSION_IDLE_SECONDS, 8 * 60 * 60),
        absoluteSeconds: toInt(env.SESSION_ABSOLUTE_SECONDS, 24 * 60 * 60),
        renewAfterSeconds: 5 * 60,
        cleanupIntervalMs: 15 * 60 * 1000,
        secureCookie: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : nodeEnv === 'production',
    }),
    security: Object.freeze({
        trustProxy: env.TRUST_PROXY === 'true',
        allowedOrigins: toList(env.ALLOWED_ORIGINS),
        scryptN: toInt(env.SCRYPT_N, 131072),
        maxConcurrentHashes: toInt(env.MAX_CONCURRENT_HASHES, 3),
    }),
    login: Object.freeze({
        maxFailuresPerAccount: toInt(env.LOGIN_MAX_FAILURES_ACCOUNT, 5),
        maxFailuresPerIp: toInt(env.LOGIN_MAX_FAILURES_IP, 20),
        windowSeconds: toInt(env.LOGIN_WINDOW_SECONDS, 15 * 60),
    }),
    rateLimit: Object.freeze({
        windowMs: 60 * 1000,
        maxRequests: toInt(env.RATE_LIMIT_MAX, 300),
        maxAuthRequests: toInt(env.RATE_LIMIT_AUTH_MAX, 30),
    }),
    business: Object.freeze({
        visitMinIntervalMinutes: 60,
        familyAccessDays: 30,
        consentVersion: 'v1',
    }),
});

const PLACEHOLDER_PASSWORDS = ['', 'COLOQUE_SUA_SENHA_AQUI', 'postgres', 'password', 'senha'];

/** Retorna a lista de problemas de configuração (vazia quando está tudo certo). */
export function configurationProblems() {
    const problems = [];
    const db = config.database;
    for (const [key, value] of [
        ['PGHOST', db.host],
        ['PGDATABASE', db.name],
        ['PGUSER', db.user],
    ]) {
        if (!value) problems.push(`Variável ${key} não definida.`);
    }
    if (!db.password || (config.isProduction && PLACEHOLDER_PASSWORDS.includes(db.password))) {
        problems.push('PGPASSWORD ausente ou insegura.');
    }
    if (config.isProduction && !config.session.secureCookie) {
        problems.push('Em produção os cookies devem ser Secure (HTTPS).');
    }
    try {
        new Intl.DateTimeFormat('pt-BR', { timeZone: config.timezone });
    } catch {
        problems.push(`APP_TIMEZONE inválido: ${config.timezone}.`);
    }
    return problems;
}
