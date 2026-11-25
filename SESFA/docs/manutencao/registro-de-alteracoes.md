# Registro de alterações — versão 2.0

Base: protótipo original (`prototipo_tde - Copia`). O original não foi modificado.

## Arquivos do original e destino

| Original | Nova versão |
|---|---|
| `backend/src/server.js`, `routes.js` | `backend/src/app.js`, `server.js`, `routes/*`, `controllers/*`, `middlewares/*` |
| `db.js` | `config/database.js` (transações com rollback seguro) |
| `auth.js`, `access.js`, `users.js` | `services/auth.service.js`, `access.service.js`, `users.service.js` |
| `families.js`, `visits.js`, `needs.js`, `reports.js` | `services/*.service.js` + controllers |
| `database/001–003*.sql` | `database/migrations/001`, `002` (inalterados), `003_hardening.sql`; demonstração em `seeds/demo.sql` |
| `frontend/index.html`, `style.css` | `frontend/index.html`, `css/**` |
| `frontend/js/{data,api,app,actions,layout,families,visits,admin,flows}.js` | `frontend/js/{core,services,components,layout,modules,utils}/**` |
| `assets/conversa-acompanhamento.png` (2 MB) | `assets/images/login/*.webp` |
| `.env` (com senha) | **não incluído**; `backend/.env.example` |

## Mudanças funcionais relevantes

- Voluntários **não** cadastram usuários (antes podiam cadastrar voluntários).
- Acesso do voluntário às famílias passou a depender de vínculo atual (antes: qualquer visita histórica).
- Data de nascimento do responsável obrigatória também no backend.
- Renda familiar passou a ser um valor controlado (a interface original gravava rótulos livres).
- Exportação de CSV agora vem do servidor (antes: texto copiado pelo navegador).
- Nova tela de Necessidades e Encaminhamentos; encaminhamentos múltiplos e com situação individual.
- Desativar usuário devolve suas visitas abertas para distribuição (no original isso só ocorria na interface de demonstração).
- Paginação em todas as listas; filtros padronizados.

## Funcionalidades removidas

- Dados e usuários fictícios embutidos no frontend (`data.js`) — substituídos por dados reais do banco.
- Edição de e-mail pelo próprio usuário no perfil (a interface original simulava; o e-mail agora é alterado por um gestor).
