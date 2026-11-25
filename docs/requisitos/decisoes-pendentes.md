# Decisões adotadas e pendentes de confirmação

A documentação técnica pede que algumas regras sejam **confirmadas** com os responsáveis pelo projeto. Enquanto isso,
foram adotados os padrões abaixo (os mais restritivos e seguros). Cada um está isolado em um único ponto do código.

| # | Tema | Decisão adotada | Onde alterar |
|---|---|---|---|
| 1 | Voluntário cadastra voluntários? | **Não.** Somente gestores criam, editam e desativam usuários. Voluntários só enxergam um diretório mínimo (nome e perfil) para escolher responsáveis. | `backend/src/routes/users.routes.js` |
| 2 | Quem acessa uma família (voluntário) | Visita **aberta** atribuída a ele; visita **concluída** por ele nos últimos **30 dias**; ou encaminhamento aberto sob sua responsabilidade. Visita cancelada não concede acesso. | `backend/src/services/access.service.js`, `config.business.familyAccessDays` |
| 3 | Necessidades visíveis ao voluntário | Apenas as que ele criou, as de visitas dele e as com encaminhamento sob sua responsabilidade (dentro das famílias acessíveis). | `volunteerNeedScope` |
| 4 | Sessão após trocar a senha | A sessão usada na troca continua ativa; todas as outras são encerradas. | `users.service.js › changePassword` |
| 5 | Intervalo mínimo entre visitas | 60 minutos (família e voluntário). A restrição de banco assume 60; se mudar, ajuste também `003_hardening.sql`. | `config.business.visitMinIntervalMinutes` |
| 6 | Transição de necessidades | pendente ↔ em andamento → resolvida. **Reabrir** uma necessidade resolvida: somente gestor. | `utils/constants.js › NEED_TRANSITIONS` |
| 7 | Transição de encaminhamentos | aberto/em andamento → concluído ou cancelado. **Reabrir** concluído ou cancelado: somente gestor. Só o responsável ou um gestor altera. | `REFERRAL_TRANSITIONS` |
| 8 | Histórico de reagendamentos | Guardado integralmente (tabela `visit_history`): datas, responsáveis, motivo, autor e horário. | — |
| 9 | Exclusão de registros | Nada é apagado pela aplicação. Usuários são **desativados**; chaves estrangeiras `RESTRICT` impedem exclusão em cascata de famílias, visitas e necessidades. | `003_hardening.sql` |
| 10 | Fuso horário oficial | `America/Fortaleza` (variável `APP_TIMEZONE`). Datas de visitas, filtros e CSV usam esse fuso — nunca o do navegador. | `backend/.env` |
| 11 | Data de nascimento do responsável | Passa a ser **obrigatória** no cadastro (a interface original já exigia; o backend não). | `families.controller.js` |
| 12 | Base legal / consentimento | O consentimento é registrado (quem, quando, versão do texto). A redação final e a base legal devem ser validadas com orientação jurídica (LGPD). | — |
| 13 | Retenção de dados | Não definida. Precisa ser decidida pela instituição (prazos, anonimização, exclusão a pedido). | — |

Itens 12 e 13 não são decisões técnicas e **não foram implementados além do registro de consentimento**.
