# Relatório de testes

Ambiente: Node.js 22, PostgreSQL 16, Chromium headless (build `@sparticuz/chromium`), Linux.
Comando: `PGHOST=… PGUSER=… PGPASSWORD=… npm test`.

## Resultado automatizado

| Conjunto | Testes | Resultado |
|---|---|---|
| Unitários (validadores, CSV, fuso, erros, limite de requisições, compatibilidade de senhas legadas) | 12 | ✅ todos |
| Integração com PostgreSQL real (autenticação, usuários, famílias, visitas, necessidades, relatórios, segurança) | 53 | ✅ todos |
| Ponta a ponta da interface (jsdom + servidor + banco reais) | 12 | ✅ todos |
| **Total** | **77** | ✅ |

Cada arquivo de integração cria e remove um banco temporário próprio.

### O que os testes comprovam (amostra)

- Primeiro gestor único; login errado/inexistente/inativo com a mesma resposta; bloqueio temporário após 5 falhas e
  liberação depois; troca de senha derruba as outras sessões; desativar usuário derruba a sessão na hora.
- Voluntário não lista nem cria usuários; não acessa famílias/visitas/necessidades de outros; visita cancelada não concede acesso.
- **Corrida de agendamento:** 4 requisições simultâneas → 1 gravada; o banco também recusa sobreposição (restrição de exclusão).
- Registro de visita atômico: falha forçada no meio desfaz tudo; registro duplicado e simultâneo → 409.
- Transições de status inválidas, reabertura só por gestor, vários encaminhamentos por necessidade.
- Datas à 23h30 de Fortaleza caem no dia correto; totais dos relatórios batem com as listagens; CSV com BOM e fórmulas neutralizadas.
- Injeção de SQL, HTML malicioso, corpo malformado/grande, travessia de diretório, CSRF e origem inválida.
- Auditoria e históricos rejeitam `UPDATE`, `DELETE` e `TRUNCATE`; famílias não podem ser apagadas com dados dependentes.
- Interface: configuração inicial, cadastro em etapas com máscaras e validação, aviso de duplicidade, agendamento com
  conflito, registro de visita, mudança de status, relatórios, sessão expirada, e **nenhum erro de console**.

## Verificações manuais/ferramentas

| Verificação | Resultado |
|---|---|
| Migração de banco criado pelo protótipo (com dados) | ✅ detectado, dados preservados, reexecução idempotente |
| Backup + restauração (`backup.sh`, `restore-test.sh`) | ✅ arquivo validado, restaurado em banco temporário (14 tabelas) |
| Capturas de tela em 1920×1080, 1366×768, 820×1180 e 390×844 (43 telas) | ✅ inspecionadas; sem rolagem horizontal |
| Acessibilidade automática (axe-core) em 11 telas | ✅ 0 violações |
| Fonte local carregada no navegador | ✅ (um erro de descritor das faces foi encontrado e corrigido) |

## Defeitos encontrados durante os testes (e corrigidos)

1. Parâmetro de fuso enviado sem uso quando não havia filtro de data (erro 503 na agenda).
2. Datas de nascimento devolvidas como objeto `Date` (dia errado); agora permanecem `AAAA-MM-DD`.
3. Atributos como `aria-current` eram escapados e não saíam no HTML (etapa atual sem destaque).
4. Ids de campo normalizados quebravam o foco automático ao adicionar integrantes/necessidades.
5. Faces da fonte com descritores diferentes impediam a Source Sans 3 de carregar.
6. Botões de ação cortados em tabelas no celular; cabeçalho de card estourando a largura.
7. Contorno de foco em títulos; nome acessível da marca; ordem de títulos em Necessidades.

## Não executado / limitações

- Não houve teste em dispositivos reais, Safari ou Firefox, nem com leitor de tela.
- Abertura do CSV no Excel/LibreOffice não foi verificada manualmente.
- HTTPS, Nginx e systemd estão documentados, mas não foram executados.
- O limitador de requisições é em memória (uma instância). Com várias instâncias seria necessário um repositório compartilhado.
- Testes de carga não foram feitos.
