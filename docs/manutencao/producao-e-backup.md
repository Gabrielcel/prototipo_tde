# Produção, monitoramento e backup

## Configuração

`backend/.env` (nunca versionar). Em produção: `NODE_ENV=production`, `HOST` e `PORT` definidos, senha forte do
banco (diferente da de desenvolvimento) e `TRUST_PROXY=true` quando houver proxy reverso. Com `NODE_ENV=production`
o servidor **recusa iniciar** sem as variáveis do banco e usa cookies `Secure`.

## HTTPS

O Node escuta em HTTP; o HTTPS é feito por um proxy reverso (exemplo Nginx):

```nginx
server {
    listen 443 ssl http2;
    server_name sesfa.exemplo.org;
    # ssl_certificate / ssl_certificate_key ...
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;   # o servidor usa o último IP da lista
        proxy_set_header X-Forwarded-Proto https;
    }
}
server { listen 80; server_name sesfa.exemplo.org; return 301 https://$host$request_uri; }
```

Com `TRUST_PROXY=true` o servidor confia em `X-Forwarded-For`/`X-Forwarded-Proto`. **Só ative isso atrás do proxy**,
senão qualquer cliente poderia forjar o IP e escapar da limitação de tentativas. Para chamar a API de outra origem
(não recomendado), liste-a em `ALLOWED_ORIGINS`.

## Serviço com reinício automático (systemd)

```ini
[Unit]
Description=SESFA
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/sesfa/backend
ExecStart=/usr/bin/node --env-file=.env src/server.js
Restart=on-failure
User=sesfa
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

O servidor trata `SIGTERM`/`SIGINT` com encerramento gracioso (fecha conexões e o pool).

## Monitoramento

- `GET /api/health` — processo no ar. `GET /api/health/db` — banco acessível (200/503). Ambos devolvem só `status`.
- Logs em JSON (uma linha por evento, sem corpos de requisição, senhas ou tokens). Falhas de login ficam em `audit_logs`
  (`action = 'auth.login'`, `result = 'failure'`).
- Sugestão: monitor externo nas duas rotas de saúde e alerta para respostas 5xx e picos de 429.

## Backup e recuperação

```bash
export PGHOST=... PGDATABASE=... PGUSER=... PGPASSWORD=...
database/backup.sh /var/backups/sesfa 30        # diário (cron), retém 30 dias, valida o arquivo
database/restore-test.sh /var/backups/sesfa/ARQUIVO.dump   # teste de restauração em banco temporário
```

- **Frequência:** diária, mais um backup antes de cada migração. **Retenção:** 30 dias (ajustável).
- **Local e proteção:** diretório com permissão 700 e arquivos 600; copie também para outro servidor/mídia
  (o backup no mesmo disco não protege contra perda do disco). Os arquivos contêm dados pessoais: criptografe a cópia externa.
- **Teste de restauração:** execute `restore-test.sh` **ao menos uma vez por mês** — um backup só vale se restaura.
- **Restaurar de verdade:** crie um banco vazio e rode `pg_restore --no-owner --dbname=NOVO arquivo.dump`.

## Atualizações

1. Backup. 2. Substituir os arquivos. 3. `npm run setup`. 4. `npm run migrate`. 5. Reiniciar o serviço.
Mantenha o `package-lock.json` e rode `npm audit` periodicamente.
