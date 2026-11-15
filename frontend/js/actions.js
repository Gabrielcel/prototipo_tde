// Ações acionadas pelos controles da interface
// Eventos declarados em app.js usam este mapa.
const H = {
  fam: async (t, id) => {
    try {
      const { family } = await API.request(`/families/${encodeURIComponent(familyUUID(id))}`);
      const local = FAM.find(item => item.uuid === family.id);
      Object.assign(local, {
        tel: family.phone || '', ee: family.email || '',
        end: [family.street, family.neighborhood, family.city, family.postalCode].filter(Boolean).join(', '),
        ocup: family.occupation || '', renda: incomeLabel(family.incomeRange),
        mem: family.members.map(member => ({ n: member.fullName, p: member.relationship, dn: member.birthDate || '' })),
      });
      S.fid = local.id;
      S.tab = t.dataset.t || 'Resumo';
      S.showc = false;
      go('familia');
      render();
    } catch (error) {
      apiFailure(error);
    }
  },
  logout: async () => {
    try {
      await API.logout();
      S.errs = {};
      location.hash = 'login';
      render();
    } catch (error) {
      apiFailure(error);
    }
  },
  agendar: () => {
    vmodal(0, 'new');
    const o = [...G('vf').options].find(o => o.text.startsWith(S.fid));
    if (S.view == 'familia' && o) o.selected = true;
  },
  dist: (t, id) => vmodal(id, 'dist'),
  rea: (t, id) => vmodal(id, 'rea'),
  memb: () => {
    keep();
    const v = S.v;
    if (!(v.mn || '').trim()) {
      S.errs.mn = 'Informe o nome do membro.';
      render();
      return;
    }
    S.mem.push({ n: v.mn.trim(), p: v.pt, dn: v.mdn });
    v.mn = v.mdn = '';
    render();
  },
  rmm: (t, id, i) => {
    keep();
    S.mem.splice(i, 1);
    render();
  },
  savef: async () => {
    keep();
    const value = S.v;
    S.errs = {};
    [['nm', 'Informe o nome do responsável.'], ['nc', 'Informe a data de nascimento.'], ['tel', 'Informe um telefone.'], ['rua', 'Informe a rua e o número.'], ['bai', 'Informe o bairro.'], ['cid', 'Informe a cidade.']].forEach(([field, message]) => {
      if (!(value[field] || '').trim()) S.errs[field] = message;
    });
    if (!value.cons) S.errs.cons = 'Confirme o consentimento para salvar.';
    if (Object.keys(S.errs).length) return render();
    if (!S.dup) {
      const phone = (value.tel || '').replace(/\D/g, '');
      S.dup = FAM.find(family =>
        (phone && family.tel.replace(/\D/g, '') === phone) ||
        family.nm.toLowerCase() === value.nm.trim().toLowerCase()
      ) || null;
      if (S.dup) return render();
    }

    try {
      const result = await API.request('/families', {
        method: 'POST',
        write: true,
        body: {
          contactName: value.nm.trim(), birthDate: value.nc || null,
          phone: value.tel.trim(), email: value.ee.trim(), street: value.rua.trim(),
          neighborhood: value.bai.trim(), city: value.cid.trim(), postalCode: value.cep.trim(),
          occupation: value.oc.trim(), incomeRange: value.rd, consentGiven: true,
          members: S.mem.map(member => ({ fullName: member.n, relationship: member.p, birthDate: member.dn || null })),
        },
      });
      await API.loadApplicationData();
      S.v = {};
      S.mem = [];
      S.dup = null;
      go('familias');
      render();
      toast(`Família ${result.family.code} cadastrada.`);
    } catch (error) {
      apiFailure(error);
    }
  },
  addn: () => {
    keep();
    const v = S.v;
    if (!(v.nd || '').trim()) {
      S.errs.nd = 'Descreva a necessidade.';
      render();
      return;
    }
    S.reg.push({ t: v.nt, d: v.nd.trim(), p: v.np, e: '' });
    v.nd = '';
    render();
  },
  enc: (t, id, i) =>
    modal(
      `<h2>Gerar encaminhamento</h2><p class="mu" style="margin:6px 0 14px">Converta a necessidade em pendência ou encaminhamento com um responsável.</p><div class="grid">${fld(
        'Tipo',
        'et',
        { sel: ['Encaminhamento', 'Pendência'] }
      )}${fld('Responsável', 'er', {
        sel: vols().map(u => u[0]),
      })}</div><div class="bar"><button class="btn s" data-a="cm">Cancelar</button><button class="btn" data-a="ec" data-src="${
        t.dataset.src
      }" data-i="${i}">Confirmar</button></div>`
    ),
  ec: async (t, id, i) => {
    const r = t.dataset.src == 'r',
      n = (r ? S.reg : NEED)[i];
    n.e = G('er').value;
    n.k = n.k0 = G('et').value;
    n.responsibleUserId = volunteerUUID(n.e);
    modal('');
    if (r) {
      keep();
    } else {
      try {
        await API.request(`/needs/${encodeURIComponent(n.id)}/referrals`, {
          method: 'POST', write: true,
          body: {
            type: n.k === 'Pendência' ? 'pendencia' : 'encaminhamento',
            responsibleUserId: n.responsibleUserId,
          },
        });
        await API.loadApplicationData();
      } catch (error) {
        return apiFailure(error);
      }
    }
    render();
    toast(n.k + ' registrado para ' + n.e);
  },
  fin: async () => {
    keep();
    const v = S.v,
      vis = V.find(x => x.id == S.vid);
    S.errs = {};
    CK.forEach((c, i) => {
      if (!v['c' + i] || v['c' + i] == 'Selecione') S.errs['c' + i] = 'Responda este item.';
    });
    if (Object.keys(S.errs).length) {
      render();
      const e = document.querySelector('.err');
      if (e) e.scrollIntoView({ block: 'center' });
      return;
    }
    try {
      const result = await API.request(`/visits/${encodeURIComponent(vis.id)}/record`, {
        method: 'POST',
        write: true,
        body: {
          checklistAnswers: CK.map((item, i) => ({ item, answer: v['c' + i] })),
          conditions: v.co || '',
          observations: v.ob || '',
          needs: S.reg.map(item => ({
            category: item.t,
            description: item.d,
            priority: apiPriority(item.p),
            ...(item.responsibleUserId
              ? { referral: { type: item.k === 'Pendência' ? 'pendencia' : 'encaminhamento', responsibleUserId: item.responsibleUserId } }
              : {}),
          })),
        },
      });
      S.reg = [];
      await API.refresh();
      go('agenda');
      render();
      toast('Visita concluída e registro salvo.');
    } catch (error) {
      apiFailure(error);
    }
  },
  vr: async (t, id) => {
    const v = V.find(x => x.id == id);
    try {
      const result = await API.request(`/visits/${encodeURIComponent(id)}`);
      const record = result.visit.record;
      v.ck = record?.checklist_answers?.map(answer => [answer.item, answer.answer]) || [];
      v.co = record?.conditions || '';
      v.ob = record?.observations || '';
    } catch (error) {
      return apiFailure(error);
    }
    modal(
      `<h2>Registro da visita</h2><p class="mu">Família ${v.f} · ${v.d} às ${v.h} · ${
        v.r
      }</p><div style="margin-top:14px">${
        (v.ck || [])
          .map(
            c =>
              `<div class="item"><div class="g">${c[0]}</div><span class="badge ${
                c[1] == 'Sim' ? 'b-ok' : c[1] == 'Não' ? 'b-er' : 'b-n'
              }">${c[1]}</span></div>`
          )
          .join('') || '<p class="mu">Visita sem checklist registrado.</p>'
      }</div><p style="margin-top:14px"><b>Condições observadas</b></p><p class="mu">${
        esc(v.co) || '—'
      }</p><p style="margin-top:10px"><b>Observações</b></p><p class="mu">${
        esc(v.ob) || '—'
      }</p><div class="bar"><button class="btn s" data-a="cm">Fechar</button></div>`
    );
  },
  sv: async () => {
    const date = G('vd').value;
    const time = G('vh').value;
    const code = G('vf').value.split(' · ')[0];
    try {
      await API.request('/visits', {
        method: 'POST',
        write: true,
        body: {
          familyId: familyUUID(code),
          scheduledAt: localDateTime(date, time),
          priority: apiPriority(G('vp').value),
          assignedTo: volunteerUUID(G('vr')?.value || ''),
        },
      });
      modal('');
      await API.refresh();
      toast('Visita agendada.');
    } catch (error) {
      G('cf').innerHTML = al('b-er', esc(error.message));
    }
  },
  sd: async (t, id) => {
    const volunteerId = volunteerUUID(G('vr').value);
    if (!volunteerId) {
      G('cf').innerHTML = al('b-er', 'Selecione um voluntário ativo.');
      return;
    }
    try {
      await API.request(`/visits/${encodeURIComponent(id)}`, {
        method: 'PATCH', write: true, body: { assignedTo: volunteerId },
      });
      modal('');
      await API.refresh();
      toast('Visita atribuída.');
    } catch (error) {
      G('cf').innerHTML = al('b-er', esc(error.message));
    }
  },
  rc: async (t, id) => {
    const v = V.find(x => x.id == id),
      rg = G('ra').value == 'Reagendar',
      mo = G('mo').value.trim(),
      d = G('rdt').value,
      h = G('rht').value,
      er = !mo
        ? 'Informe o motivo para continuar.'
        : rg && (!d || !h)
        ? 'Informe a nova data e o novo horário.'
        : '';
    if (er) {
      G('cf').innerHTML = al('b-er', er);
      return;
    }
    try {
      await API.request(`/visits/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        write: true,
        body: rg
          ? { scheduledAt: localDateTime(d, h), reason: mo }
          : { status: 'cancelada', reason: mo },
      });
      modal('');
      await API.refresh();
      toast(rg ? 'Visita reagendada.' : 'Visita cancelada.');
    } catch (error) {
      G('cf').innerHTML = al('b-er', esc(error.message));
    }
  },
  nu: () => umodal(-1),
  eu: (t, id, i) => umodal(i),
  su: (t, id, i) => {
    const n = G('un').value.trim(),
      cpf = G('ucpf').value.replace(/\D/g, ''),
      tel = G('utel').value.trim(),
      em = G('ue').value.trim(),
      er = [];
    if (!n) er.push('nome');
    if (cpf.length != 11) er.push('CPF com 11 dígitos');
    if (!tel) er.push('telefone');
    if (!/^\S+@\S+\.\S+$/.test(em)) er.push('e-mail válido');
    if (!er.length && U.some((u, k) => k != i && u[3].cpf.replace(/\D/g, '') == cpf))
      er.push('CPF já cadastrado');
    if (er.length) {
      G('cf').innerHTML = al('b-er', 'Corrija: ' + er.join(', ') + '.');
      return;
    }
    const x = {
        cpf: G('ucpf').value,
        dn: G('udn').value,
        tel,
        em,
        end: G('uend').value,
        dias: DSM.map((_, k) => k).filter(k => G('ud' + k).checked),
        turno: G('ut').value,
      },
      row = [n, G('up').value, i >= 0 ? U[i][2] : 'Ativo', x];
    if (i >= 0) U[i] = row;
    else U.push(row);
    modal('');
    render();
    toast(i >= 0 ? 'Cadastro atualizado' : 'Usuário cadastrado');
  },
  td: (t, id, i) => {
    const u = U[i],
      s = sh(u[0]);
    u[2] = 'Inativo';
    let n = 0;
    V.forEach(v => {
      if (v.r == s && ['Agendada', 'Reagendada'].includes(v.s)) {
        v.r = '';
        v.s = 'Sem responsável';
        n++;
      }
    });
    modal('');
    render();
    toast('Usuário desativado' + (n ? ' · ' + n + ' visita(s) aguardando nova distribuição' : ''));
  },
  nu: () => modal(
    `<h2>Novo usuário</h2><div class="grid" style="margin-top:14px">${fld('Nome completo', 'un', { r: 1 })}${fld('E-mail', 'ue', { r: 1, t: 'email' })}${fld('Senha inicial', 'upw', { r: 1, t: 'password', h: 'Use pelo menos 8 caracteres. Informe a senha à pessoa de forma segura.' })}${fld('Perfil', 'up', { sel: S.role === 'g' ? ['Voluntário', 'Gestor'] : ['Voluntário'] })}</div><div id="cf"></div><div class="bar"><button class="btn s" data-a="cm">Cancelar</button><button class="btn" data-a="su">Cadastrar</button></div>`
  ),
  su: async () => {
    const fullName = G('un').value.trim();
    const email = G('ue').value.trim();
    const password = G('upw').value;
    if (!fullName || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
      G('cf').innerHTML = al('b-er', 'Informe nome, e-mail válido e senha com pelo menos 8 caracteres.');
      return;
    }
    try {
      await API.request('/users', {
        method: 'POST', write: true,
        body: { fullName, email, password, role: G('up').value === 'Gestor' ? 'gestor' : 'voluntario' },
      });
      modal('');
      await API.refresh();
      toast('Usuário cadastrado.');
    } catch (error) {
      G('cf').innerHTML = al('b-er', esc(error.message));
    }
  },
  tog: async (t, id, i) => {
    const user = U[i];
    if (!user?.uuid) return apiFailure(new Error('Usuário inválido.'));
    const status = user[2] === 'Ativo' ? 'inativo' : 'ativo';
    try {
      await API.request(`/users/${encodeURIComponent(user.uuid)}/status`, {
        method: 'PATCH', write: true, body: { status },
      });
      await API.refresh();
      toast(status === 'ativo' ? 'Acesso reativado.' : 'Acesso desativado.');
    } catch (error) {
      apiFailure(error);
    }
  },
  exp: () => {
    const csv = [
      'Data;Horário;Família;Responsável;Prioridade;Status;Motivo',
      ...rvs().map(v =>
        [new Date(v.scheduledAt).toLocaleDateString('pt-BR'), v.h, v.f, v.r || '', v.p, v.s, (v.mo || '').replace(/[;\n]/g, ' ')].join(
          ';'
        )
      ),
    ].join('\n');
    modal(
      `<h2>Exportar relatório (CSV)</h2><p class="mu" style="margin:6px 0 12px">Copie e cole em uma planilha. Respeita o período e o voluntário escolhidos.</p><textarea id="csv" readonly style="min-height:200px">${esc(
        csv
      )}</textarea><div class="bar"><button class="btn s" data-a="cm">Fechar</button><button class="btn" data-a="cp">Copiar</button></div>`
    );
  },
  cp: () => {
    const x = G('csv');
    x.select();
    try {
      navigator.clipboard.writeText(x.value).catch(() => document.execCommand('copy'));
    } catch (_) {
      document.execCommand('copy');
    }
    toast('Copiado');
  },
};
