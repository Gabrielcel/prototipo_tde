# Backend — SESFA

API em JavaScript com o Node.js, usando HTTP nativo e PostgreSQL. O único pacote externo é `pg`, necessário para a comunicação com o banco.

## Requisitos

- Node.js 22.9 ou superior; prefira uma versão LTS com suporte ativo.
- PostgreSQL 14 ou superior.
- pgAdmin (opcional, para visualizar o banco e executar os arquivos SQL pela interface).

## Preparar o banco local

1. No pgAdmin, crie um banco chamado `sesfa_dev`.
2. Abra o Query Tool desse banco e execute os arquivos em ordem: `database/001_schema.sql`, `database/002_seed_demo.sql` e `database/003_user_sessions.sql`.
3. O arquivo `002_seed_demo.sql` insere registros fictícios e pode ser repetido sem duplicá-los. Execute `001_schema.sql` apenas uma vez por banco.
4. Na pasta `backend`, copie `.env.example` para `.env` e substitua `COLOQUE_SUA_SENHA_AQUI` pela senha local do PostgreSQL. Confira também `PGHOST`, `PGDATABASE` e `PGUSER`; `PGPORT` usa `5432` por padrão.
5. Na pasta `backend`, execute `npm install` e depois `npm run dev`.
6. Acesse `http://127.0.0.1:3000`. Na primeira abertura, crie a conta inicial de gestor na própria tela. Abra a aplicação por esse endereço, não pelo arquivo `frontend/index.html` nem por outro servidor estático.
7. A rota `http://127.0.0.1:3000/api/health` confirma que a API está rodando. A rota `/api/health/db` informa se ela conectou ao PostgreSQL (`200`) ou se a configuração/banco precisa ser conferida (`503`).

Não coloque a senha real em arquivos versionados. `backend/.env` contém a configuração local e está listado no `.gitignore`; `.env.example` contém apenas valores de exemplo.

## Rotas

- `GET /api/health`: confirma que o processo HTTP está ativo.
- `GET /api/health/db`: consulta o PostgreSQL e informa se a conexão está disponível.
- `GET /api/v1/auth/status`: informa se a configuração inicial de acesso já foi concluída.
- `POST /api/v1/auth/bootstrap`: cria o primeiro gestor uma única vez e inicia a sessão.
- `POST /api/v1/auth/login`: autentica por e-mail e senha.
- `GET /api/v1/auth/me`: retorna a conta da sessão atual e o token CSRF.
- `POST /api/v1/auth/logout`: encerra a sessão atual.
- `GET /api/v1/users`: lista nomes, perfis e status, sem expor e-mails.
- `POST /api/v1/users`: cria uma conta; gestor pode criar gestor ou voluntário, voluntário pode criar somente outro voluntário.
- `PATCH /api/v1/users/:id/status`: ativa ou desativa uma conta; somente gestor.
- `GET /api/v1/families`: lista famílias; voluntários veem somente famílias ligadas a visitas atribuídas a eles.
- `POST /api/v1/families`: cadastra família e integrantes; somente gestor.
- `GET /api/v1/families/:id`: consulta dados, integrantes, visitas e necessidades de uma família acessível.
- `PATCH /api/v1/families/:id`: atualiza dados da família; somente gestor.
- `GET /api/v1/visits`: lista visitas com filtros opcionais `status`, `from`, `to` e `volunteerId`.
- `POST /api/v1/visits`: agenda uma visita; somente gestor.
- `GET /api/v1/visits/:id`: consulta visita e registro; voluntário acessa apenas visita atribuída a ele.
- `PATCH /api/v1/visits/:id`: reagenda, atribui ou cancela uma visita; somente gestor. Cancelamento e reagendamento exigem `reason`.
- `POST /api/v1/visits/:id/record`: registra checklist, observações e necessidades e conclui a visita. Gestor ou voluntário atribuído.
- `GET /api/v1/needs` e `POST /api/v1/needs`: lista e cadastra necessidades dentro do escopo de acesso do usuário.
- `PATCH /api/v1/needs/:id`: atualiza necessidade acessível.
- `GET /api/v1/referrals`: lista encaminhamentos acessíveis.
- `POST /api/v1/needs/:id/referrals` e `PATCH /api/v1/referrals/:id`: cria ou atualiza encaminhamento acessível.
- `GET /api/v1/reports/summary`: resumo de visitas, necessidades e encaminhamentos; aceita `from`, `to` e, para gestor, `volunteerId`.

Todas as rotas que alteram dados exigem sessão, cookie e cabeçalho `X-CSRF-Token`. Voluntários têm as consultas limitadas às próprias visitas atribuídas; ao concluir uma visita, a API grava o registro e as necessidades na mesma transação.

O primeiro gestor também pode ser criado pela tela inicial. A configuração é feita uma única vez; depois, a tela passa a solicitar e-mail e senha para entrar.

O login devolve o token CSRF e grava o identificador da sessão em cookie `HttpOnly`. O cliente de API deve manter o cookie e enviar o token CSRF no cabeçalho `X-CSRF-Token` em operações de criação, alteração e saída. A senha é armazenada como hash `scrypt`; nunca é devolvida pela API.

O projeto não cria o servidor PostgreSQL nem o banco automaticamente. O PostgreSQL precisa estar instalado e iniciado na máquina; os dois arquivos SQL criam as tabelas e os exemplos no banco selecionado.

## Tabelas

- `users`: contas, perfil (`gestor` ou `voluntario`) e hash da senha.
- `families` e `family_members`: famílias e integrantes.
- `visits` e `visit_records`: agenda e registro de visita.
- `needs` e `referrals`: necessidades e encaminhamentos.
- `user_sessions`: sessões com validade de oito horas; o token de sessão é armazenado como hash.

Os dados dos arquivos de demonstração são fictícios. Não use dados reais de famílias no banco local de teste.

## Estrutura do projeto

```text
prototipo_tde/
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── assets/
│   └── js/
│       ├── api.js
│       ├── app.js
│       └── módulos das telas
└── backend/
    ├── .env (local, ignorado pelo Git)
    ├── .env.example (modelo sem senha real)
    ├── .gitignore
    ├── package.json
    ├── package-lock.json
    ├── README.md
    ├── database/
    │   ├── 001_schema.sql
    │   ├── 002_seed_demo.sql
    │   └── 003_user_sessions.sql
    └── src/
        ├── access.js
        ├── auth.js
        ├── db.js
        ├── families.js
        ├── needs.js
        ├── reports.js
        ├── routes.js
        ├── server.js
        ├── users.js
        └── visits.js
```

- `server.js`: inicia e encerra o servidor HTTP e entrega a interface web na mesma origem da API.
- `routes.js`: trata as rotas e respostas HTTP.
- `db.js`: configura o pool PostgreSQL e centraliza as consultas.
- `auth.js`: cria hashes de senha e gerencia sessões e CSRF.
- `users.js`: aplica regras de criação e acesso às contas.
- `access.js`: valida identificadores e regras de acesso compartilhadas.
- `families.js`: cadastro e consulta de famílias e integrantes.
- `visits.js`: agenda, atribuição, registro e conclusão de visitas.
- `needs.js`: necessidades e encaminhamentos.
- `reports.js`: resumo agregado para os relatórios.
- `database/*.sql`: estrutura e dados fictícios do banco.

O cliente que conecta as telas à API fica em `../frontend/js/api.js`. O servidor entrega essa pasta e a API pela mesma origem.

## Comandos

- `npm run dev`: inicia em modo de desenvolvimento, reiniciando quando os arquivos mudarem.
- `npm start`: inicia normalmente.
