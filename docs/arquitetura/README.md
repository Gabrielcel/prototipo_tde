# Arquitetura

```text
Navegador ── HTTP (mesma origem) ──▶ Node.js (backend/src/app.js)
   │                                    ├─ /api/*   → router → controller → service → PostgreSQL
   │                                    └─ demais   → arquivos de frontend/ (css, js, assets)
   └─ módulos ES em frontend/js (sem build)
```

## Backend (`backend/src`)

| Pasta | Responsabilidade |
|---|---|
| `config/` | Variáveis de ambiente (`environment.js`) e pool/transações (`database.js`) |
| `routes/` | Tabela de rotas por módulo; exige perfil e CSRF antes do controller |
| `controllers/` | Lê e **valida** a entrada (tipos, formatos, enums) e devolve a resposta HTTP |
| `services/` | Regras de negócio, permissões de acesso a registros e SQL parametrizado |
| `middlewares/` | Cabeçalhos de segurança, limite de requisições, autenticação, corpo JSON, erros |
| `utils/` | Validadores, datas/fuso, CSV seguro, paginação, erros, constantes |

Observação: não há camada `models/`. O acesso a dados fica em `services/` com SQL explícito; a camada seria
redundante para o tamanho atual do projeto (diretriz final do documento de organização).

Padrões da API: sucesso `{ data }` ou `{ data, pagination }`; erro `{ error: { code, message, details? } }`.

## Frontend (`frontend/js`)

| Pasta | Responsabilidade |
|---|---|
| `core/` | `app.js` (inicialização e **único ponto de entrada de eventos**), `router.js` (hash + permissões), `state.js`, `actions.js` (registro de ações), `config.js` |
| `services/` | `api.js` (fetch, timeout, CSRF, 401) e `auth.js` (sessão) |
| `components/` | Modal, notificações, formulários, ícones, UI compartilhada (badges, estados vazios, paginação) |
| `layout/` | Barra lateral, barra superior, navegação inferior |
| `modules/` | Uma pasta por área: auth, dashboard, families, visits, needs, users, reports, profile |
| `utils/` | `dom.js` (`html` com **escape automático**), formatadores (fuso oficial), validadores |

Segurança de exibição: todo HTML é montado com a *template tag* `html`, que escapa cada valor interpolado. Não há
`style=""` nem *scripts* inline, o que permite uma CSP sem `unsafe-inline`.

Divergências da estrutura-alvo do documento de organização: `services/storage.js` não foi criado (nada é guardado no
navegador; evita-se persistir dados de pessoas) e `modules/admin/` foi substituído por `users/` e `profile/`.
