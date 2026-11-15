// Usuários e relatórios
function usuarios() {
  return (
    head(
      'Usuários e voluntários',
      'Gerencie perfis, permissões e status de acesso.',
      `<button class="btn" data-a="nu">${ic('plus')}Cadastrar usuário</button>`
    ) +
    `<div class="card tw"><table><thead><tr><th>Nome</th><th>Perfil</th><th>Status</th><th>Ação</th></tr></thead><tbody>${U.map(
      (u, i) =>
        `<tr><td><b>${u[0]}</b></td><td data-l="Perfil"><span class="badge b-n">${
          u[1] == 'Gestor' ? '◆' : '●'
        } ${u[1]}</span></td><td>${
          u[2] == 'Ativo'
            ? '<span class="badge b-ok">✓ Ativo</span>'
            : '<span class="badge b-n">○ Inativo</span>'
        }</td><td>${
          u[1] == 'Gestor'
            ? '<span class="mu">—</span>'
            : `<button class="btn sm s" data-a="tog" data-i="${i}">${
                u[2] == 'Ativo' ? 'Desativar' : 'Reativar'
              }</button>`
        }</td></tr>`
    ).join('')}</tbody></table></div>`
  );
}
function relatorios() {
  const c = s => V.filter(v => v.s == s).length;
  const rows = [
    ['Agendada', c('Agendada')],
    ['Concluída', c('Concluída')],
    ['Reagendada', c('Reagendada')],
    ['Sem responsável', c('Sem responsável')],
    ['Cancelada', c('Cancelada')],
  ];
  return (
    head(
      'Relatórios',
      'Acompanhe visitas e necessidades conforme o período e o voluntário selecionados.',
      `<button class="btn s">Exportar</button>`
    ) +
    `<div class="card" style="margin-bottom:16px"><div class="grid f3"><div><label for="pe">Período</label><select id="pe"><option>Últimos 30 dias</option><option>Este mês</option><option>Este ano</option></select></div></div></div><div class="card"><h2>Visitas por status</h2><p class="mu" style="margin:4px 0 16px">Total de ${
      V.length
    } visitas no período. Os números ao lado de cada barra mostram a quantidade.</p><div class="bars">${rows
      .map(
        r =>
          `<div class="br"><span>${r[0]}</span><div><i style="width:${
            (r[1] / V.length) * 100
          }%"></i></div><b>${r[1]}</b></div>`
      )
      .join('')}</div></div>`
  );
}

function umodal(i) {
  const u = i >= 0 ? U[i] : ['', 'Voluntário', 'Ativo', { dias: [], turno: 'Manhã' }];
  S.errs = {};
  modal(
    `<h2>Novo usuário</h2><div class="grid" style="margin-top:14px">${fld('Nome completo', 'un', { r: 1, v: esc(u[0]) })}${fld('E-mail', 'ue', { r: 1, t: 'email' })}${fld('Senha inicial', 'upw', { r: 1, t: 'password', h: 'Use pelo menos 8 caracteres. Informe a senha à pessoa de forma segura.' })}${fld('Perfil', 'up', { sel: S.role === 'g' ? ['Voluntário', 'Gestor'] : ['Voluntário'] })}</div><div id="cf"></div><div class="bar"><button class="btn s" data-a="cm">Cancelar</button><button class="btn" data-a="su">Cadastrar</button></div>`
  );
}

function usuarios() {
  return (
    head(
      'Usuários e voluntários',
      'Consulte a disponibilidade e o acesso de cada pessoa voluntária.',
      `<button class="btn" data-a="nu">${ic('plus')}Cadastrar usuário</button>`
    ) +
    `<div class="card tw"><table><thead><tr><th>Nome</th><th>Perfil</th><th>Status</th><th>Ação</th></tr></thead><tbody>${U.map(
      (u, i) =>
        `<tr><td><b>${esc(u[0])}</b></td><td data-l="Perfil"><span class="badge b-n">${
          u[1] == 'Gestor' ? '◆' : '●'
        } ${u[1]}</span></td><td>${
          u[2] == 'Ativo'
            ? '<span class="badge b-ok">✓ Ativo</span>'
            : '<span class="badge b-n">○ Inativo</span>'
        }</td><td><div class="bar">${
          u[1] == 'Gestor'
            ? ''
            : `<button class="btn sm s" data-a="tog" data-i="${i}">${
                u[2] == 'Ativo' ? 'Desativar' : 'Reativar'
              }</button>`
        }</div></td></tr>`
    ).join('')}</tbody></table></div>`
  );
}

function relatorios() {
  const vs = rvs();
  const summary = S.reportSummary;
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (S.rp === 'Últimos 7 dias') from.setDate(from.getDate() - 6);
  if (S.rp === 'Este mês') from.setDate(1);
  const ns = NEED.filter(n => {
      const created = new Date(n.createdAt);
      const dateMatches = S.rp === 'Todo o período' || (!Number.isNaN(created.getTime()) && created >= from && created <= now);
      const linkedVisit = V.find(visit => visit.id === n.visitUUID);
      const volunteerMatches = S.role === 'g'
        ? S.rv === 'Todos' || linkedVisit?.r === S.rv
        : linkedVisit?.assignedTo === S.user?.id;
      return dateMatches && volunteerMatches;
    });
  const cnt = (a, f) => {
      const m = {};
      a.forEach(x => {
        const k = f(x);
        m[k] = (m[k] || 0) + 1;
      });
      return Object.entries(m);
    };
  const bars = (r, t) =>
      `<div class="bars">${
        r
          .map(
            x =>
              `<div class="br"><span>${x[0]}</span><div><i style="width:${
                t ? (x[1] / t) * 100 : 0
              }%"></i></div><b>${x[1]}</b></div>`
          )
          .join('') || '<p class="mu">Sem dados no período.</p>'
      }</div>`;
  const c = summary?.visits?.byStatus?.concluida ?? vs.filter(v => v.s == 'Concluída').length;
  const visitTotal = summary?.visits?.total ?? vs.length;
  const needTotal = summary?.needs?.total ?? ns.length;
  const en = ns.filter(n => n.e).length;
  const referralTotal = summary?.referrals?.total ?? en;
  const sel = (i, o, cur) =>
      `<select id="${i}">${o
        .map(x => `<option ${x == cur ? 'selected' : ''}>${x}</option>`)
        .join('')}</select>`;
  return (
    head(
      'Relatórios',
      'Acompanhe visitas e necessidades conforme o período e o voluntário selecionados.',
      `<button class="btn s" data-a="exp">Exportar (CSV)</button>`
    ) +
    `<div class="card" style="margin-bottom:16px"><div class="grid f2"><div><label for="pe">Período</label>${sel(
      'pe',
      ['Todo o período', 'Últimos 7 dias', 'Este mês'],
      S.rp
    )}</div><div><label for="pv">Voluntário</label>${
      S.role === 'g' ? sel('pv', ['Todos', ...vols().map(u => sh(u[0]))], S.rv) : '<p class="mu">Minhas visitas</p>'
    }</div></div></div><div class="grid g3" style="margin-bottom:16px"><div class="card stat"><b>${
      visitTotal
    }</b><span class="mu">visitas no período</span></div><div class="card stat"><b>${
      visitTotal ? Math.round((c / visitTotal) * 100) : 0
    }%</b><span class="mu">concluídas</span></div><div class="card stat"><b>${
      needTotal
    }</b><span class="mu">necessidades (${referralTotal} encaminhamentos)</span></div></div><div class="grid f2"><div class="card"><h2 style="margin-bottom:14px">Visitas por status</h2>${bars(
      [['Agendada', 'agendada'], ['Concluída', 'concluida'], ['Reagendada', 'reagendada'], ['Sem responsável', 'sem_responsavel'], ['Cancelada', 'cancelada']].map(([label, key]) => [
        label,
        summary?.visits?.byStatus?.[key] ?? vs.filter(v => v.s === label).length,
      ]),
      visitTotal
    )}</div><div class="card" style="margin-top:0"><h2 style="margin-bottom:14px">Visitas por voluntário</h2>${bars(
      cnt(vs, v => v.r || 'Sem responsável'),
      vs.length
    )}</div><div class="card" style="margin-top:0"><h2 style="margin-bottom:14px">Necessidades por tipo</h2>${bars(
      cnt(ns, n => n.t),
      ns.length
    )}</div><div class="card" style="margin-top:0"><h2 style="margin-bottom:14px">Necessidades por prioridade</h2>${bars(
      cnt(ns, n => n.p),
      ns.length
    )}</div></div>`
  );
}
