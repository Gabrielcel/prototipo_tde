# API do SESFA (v1)

Base: `/api/v1`. JSON em UTF-8. Autenticação por cookie de sessão `HttpOnly`; **operações de escrita** (POST, PATCH,
DELETE) exigem o cabeçalho `X-CSRF-Token` (devolvido em `/auth/login`, `/auth/bootstrap` e `/auth/me`) e, se houver
`Origin`, que seja a mesma origem.

**Respostas:** `{ "data": … }`; listas: `{ "data": [...], "pagination": { page, limit, total, totalPages } }`;
erro: `{ "error": { "code", "message", "details?" } }`.

**Paginação:** `?page=1&limit=25` (limite máximo 200). **Datas:** `AAAA-MM-DD` (filtros e nascimentos) e ISO 8601 com
fuso (`2026-12-01T09:00:00-03:00`) para horários de visita.

**Códigos HTTP:** 400 dados inválidos · 401 sem sessão · 403 sem permissão/CSRF · 404 inexistente ou inacessível ·
405 método · 409 conflito (horário, duplicidade, transição inválida) · 413 corpo grande · 415 tipo de conteúdo ·
429 muitas tentativas/requisições (`Retry-After`) · 500 falha interna · 503 serviço indisponível.

Perfis: **G** = gestor · **V** = voluntário (dentro do seu escopo) · **—** = pública.

## Sistema e autenticação

| Método e rota | Perfil | Descrição |
|---|---|---|
| `GET /api/health`, `GET /api/health/db` | — | Saúde (somente `status`) |
| `GET /meta` | — | Fuso, enums, itens do checklist, transições permitidas |
| `GET /auth/status` | — | `{ initialized }` |
| `POST /auth/bootstrap` | — | Cria o primeiro gestor (`fullName, email, password`); 409 se já existir usuário |
| `POST /auth/login` | — | `{ email, password }`. Mesmo erro para e-mail inexistente, senha errada e conta inativa; 429 após falhas repetidas |
| `GET /auth/me` · `PATCH /auth/me` | G V | Sessão atual · alterar nome |
| `PATCH /auth/password` | G V | `{ currentPassword, newPassword }`; encerra as outras sessões |
| `POST /auth/logout` | G V | Encerra a sessão |
| `GET /audit-logs` | G | Auditoria (`action`, `userId`, paginação) |

## Usuários

| Rota | Perfil | Descrição |
|---|---|---|
| `GET /users` | G | Lista (`search, role, status`, paginação) |
| `POST /users` | G | `{ fullName, email, password, role }` |
| `GET /users/directory` | G V | Usuários ativos: apenas `id, fullName, role` |
| `PATCH /users/:id` | G | `{ fullName?, role? }`; mudar perfil encerra sessões; protege o último gestor |
| `PATCH /users/:id/status` | G | `{ status: ativo|inativo }`; desativar encerra sessões e devolve visitas abertas à distribuição; impede autodesativação |

## Famílias

| Rota | Perfil | Descrição |
|---|---|---|
| `GET /families` | G V | `search, status`, paginação (V: só famílias do seu escopo) |
| `GET /families/options?search=` | G V | Seletor leve (até 30) |
| `POST /families` | G | Cadastro com `members[]`, `consentGiven: true`. 409 `POSSIBLE_DUPLICATE` com `details.candidates`; reenviar com `confirmDuplicate: true` |
| `GET /families/:id` | G V | Detalhe com integrantes, visitas e necessidades (V: somente as suas) |
| `PATCH /families/:id` | G | Campos parciais, `status`, `birthDate` (do responsável); gera histórico |
| `GET /families/:id/history` | G | Histórico de alterações |
| `POST/PATCH/DELETE /families/:id/members[/:memberId]` | G | Gerencia integrantes (o responsável não é removível) |

## Visitas

| Rota | Perfil | Descrição |
|---|---|---|
| `GET /visits` | G V | `status` (inclui `abertas`), `from`, `to`, `volunteerId`, `familyId`, `order`, paginação (V: só as suas) |
| `POST /visits` | G | `{ familyId, scheduledAt, priority, assignedTo? }`; 409 `SCHEDULE_CONFLICT` |
| `GET /visits/:id` | G V | Detalhe, registro, necessidades e (G) histórico |
| `PATCH /visits/:id` | G | Reagendar (`scheduledAt` + `reason`), atribuir (`assignedTo`), `priority`, cancelar (`status: cancelada` + `reason`) |
| `POST /visits/:id/record` | G V | `{ checklistAnswers[6], conditions?, observations?, needs[]: { category, description, priority, referrals[] } }` — tudo na mesma transação |

## Necessidades e encaminhamentos

| Rota | Perfil | Descrição |
|---|---|---|
| `GET /needs` | G V | `status, priority, category, familyId, hasReferral`, paginação |
| `POST /needs` | G V | `{ familyId, visitId?, category, description, priority }` |
| `GET /needs/:id` · `PATCH /needs/:id` | G V | Detalhe com histórico · editar/mudar situação (transições validadas) |
| `POST /needs/:id/referrals` | G V | `{ type, responsibleUserId?, description? }` — vários por necessidade |
| `GET /referrals` | G V | `status, type, needId, responsibleId, mine`, paginação |
| `PATCH /referrals/:id` | G · responsável | `{ status?, responsibleUserId? (G), description? }` |

## Relatórios

| Rota | Perfil | Descrição |
|---|---|---|
| `GET /dashboard` | G V | Indicadores e próximas visitas |
| `GET /reports/summary` | G V | `from, to, volunteerId` (V é fixado nele mesmo) |
| `GET /reports/visits.csv` | G V | CSV (UTF-8 com BOM, `;`), mesmos filtros + `status`; protegido contra injeção de fórmulas |

OpenAPI/Swagger foi avaliado e **não adotado** nesta versão para não acrescentar dependências; este documento é a
referência. Pode ser gerado depois a partir da tabela de rotas em `backend/src/routes`.
