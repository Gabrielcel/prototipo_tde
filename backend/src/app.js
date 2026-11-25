// Monta o servidor HTTP: API em /api e arquivos do frontend na mesma origem.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRouter } from './routes/index.js';
import { applySecurityHeaders, clientIp, originAllowed } from './middlewares/security.middleware.js';
import { enforceRateLimit } from './middlewares/rate-limit.middleware.js';
import { authenticate } from './middlewares/auth.middleware.js';
import { readJsonBody } from './middlewares/body.middleware.js';
import { handleError } from './middlewares/error.middleware.js';
import { ApiError } from './utils/errors.js';
import { sendError } from './utils/responses.js';
import { logger } from './utils/logger.js';

export const frontendRoot = resolve(fileURLToPath(new URL('../../frontend/', import.meta.url)));

const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon',
};
const STATIC_PREFIXES = ['css', 'js', 'assets'];
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

async function handleApi(request, response, router) {
    response.setHeader('Cache-Control', 'no-store');
    try {
        const ip = clientIp(request);
        const url = new URL(request.url || '/', 'http://localhost');
        const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
        enforceRateLimit(ip, pathname);

        const matched = router.match(request.method, pathname);
        if (!matched) throw new ApiError(404, 'Rota não encontrada.', 'NOT_FOUND');
        if (matched.allowed) {
            response.setHeader('Allow', [...new Set(matched.allowed)].join(', '));
            throw new ApiError(405, 'Método não permitido.', 'METHOD_NOT_ALLOWED');
        }

        const { route, params } = matched;
        const isWrite = WRITE_METHODS.has(request.method);
        if (isWrite && !originAllowed(request)) {
            throw new ApiError(403, 'Origem da requisição não permitida.', 'FORBIDDEN_ORIGIN');
        }

        let session = null;
        if (route.options.auth) {
            session = await authenticate(request, { csrf: isWrite, roles: route.options.roles });
            if (session.renewedCookie) response.setHeader('Set-Cookie', session.renewedCookie);
        }
        const body = isWrite ? await readJsonBody(request) : {};

        await route.handler({
            req: request,
            res: response,
            params,
            query: Object.fromEntries(url.searchParams),
            body,
            ip,
            session,
            user: session?.user ?? null,
        });
    } catch (error) {
        request.resume();
        handleError(request, response, error);
    }
}

async function serveStatic(request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        return response.end();
    }
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
    } catch {
        response.writeHead(400);
        return response.end();
    }
    if (pathname === '/favicon.ico') pathname = '/assets/images/logo/favicon.svg';

    const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const relativePath = normalize(requested);
    const filePath = resolve(frontendRoot, relativePath);
    const fromRoot = relative(frontendRoot, filePath);
    const allowed =
        relativePath === 'index.html' || STATIC_PREFIXES.some((prefix) => relativePath.startsWith(`${prefix}${sep}`));
    if (!allowed || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
        response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        return response.end('Acesso negado.');
    }

    try {
        const [content, info] = await Promise.all([readFile(filePath), stat(filePath)]);
        const etag = `"${info.size}-${Math.floor(info.mtimeMs)}"`;
        const longCache = relativePath.startsWith(`assets${sep}`);
        const headers = {
            'Content-Type': CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': longCache ? 'public, max-age=86400' : 'no-cache',
            ETag: etag,
        };
        if (request.headers['if-none-match'] === etag) {
            response.writeHead(304, headers);
            return response.end();
        }
        response.writeHead(200, { ...headers, 'Content-Length': content.length });
        response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
        const missing = error.code === 'ENOENT' || error.code === 'EISDIR';
        response.writeHead(missing ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(missing ? 'Arquivo não encontrado.' : 'Não foi possível carregar o arquivo.');
    }
}

export function createHttpServer() {
    const router = buildRouter();
    const server = createServer((request, response) => {
        const started = Date.now();
        applySecurityHeaders(request, response);
        response.on('finish', () => {
            logger.info('request', {
                method: request.method,
                path: (request.url || '').split('?')[0],
                status: response.statusCode,
                ms: Date.now() - started,
            });
        });
        const isApi = (request.url || '/').startsWith('/api/');
        const task = isApi ? handleApi(request, response, router) : serveStatic(request, response);
        task.catch((error) => {
            logger.error('Erro não tratado.', { name: error?.name });
            if (!response.headersSent)
                sendError(response, new ApiError(500, 'Erro interno. Tente novamente.', 'INTERNAL'));
        });
    });
    server.requestTimeout = 30000;
    server.headersTimeout = 15000;
    server.keepAliveTimeout = 5000;
    return server;
}
