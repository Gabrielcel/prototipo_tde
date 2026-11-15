import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDatabase } from './db.js';
import { handleRequest } from './routes.js';

const port = Number(process.env.PORT || 3000);
const projectRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

async function serveProjectFile(request, response) {
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

  const requestedPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const relativePath = normalize(requestedPath);
  const filePath = resolve(projectRoot, relativePath);
  const pathFromRoot = relative(projectRoot, filePath);
  const allowedFrontendFile =
    relativePath === 'index.html' ||
    relativePath === 'style.css' ||
    relativePath.startsWith(`js${sep}`) ||
    relativePath.startsWith(`assets${sep}`);
  if (!allowedFrontendFile || pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot) || filePath === projectRoot) {
    response.writeHead(403);
    return response.end();
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 500, {
      'Content-Type': 'text/plain; charset=utf-8',
    });
    response.end(error.code === 'ENOENT' ? 'Arquivo não encontrado.' : 'Não foi possível carregar o arquivo.');
  }
}

const server = createServer((request, response) => {
  if ((request.url || '/').startsWith('/api/')) return handleRequest(request, response);
  return serveProjectFile(request, response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Aplicação disponível em http://127.0.0.1:${port}`);
});

function shutdown() {
  server.close(async () => {
    await closeDatabase();
    console.log('Servidor encerrado.');
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
