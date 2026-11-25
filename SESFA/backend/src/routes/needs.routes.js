export function registerNeedRoutes(router, c) {
    router.add('GET', '/api/v1/needs', {}, c.list);
    router.add('POST', '/api/v1/needs', {}, c.create);
    router.add('GET', '/api/v1/needs/:id', {}, c.get);
    router.add('PATCH', '/api/v1/needs/:id', {}, c.update);
    router.add('POST', '/api/v1/needs/:id/referrals', {}, c.createReferral);
    router.add('GET', '/api/v1/referrals', {}, c.listReferrals);
    router.add('PATCH', '/api/v1/referrals/:id', {}, c.updateReferral);
}
