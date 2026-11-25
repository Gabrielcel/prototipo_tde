# SESFA — Sistema de Acompanhamento Familiar

Aplicação web para cadastro de famílias, agenda de visitas, registro de visitas (checklist, necessidades e
encaminhamentos), relatórios e gestão de usuários. Esta é a **versão 2.0**, reconstruída a partir do protótipo
original conforme as documentações técnica, de design/UX e de organização de arquivos.

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Interface | HTML, CSS e JavaScript puros (módulos ES), sem etapa de build |
| Servidor | Node.js 22+ (somente a dependência `pg`) |
| Banco de dados | PostgreSQL 14+ |
| Tipografia e ícones | Source Sans 3 e Lucide, ambos servidos localmente (nenhuma chamada externa) |

O próprio servidor Node entrega o frontend e a API na **mesma origem** (`http://127.0.0.1:3000`). Não há um
segundo servidor para o frontend.

## Requisitos

- Node.js **22.9 ou superior** (`node -v`)
- PostgreSQL **14 ou superior**, com um banco vazio e um usuário com permissão de criar tabelas
- Extensão `btree_gist` (vem com o PostgreSQL; é criada automaticamente pela migração 003 — veja
  `docs/banco_de_dados/README.md` se o seu usuário não tiver permissão)

## Instalação e execução

```bash
# 1. Extraia o ZIP e entre na pasta
cd SESFA

# 2. Instale as dependências (raiz: ferramentas de qualidade; backend: servidor)
npm run setup

# 3. Configure o ambiente
cp backend/.env.example backend/.env
#    edite backend/.env com os dados do seu PostgreSQL (PGHOST, PGDATABASE, PGUSER, PGPASSWORD)

# 4. Crie/atualize as tabelas
npm run migrate

# 5. Inicie
npm start
#    abra http://127.0.0.1:3000
```

No **primeiro acesso**, a tela de login se transforma em *Configuração inicial*: crie a conta do gestor. Depois disso
essa tela não existe mais, e o gestor cadastra os demais usuários em **Usuários**.

Dados fictícios (apenas para demonstração, **nunca em produção**): `npm run seed:demo`. Eles têm o prefixo `DEMO-`
no código da família e não são carregados automaticamente.

### Se você já usava o protótipo original

`npm run migrate` detecta um banco criado pelos scripts originais, marca `001` e `002` como já aplicados e executa
somente a migração nova (`003_hardening.sql`). **Nenhum dado existente é apagado.** Faça um backup antes
(`database/backup.sh`).

## Estrutura de pastas

```text
SESFA/
├── frontend/            interface (index.html, css/, js/, assets/)
│   └── js/              core/ (app, router, state) · services/ · components/ · layout/ · modules/ · utils/
├── backend/
│   ├── src/             config/ · routes/ · controllers/ · services/ · middlewares/ · utils/ · app.js · server.js
│   ├── scripts/         migrate.js
│   └── tests/           unit/ · integration/
├── database/            migrations/ · seeds/ · schema/ · backup.sh · restore-test.sh
└── docs/                requisitos · arquitetura · design · banco_de_dados · api · manutencao
```

## Comandos úteis

| Comando | O que faz |
|---|---|
| `npm start` | Inicia servidor + interface |
| `npm run dev` | Inicia com recarga automática |
| `npm run migrate` | Aplica migrações pendentes |
| `npm test` | Testes unitários e de integração (exigem PostgreSQL; veja abaixo) |
| `npm run lint` / `npm run format` | ESLint / Prettier |

### Executando os testes

Os testes de integração criam e removem bancos temporários próprios. Informe um usuário PostgreSQL com permissão
para criar bancos:

```bash
PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD=sua_senha npm test
```

## Segurança — resumo

Sessão por cookie `HttpOnly` + `SameSite=Lax` (e `Secure` em produção) com token CSRF e verificação de origem;
senhas com scrypt; limitação de tentativas de login por conta e por IP; limite geral de requisições; cabeçalhos
(CSP restritiva, `nosniff`, `frame-ancestors 'none'`, HSTS em produção); escape automático de todo texto exibido;
permissões validadas no backend; auditoria e históricos protegidos contra alteração por *triggers*.

## Decisões que precisam de confirmação

Veja `docs/requisitos/decisoes-pendentes.md` (permissões de usuários, regra de acesso às famílias, transições de
status, política de exclusão). Foram adotados valores seguros por padrão, fáceis de alterar.

## Produção

Veja `docs/manutencao/producao-e-backup.md` (HTTPS por proxy reverso, variáveis, serviço, backup e restauração).
