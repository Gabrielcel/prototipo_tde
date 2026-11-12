// Ações acionadas pelos controles da interface
// Eventos declarados em app.js usam este mapa.
const H = {
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
  savef: () => saveFam(true),
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
        sel: U.filter(u => u[2] == 'Ativo').map(u => u[0]),
      })}</div><div class="bar"><button class="btn s" data-a="cm">Cancelar</button><button class="btn" data-a="ec" data-src="${
        t.dataset.src
      }" data-i="${i}">Confirmar</button></div>`
    ),
  ec: (t, id, i) => {
    const r = t.dataset.src == 'r',
      n = (r ? S.reg : NEED)[i];
    n.e = G('er').value;
    n.k = n.k0 = G('et').value;
    modal('');
    if (r) keep();
    render();
    toast(n.k + ' registrado para ' + n.e);
  },
  fin: () => {
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
    vis.s = 'Concluída';
    vis.ck = CK.map((c, i) => [c, v['c' + i]]);
    vis.co = v.co;
    vis.ob = v.ob;
    S.reg.forEach(n => NEED.push({ f: vis.f, ...n, k0: n.k }));
    go('agenda');
    toast('Visita concluída e checklist registrado');
  },
  vr: (t, id) => {
    const v = V.find(x => x.id == id);
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
  sv: () => {
    const d = G('vd').value,
      h = G('vh').value,
      r = G('vr') ? G('vr').value : 'Ana L.',
      f = G('vf').value.slice(0, 4),
      dd = d && dm(d),
      er =
        !d || !h
          ? 'Preencha data e horário para confirmar.'
          : d < TODAY
          ? 'Escolha uma data a partir de hoje (29/10).'
          : V.some(v => v.f == f && v.d == dd && OPEN.includes(v.s))
          ? 'A família ' + f + ' já tem visita aberta em ' + dd + '.'
          : r && !free(r, dd, h, 0)
          ? r + ' já tem visita em ' + dd + ' às ' + h + '. Escolha outro horário ou responsável.'
          : '';
    if (er) {
      G('cf').innerHTML = al('b-er', er);
      return;
    }
    V.push({
      id: Math.max(...V.map(x => x.id)) + 1,
      d: dd,
      w: '',
      h,
      f,
      r,
      p: G('vp').value,
      s: r ? 'Agendada' : 'Sem responsável',
    });
    modal('');
    render();
    toast('Visita agendada');
  },
  sd: (t, id) => {
    const v = V.find(x => x.id == id),
      r = G('vr').value;
    if (!r) {
      G('cf').innerHTML = al('b-er', 'Não há voluntários ativos.');
      return;
    }
    if (!free(r, v.d, v.h, id)) {
      G('cf').innerHTML = al(
        'b-wn',
        r + ' já tem visita em ' + v.d + ' às ' + v.h + '. Escolha outro responsável.'
      );
      return;
    }
    v.r = r;
    if (v.s == 'Sem responsável') v.s = 'Agendada';
    modal('');
    render();
    toast('Visita atribuída a ' + r);
  },
  rc: (t, id) => {
    const v = V.find(x => x.id == id),
      rg = G('ra').value == 'Reagendar',
      mo = G('mo').value.trim(),
      d = G('rdt').value,
      h = G('rht').value,
      er = !mo
        ? 'Informe o motivo para continuar.'
        : rg && (!d || !h)
        ? 'Informe a nova data e o novo horário.'
        : rg && d < TODAY
        ? 'Escolha uma data a partir de hoje (29/10).'
        : rg && v.r && !free(v.r, dm(d), h, v.id)
        ? v.r + ' já tem visita nesse horário.'
        : '';
    if (er) {
      G('cf').innerHTML = al('b-er', er);
      return;
    }
    if (rg) {
      v.d = dm(d);
      v.h = h;
      v.s = v.r ? 'Reagendada' : 'Sem responsável';
    } else v.s = 'Cancelada';
    v.mo = mo;
    modal('');
    render();
    toast(rg ? 'Visita reagendada para ' + v.d + ' às ' + v.h : 'Visita cancelada');
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
  exp: () => {
    const csv = [
      'Data;Horário;Família;Responsável;Prioridade;Status;Motivo',
      ...rvs().map(v =>
        [v.d + '/2026', v.h, v.f, v.r || '', v.p, v.s, (v.mo || '').replace(/[;\n]/g, ' ')].join(
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
