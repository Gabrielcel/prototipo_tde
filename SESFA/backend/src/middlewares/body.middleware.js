import { ApiError } from '../utils/errors.js';

const MAX_BODY_BYTES = 64 * 1024;

/** Lê o corpo JSON com limite de tamanho; corpo vazio resulta em {}. */
export function readJsonBody(request) {
    return new Promise((resolve, reject) => {
        const length = Number(request.headers['content-length'] || 0);
        if (length > MAX_BODY_BYTES) {
            request.resume();
            return reject(new ApiError(413, 'A requisição excede o limite permitido.', 'PAYLOAD_TOO_LARGE'));
        }
        const chunks = [];
        let size = 0;
        let tooLarge = false;
        request.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) tooLarge = true;
            else chunks.push(chunk);
        });
        request.on('end', () => {
            if (tooLarge)
                return reject(new ApiError(413, 'A requisição excede o limite permitido.', 'PAYLOAD_TOO_LARGE'));
            if (!size) return resolve({});
            const contentType = request.headers['content-type']?.split(';')[0].trim();
            if (contentType !== 'application/json') {
                return reject(new ApiError(415, 'Envie o conteúdo como application/json.', 'UNSUPPORTED_MEDIA_TYPE'));
            }
            try {
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                if (!body || typeof body !== 'object' || Array.isArray(body)) {
                    return reject(new ApiError(400, 'O conteúdo JSON deve ser um objeto.', 'VALIDATION_ERROR'));
                }
                resolve(body);
            } catch {
                reject(new ApiError(400, 'O conteúdo JSON é inválido.', 'VALIDATION_ERROR'));
            }
        });
        request.on('error', reject);
    });
}
