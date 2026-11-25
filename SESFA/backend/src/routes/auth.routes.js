export function registerAuthRoutes(router, c) {
    router.add('GET', '/api/v1/auth/status', { auth: false }, c.status);
    router.add('POST', '/api/v1/auth/bootstrap', { auth: false }, c.bootstrap);
    router.add('POST', '/api/v1/auth/login', { auth: false }, c.login);
    router.add('GET', '/api/v1/auth/me', {}, c.me);
    router.add('PATCH', '/api/v1/auth/me', {}, c.updateMe);
    router.add('PATCH', '/api/v1/auth/password', {}, c.changePassword);
    router.add('POST', '/api/v1/auth/logout', {}, c.logout);
}
