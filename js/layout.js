// Entrada, navegação e telas iniciais
// Telas iniciais do protótipo
function login() {
  return `<div class="login"><section class="lv"><div class="logo" style="width:48px;height:48px">S</div><h1>Visitas domiciliares com acompanhamento organizado</h1><p>Módulo da SESFA para gestores e voluntários registrarem visitas, necessidades e encaminhamentos das famílias atendidas.</p></section><section class="lf"><form data-a="login" novalidate><div><h2 style="font-size:22px">Entrar no sistema</h2><p class="mu">Use o e-mail cadastrado pela gestão.</p></div>${
    S.errs.login
      ? `<div class="alert b-er" role="alert"><b>!</b><span>${S.errs.login}</span></div>`
      : ''
  }${fld('E-mail', 'em', { r: 1, t: 'email', ph: 'nome@sesfa.org' })}${fld('Senha', 'pw', {
    r: 1,
    t: 'password',
  })}<button class="btn" style="justify-content:center">Entrar como gestor</button><button type="button" class="btn s" data-a="vol" style="justify-content:center">Entrar como voluntário</button><p class="hint">Acesso restrito. Seus dados e os das famílias são protegidos conforme a LGPD.</p></form></section></div>`;
}
function shell(c) {
  const it = NAV.filter(n => S.role == 'g' || !n[3]);
  const act =
    S.view == 'nova' || S.view == 'familia' ? 'familias' : S.view == 'registro' ? 'agenda' : S.view;
  return `<div class="app"><aside><div class="brand"><div class="logo">S</div><div><b>Visitas Domiciliares</b><span>SESFA</span></div></div>${it
    .map(
      n =>
        `<button class="nav" data-a="go" data-v="${n[0]}" ${
          act == n[0] ? 'aria-current="page"' : ''
        }>${ic(n[2])}${n[1]}</button>`
    )
    .join('')}<div class="who"><b>${me()}</b><span>${
    S.role == 'g' ? 'Gestor' : 'Voluntário'
  }</span><button class="btn t" style="color:#fff;padding:0;margin-top:6px" data-a="go" data-v="login">Sair</button></div></aside><main>${c}</main></div><nav class="bn" aria-label="Principal">${it
    .map(
      n =>
        `<button data-a="go" data-v="${n[0]}" ${act == n[0] ? 'aria-current="page"' : ''}>${ic(
          n[2]
        )}${n[1]}</button>`
    )
    .join('')}</nav>`;
}
function inicio() {
  const my = V.filter(v => S.role == 'g' || v.r == 'Ana L.');
  const sem = V.filter(v => v.s == 'Sem responsável').length,
    pend = NEED.filter(n => !n.e).length;
  const prox = my.filter(v => ['Agendada', 'Sem responsável', 'Reagendada'].includes(v.s));
  const att = [
    S.role == 'g' && sem
      ? `<div class="item"><div class="g"><b>${sem} visita sem responsável</b><p class="mu">Distribua para um voluntário antes da data marcada.</p></div><button class="btn sm" data-a="dist" data-id="${
          (V.find(v => v.s == 'Sem responsável') || {}).id
        }">Distribuir</button></div>`
      : '',
    pend
      ? `<div class="item"><div class="g"><b>${pend} necessidade sem encaminhamento</b><p class="mu">Família ${
          (NEED.find(n => !n.e) || {}).f
        } · ${
          (NEED.find(n => !n.e) || {}).t
        }</p></div><button class="btn sm s" data-a="fam" data-id="${
          (NEED.find(n => !n.e) || { f: '0142' }).f
        }" data-t="Necessidades">Ver necessidade</button></div>`
      : '',
    `<div class="item"><div class="g"><b>1 visita reagendada para 03/11</b><p class="mu">Confirme a presença do voluntário responsável.</p></div><button class="btn sm s" data-a="go" data-v="agenda">Abrir agenda</button></div>`,
  ].join('');
  return (
    head(
      'Início',
      'Quinta-feira, 29 de outubro',
      `<button class="btn" data-a="agendar">${ic('plus')}Agendar visita</button>`
    ) +
    `<div class="grid g3" style="margin-bottom:16px"><div class="card stat"><b>${
      my.filter(v => v.d == '29/10').length
    }</b><span class="mu">visitas hoje</span></div><div class="card stat"><b>${
      my.filter(v => v.s == 'Concluída').length
    }</b><span class="mu">concluídas esta semana</span></div><div class="card stat"><b>${
      NEED.length
    }</b><span class="mu">necessidades em aberto</span></div></div><div class="grid g2"><section class="card"><h2 style="margin-bottom:14px">Precisa de atenção</h2>${att}</section><section class="card"><h2 style="margin-bottom:14px">Próximas visitas</h2>${prox
      .slice(0, 4)
      .map(
        v =>
          `<div class="item"><div class="time">${v.d}<br><span class="mu">${
            v.h
          }</span></div><div class="g"><b>Família ${v.f}</b><p class="mu">${
            v.r || 'Sem responsável'
          }</p></div></div>`
      )
      .join(
        ''
      )}<button class="btn t" style="margin-top:10px" data-a="go" data-v="agenda">Ver agenda completa</button></section></div>`
  );
}
function familias() {
  const l = FAM.filter(
    f =>
      (S.role == 'g' || V.some(v => v.f == f.id && v.r == 'Ana L.')) &&
      (S.fst == 'Todas' || f.s == S.fst) &&
      (f.id + f.r + f.b).toLowerCase().includes(S.q.toLowerCase())
  );
  return (
    head(
      'Famílias',
      'Consulte e acompanhe as famílias cadastradas.',
      S.role == 'g'
        ? `<button class="btn" data-a="go" data-v="nova">${ic('plus')}Nova família</button>`
        : ''
    ) +
    `<div class="card"><div class="grid f3" style="margin-bottom:16px"><div><label for="q">Buscar</label><input id="q" type="search" placeholder="Código, responsável ou bairro" value="${
      S.q
    }"></div><div><label for="fs">Situação</label><select id="fs">${[
      'Todas',
      'Em acompanhamento',
      'Cadastro recente',
      'Aguardando visita',
    ]
      .map(o => `<option ${o == S.fst ? 'selected' : ''}>${o}</option>`)
      .join('')}</select></div></div></div><div class="card tw" style="margin-top:16px">${
      l.length
        ? `<table><thead><tr><th>Família</th><th>Bairro</th><th>Membros</th><th>Situação</th><th>Próxima visita</th></tr></thead><tbody>${l
            .map(
              f =>
                `<tr class="c" tabindex="0" data-a="fam" data-id="${f.id}"><td><b>${f.id}</b> · ${
                  f.r
                }</td><td data-l="Bairro">${f.b}</td><td data-l="Membros">${f.m}</td><td>${bd2(
                  f.s
                )}</td><td data-l="Próxima visita">${f.p}</td></tr>`
            )
            .join('')}</tbody></table>`
        : `<div class="empty"><h3>Nenhuma família encontrada</h3><p class="mu">Revise a busca ou limpe os filtros.</p><button class="btn s" data-a="clr">Limpar filtros</button></div>`
    }</div>`
  );
}
const bd2 = s =>
  `<span class="badge ${
    s == 'Em acompanhamento' ? 'b-ok' : s == 'Aguardando visita' ? 'b-wn' : 'b-in'
  }">${s}</span>`;

function perfil() {
  return (
    head('Meu perfil', 'Dados da sua conta e preferências.') +
    `<div class="card"><h2 class="sec">Dados pessoais</h2><div class="grid f2" style="margin-top:12px">${fld(
      'Nome',
      'pn',
      { v: me() }
    )}${fld('E-mail', 'pe2', {
      t: 'email',
      v: me().split(' ')[0].toLowerCase() + '@sesfa.org',
    })}</div><p class="mu" style="margin-top:12px">Perfil: ${
      S.role == 'g' ? 'Gestor' : 'Voluntário'
    }</p></div><div class="card"><h2 class="sec">Segurança</h2><p class="mu" style="margin-bottom:12px">Altere sua senha periodicamente.</p><button class="btn s">Alterar senha</button></div><div class="sticky"><button class="btn" data-a="sp">Salvar alterações</button></div>`
  );
}
