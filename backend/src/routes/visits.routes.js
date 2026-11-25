const MANAGER = { roles: ['gestor'] };

export function registerVisitRoutes(router, c) {
    router.add('GET', '/api/v1/visits', {}, c.list);
    router.add('POST', '/api/v1/visits', MANAGER, c.create);
    router.add('GET', '/api/v1/visits/:id', {}, c.get);
    router.add('PATCH', '/api/v1/visits/:id', MANAGER, c.update);
    router.add('POST', '/api/v1/visits/:id/record', {}, c.register);
}
