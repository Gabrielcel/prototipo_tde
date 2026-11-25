# Controle de requisitos

Legenda: ✅ implementado e testado · 🟡 implementado, sem teste automatizado completo (veja a nota) · ⚠️ parcial ·
⛔ não implementado (motivo informado).

## Documento 01 — Técnico

| Item | Estado | Observação |
|---|---|---|
| 3.1 Funções duplicadas | ✅ | Frontend reescrito em módulos; uma implementação por funcionalidade |
| 3.2 Objeto `H` com `nu`/`su` duplicados | ✅ | Substituído por registro central de ações (`core/actions.js`) |
| 3.3 Eventos centralizados | ✅ | Um único ponto de entrada em `core/app.js` |
| 3.4 Dados fictícios fora da aplicação real | ✅ | `data.js` removido; demonstração só via `npm run seed:demo` (bloqueado em produção) |
| 3.5 Falhas de carregamento | ✅ | Cada página carrega só o que precisa; erro com “Tentar novamente” (sem `Promise.all` global) |
| 3.6 Sessão no frontend | ✅ | Restauração única, limpeza ao sair/trocar de conta, 401 volta ao login (E2E) |
| 3.7 Datas/fuso | ✅ | Fuso oficial `America/Fortaleza`; testes perto da meia-noite |
| 3.8 XSS / escape | ✅ | `html` escapa tudo; teste E2E com HTML malicioso |
| 3.9 CSV | ✅ | Gerado no servidor: UTF-8 BOM, `;`, aspas, fórmulas neutralizadas. 🟡 Abertura em Excel/LibreOffice não foi testada manualmente |
| 3.10 Vários encaminhamentos por necessidade | ✅ | Cada um com id próprio e atualização individual |
| 4.1 Limite de tentativas de login | ✅ | Por conta e por IP, expira sozinho, resposta idêntica para e-mail inexistente |
| 4.2 Permissões | ✅ | Ver `decisoes-pendentes.md` (voluntário não cadastra usuários) |
| 4.3 Acesso às famílias | ✅ | Regra por visita aberta/recente/encaminhamento; visita cancelada não concede acesso |
| 4.4 Sessões | ✅ | Limpeza periódica, renovação deslizante limitada a 24h, derrubada ao desativar |
| 4.5 Alteração de senha | ✅ | Valida atual, encerra as outras sessões, audita |
| 4.6 Erros | ✅ | Códigos 400/401/403/404/409/413/415/429/500/503 padronizados |
| 4.7 Transações | ✅ | Rollback testado com falha forçada no meio do registro de visita |
| 5.1–5.4 Famílias | ✅ | Validações, integrantes (CRUD), duplicidade com confirmação, histórico |
| 6.1 Agendamento concorrente | ✅ | Bloqueio transacional + restrição de exclusão no banco; corrida testada |
| 6.2–6.5 Visitas | ✅ | Reagendamento, cancelamento, registro e histórico completo |
| 7.1–7.3 Necessidades/encaminhamentos | ✅ | Transições validadas no backend, histórico de status |
| 8.1–8.4 Banco | ✅ | Integridade, índices, `updated_at` por trigger, exclusão segura |
| 8.5 Backup | ✅ | Scripts + procedimento; backup e restauração testados |
| 9.1–9.3 Credenciais e cabeçalhos | ✅ | scrypt, CSP, nosniff, frame-ancestors, HSTS em produção. O `.env` do original **não** foi copiado |
| 9.4 Proteção de dados (LGPD) | ⚠️ | Consentimento registrado (quem/quando/versão). **Base legal, retenção e rotinas de exclusão dependem da instituição** |
| 9.5 Auditoria | ✅ | `audit_logs` somente-inserção (API `GET /audit-logs`). ⚠️ Sem tela de consulta |
| 10.1–10.5 API | ✅ | Padronizada, paginada, filtrada, documentada. OpenAPI avaliado e não adotado |
| 11 Relatórios | ✅ | Totais conferidos contra as listagens; filtros por período/voluntário |
| 12 Organização | ✅ | Estrutura do documento 03 (desvios em `arquitetura/README.md`) |
| 13 Produção | ✅ | Host/porta por variável, encerramento gracioso, health, logs. 🟡 HTTPS/Nginx/systemd documentados, não executados aqui |
| 14–15 Testes | ✅ | Ver `relatorio-de-testes.md` |

## Documento 02 — Design e UX

| Item | Estado |
|---|---|
| Aproveitamento da tela, grids e responsividade | ✅ capturas em 1920, 1366, 820 e 390 px, sem rolagem horizontal |
| Navegação (lateral / inferior com “Mais”) | ✅ |
| Hierarquia visual, tipografia (Source Sans 3), paleta preservada | ✅ |
| Logo própria (símbolo, claro, horizontal, favicon) | ✅ |
| Login (visualizar senha, erros nos campos, carregamento, configuração inicial, mobile) | ✅ |
| Botões, cards, tabelas, formulários, modais, notificações, ícones | ✅ |
| Estados (carregando, vazio, erro, sem resultado, sem permissão) | ✅ |
| Jornadas de gestor e voluntário | ✅ percorridas no teste E2E |
| Acessibilidade | ✅ axe-core (WCAG 2.x A/AA + boas práticas): 0 violações em 11 telas. 🟡 Sem teste com leitor de tela real |

## Documento 03 — Pastas e arquivos

| Item | Estado |
|---|---|
| Estrutura frontend/backend/database/docs | ✅ |
| Nomes, indentação (4 espaços), Prettier e ESLint | ✅ |
| `.env.example`, `.gitignore`, `package-lock.json` | ✅ |

## Documento 04 — Execução e entrega

| Item | Estado |
|---|---|
| Original preservado e cópia independente | ✅ conferido por soma de verificação |
| ZIP independente, sem `node_modules` nem credenciais | ✅ |
| Verificação do ZIP extraído | ✅ ver relatório de testes |
