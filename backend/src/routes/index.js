// Tabela de rotas da API. Perfis e CSRF são exigidos aqui, antes de qualquer controller.
import { Router } from './router.js';
import * as auth from '../controllers/auth.controller.js';
import * as users from '../controllers/users.controller.js';
import * as families from '../controllers/families.controller.js';
import * as visits from '../controllers/visits.controller.js';
import * as needs from '../controllers/needs.controller.js';
import * as reports from '../controllers/reports.controller.js';
import * as system from '../controllers/system.controller.js';
import { registerAuthRoutes } from './auth.routes.js';
import { registerUserRoutes } from './users.routes.js';
import { registerFamilyRoutes } from './families.routes.js';
import { registerVisitRoutes } from './visits.routes.js';
import { registerNeedRoutes } from './needs.routes.js';
import { registerReportRoutes } from './reports.routes.js';

export function buildRouter() {
    const router = new Router();
    router.add('GET', '/api/health', { auth: false }, system.health);
    router.add('GET', '/api/health/db', { auth: false }, system.healthDatabase);
    router.add('GET', '/api/v1/meta', { auth: false }, system.meta);
    router.add('GET', '/api/v1/audit-logs', { roles: ['gestor'] }, system.auditLogs);
    registerAuthRoutes(router, auth);
    registerUserRoutes(router, users);
    registerFamilyRoutes(router, families);
    registerVisitRoutes(router, visits);
    registerNeedRoutes(router, needs);
    registerReportRoutes(router, reports);
    return router;
}
