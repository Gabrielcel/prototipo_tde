const MANAGER = { roles: ['gestor'] };

export function registerUserRoutes(router, c) {
    router.add('GET', '/api/v1/users', MANAGER, c.list);
    router.add('POST', '/api/v1/users', MANAGER, c.create);
    router.add('GET', '/api/v1/users/directory', {}, c.directory);
    router.add('PATCH', '/api/v1/users/:id', MANAGER, c.update);
    router.add('PATCH', '/api/v1/users/:id/status', MANAGER, c.updateStatus);
}
