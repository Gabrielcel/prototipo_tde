// Ponto de entrada: valida a configuração, inicia o servidor e trata o encerramento.
import { createHttpServer } from './app.js';
import { config, configurationProblems } from './config/environment.js';
import { checkDatabase, closeDatabase } from './config/database.js';
import { cleanupExpired } from './services/auth.service.js';
import { logger } from './utils/logger.js';

const problems = configurationProblems();
if (problems.length) {
    for (const problem of problems) logger.warn(`Configuração: ${problem}`);
    if (config.isProduction) {
        logger.error('Configuração inválida para produção. Encerrando.');
        process.exit(1);
    }
}

const server = createHttpServer();

server.listen(config.port, config.host, () => {
    logger.info(`Aplicação disponível em http://${config.host}:${config.port}`, { env: config.nodeEnv });
    checkDatabase().catch(() =>
        logger.warn('PostgreSQL indisponível. Confira o arquivo .env e execute "npm run migrate".')
    );
});

const cleanup = () =>
    cleanupExpired().catch((error) => logger.warn('Falha na limpeza de sessões.', { code: error.code }));
const cleanupTimer = setInterval(cleanup, config.session.cleanupIntervalMs);
cleanupTimer.unref();

let shuttingDown = false;
function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Encerrando (${signal})...`);
    clearInterval(cleanupTimer);
    const force = setTimeout(() => process.exit(1), 10000);
    force.unref();
    server.close(async () => {
        await closeDatabase().catch(() => {});
        logger.info('Servidor encerrado.');
        process.exit(0);
    });
    server.closeIdleConnections?.();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) =>
    logger.error('Promessa rejeitada sem tratamento.', { name: reason?.name })
);
process.on('uncaughtException', (error) => {
    logger.error('Exceção não capturada.', { name: error?.name });
    shutdown('uncaughtException');
});
