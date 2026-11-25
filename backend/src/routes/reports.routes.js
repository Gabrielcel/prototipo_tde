export function registerReportRoutes(router, c) {
    router.add('GET', '/api/v1/dashboard', {}, c.dashboard);
    router.add('GET', '/api/v1/reports/summary', {}, c.summary);
    router.add('GET', '/api/v1/reports/visits.csv', {}, c.visitsCsv);
}
