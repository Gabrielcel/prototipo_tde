const MANAGER = { roles: ['gestor'] };

export function registerFamilyRoutes(router, c) {
    router.add('GET', '/api/v1/families', {}, c.list);
    router.add('GET', '/api/v1/families/options', {}, c.options);
    router.add('POST', '/api/v1/families', MANAGER, c.create);
    router.add('GET', '/api/v1/families/:id', {}, c.get);
    router.add('PATCH', '/api/v1/families/:id', MANAGER, c.update);
    router.add('GET', '/api/v1/families/:id/history', MANAGER, c.history);
    router.add('POST', '/api/v1/families/:id/members', MANAGER, c.addMember);
    router.add('PATCH', '/api/v1/families/:id/members/:memberId', MANAGER, c.updateMember);
    router.add('DELETE', '/api/v1/families/:id/members/:memberId', MANAGER, c.removeMember);
}
