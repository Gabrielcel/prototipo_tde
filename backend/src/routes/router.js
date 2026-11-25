// Roteador mínimo: associa método + caminho a um handler com opções de segurança.
export class Router {
    #routes = [];

    add(method, path, options, handler) {
        const names = [];
        const pattern = new RegExp(
            `^${path.replace(/:([a-zA-Z]+)/g, (_, name) => {
                names.push(name);
                return '([^/]+)';
            })}$`
        );
        this.#routes.push({ method, pattern, names, options: { auth: true, ...options }, handler });
    }

    match(method, pathname) {
        const allowed = [];
        for (const route of this.#routes) {
            const found = pathname.match(route.pattern);
            if (!found) continue;
            if (route.method !== method) {
                allowed.push(route.method);
                continue;
            }
            const params = {};
            route.names.forEach((name, index) => {
                try {
                    params[name] = decodeURIComponent(found[index + 1]);
                } catch {
                    params[name] = '';
                }
            });
            return { route, params };
        }
        return allowed.length ? { allowed } : null;
    }
}
