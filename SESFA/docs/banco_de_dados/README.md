# Banco de dados

Migrações em `database/migrations` (aplicadas em ordem por `npm run migrate`, com controle na tabela `schema_migrations`).

| Arquivo | Conteúdo |
|---|---|
| `001_schema.sql` | Estrutura original do protótipo (usuários, famílias, integrantes, visitas, registros, necessidades, encaminhamentos) |
| `002_user_sessions.sql` | Sessões de usuário (original) |
| `003_hardening.sql` | Novidades da versão 2.0 (abaixo) |

`database/schema/estrutura.sql` é um retrato da estrutura final (gerado com `pg_dump --schema-only`) — apenas consulta.

## Novidades da migração 003

- **Auditoria e históricos** (`audit_logs`, `family_history`, `visit_history`, `status_history`): somente inserção;
  *triggers* bloqueiam `UPDATE`, `DELETE` e `TRUNCATE`.
- **`login_attempts`**: base da limitação de tentativas de login.
- **Exclusão segura**: `family_members`, `visit_records` e `referrals` passam a `ON DELETE RESTRICT`.
- **`updated_at` automático** por *trigger* em todas as tabelas com esse campo.
- **Restrições novas** (`NOT VALID`, valem para registros novos sem quebrar dados antigos): formato de e-mail e
  consistência entre situação da visita e responsável. Depois de revisar os dados, rode `VALIDATE CONSTRAINT`.
- **Sem sobreposição de horários** (`EXCLUDE USING gist`, extensão `btree_gist`) por voluntário e por família. Se a
  extensão não puder ser criada (permissão) ou já houver conflitos, a migração continua e a aplicação mantém a proteção
  por bloqueios transacionais. Para criar a extensão manualmente: `CREATE EXTENSION btree_gist;` como superusuário.
- **Índices** ligados às consultas reais (busca por nome/telefone, agenda por situação/data, necessidades e
  encaminhamentos por responsável).
- Novas colunas: `users.last_login_at`, `user_sessions.last_seen_at`, `families.consent_recorded_by/consent_version`,
  `family_members.updated_at`, `referrals.created_by`.

## Política de exclusão

Nada é excluído pela aplicação. Usuários são desativados; famílias, visitas, necessidades e históricos permanecem.
Remoções manuais em cascata são bloqueadas pelo banco. Exclusão lógica de famílias não foi necessária nesta versão.

## Backup e restauração

Veja `docs/manutencao/producao-e-backup.md`.
