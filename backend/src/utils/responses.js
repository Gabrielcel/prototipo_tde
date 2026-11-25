// Respostas HTTP padronizadas: { data, pagination } ou { error: { code, message, details } }.
export function sendJson(res, statusCode, payload, headers = {}) {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
    });
    res.end(body);
}

export const sendData = (res, statusCode, data, headers) => sendJson(res, statusCode, { data }, headers);

export const sendList = (res, items, pagination, extra = {}) =>
    sendJson(res, 200, { data: items, pagination, ...extra });

export function sendError(res, error, headers = {}) {
    const error_ = { code: error.code, message: error.message };
    if (error.details !== undefined) error_.details = error.details;
    sendJson(res, error.statusCode, { error: error_ }, headers);
}

export function sendCsv(res, filename, content) {
    res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': Buffer.byteLength(content),
    });
    res.end(content);
}
