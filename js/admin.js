// Usuários e relatórios
function usuarios() {
  return (
    head(
      'Usuários e voluntários',
      'Gerencie perfis, permissões e status de acesso.',
      `<button class="btn" data-a="nu">${ic('plus')}Novo usuário</button>`
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
      'Acompanhamento das visitas e atividades.',
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
  const u = i >= 0 ? U[i] : ['', 'Voluntário', 'Ativo', { dias: [], turno: 'Manhã' }],
    x = u[3];
  S.errs = {};
  modal(
    `<h2>${i >= 0 ? 'Editar' : 'Novo'} usuário</h2><div class="grid" style="margin-top:14px">${fld(
      'Nome completo',
      'un',
      { r: 1, v: esc(u[0]) }
    )}<div class="grid f2">${fld('CPF', 'ucpf', {
      r: 1,
      v: x.cpf || '',
      ph: '000.000.000-00',
    })}${fld('Data de nascimento', 'udn', { t: 'date', v: x.dn || '' })}${fld('Telefone', 'utel', {
      r: 1,
      v: esc(x.tel || ''),
    })}${fld('E-mail', 'ue', { r: 1, t: 'email', v: esc(x.em || '') })}</div>${fld(
      'Endereço',
      'uend',
      { v: esc(x.end || '') }
    )}${fld('Perfil', 'up', {
      sel: ['Voluntário', 'Gestor'],
      h: 'Cadastre usuários e mantenha os dados de disponibilidade atualizados.',
    })}<fieldset class="fs"><legend class="sec" style="font-size:14px">Disponibilidade para visitas</legend><div class="bar">${DSM.map(
      (d, k) =>
        `<label style="display:flex;gap:6px;align-items:center;margin:0;font-weight:500"><input type="checkbox" id="ud${k}" style="width:20px;min-height:20px" ${
          x.dias.includes(k) ? 'checked' : ''
        }>${d}</label>`
    ).join('')}</div>${fld('Turno', 'ut', {
      sel: TU,
    })}</fieldset></div><div id="cf"></div><div class="bar"><button class="btn s" data-a="cm">Cancelar</button><button class="btn" data-a="su" data-i="${i}">Salvar</button></div>`
  );
  G('up').value = u[1];
  G('ut').value = x.turno;
}

function usuarios() {
  return (
    head(
      'Usuários e voluntários',
      'Gerencie perfis, disponibilidade e status de acesso.',
      `<button class="btn" data-a="nu">${ic('plus')}Novo usuário</button>`
    ) +
    `<div class="card tw"><table><thead><tr><th>Nome</th><th>Perfil</th><th>Telefone</th><th>Disponibilidade</th><th>Status</th><th>Ação</th></tr></thead><tbody>${U.map(
      (u, i) =>
        `<tr><td><b>${esc(u[0])}</b></td><td data-l="Perfil"><span class="badge b-n">${
          u[1] == 'Gestor' ? '◆' : '●'
        } ${u[1]}</span></td><td data-l="Telefone">${esc(
          u[3].tel
        )}</td><td data-l="Disponibilidade">${disp(u[3])}</td><td>${
          u[2] == 'Ativo'
            ? '<span class="badge b-ok">✓ Ativo</span>'
            : '<span class="badge b-n">○ Inativo</span>'
        }</td><td><div class="bar"><button class="btn sm s" data-a="eu" data-i="${i}">Editar</button>${
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
  const vs = rvs(),
    ns = NEED.filter(n => vs.some(x => x.f == n.f)),
    cnt = (a, f) => {
      const m = {};
      a.forEach(x => {
        const k = f(x);
        m[k] = (m[k] || 0) + 1;
      });
      return Object.entries(m);
    },
    bars = (r, t) =>
      `<div class="bars">${
        r
          .map(
            x =>
              `<div class="br"><span>${x[0]}</span><div><i style="width:${
                t ? (x[1] / t) * 100 : 0
              }%"></i></div><b>${x[1]}</b></div>`
          )
          .join('') || '<p class="mu">Sem dados no período.</p>'
      }</div>`,
    c = vs.filter(v => v.s == 'Concluída').length,
    en = ns.filter(n => n.e).length,
    sel = (i, o, cur) =>
      `<select id="${i}">${o
        .map(x => `<option ${x == cur ? 'selected' : ''}>${x}</option>`)
        .join('')}</select>`;
  return (
    head(
      'Relatórios',
      'Acompanhamento das visitas e atividades.',
      `<button class="btn s" data-a="exp">Exportar (CSV)</button>`
    ) +
    `<div class="card" style="margin-bottom:16px"><div class="grid f2"><div><label for="pe">Período</label>${sel(
      'pe',
      ['Todo o período', 'Últimos 7 dias', 'Este mês'],
      S.rp
    )}</div><div><label for="pv">Voluntário</label>${sel(
      'pv',
      ['Todos', ...vols().map(u => sh(u[0]))],
      S.rv
    )}</div></div></div><div class="grid g3" style="margin-bottom:16px"><div class="card stat"><b>${
      vs.length
    }</b><span class="mu">visitas no período</span></div><div class="card stat"><b>${
      vs.length ? Math.round((c / vs.length) * 100) : 0
    }%</b><span class="mu">concluídas</span></div><div class="card stat"><b>${
      ns.length
    }</b><span class="mu">necessidades (${en} encaminhadas)</span></div></div><div class="grid f2"><div class="card"><h2 style="margin-bottom:14px">Visitas por status</h2>${bars(
      ['Agendada', 'Concluída', 'Reagendada', 'Sem responsável', 'Cancelada'].map(s => [
        s,
        vs.filter(v => v.s == s).length,
      ]),
      vs.length
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
