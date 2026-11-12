// Mapa de telas, renderização e inicialização
const VIEWS = {
  login,
  inicio,
  familias,
  nova,
  familia,
  agenda,
  registro,
  usuarios,
  relatorios,
  perfil,
};
function render() {
  let v = location.hash.slice(1) || 'login';
  if (!VIEWS[v]) v = 'login';
  if (S.role != 'g' && ['usuarios', 'relatorios', 'nova'].includes(v)) v = 'inicio';
  S.view = v;
  S.errs = S.errs || {};
  const h = VIEWS[v]();
  document.getElementById('app').innerHTML = v == 'login' ? h : shell(h);
  rest();
  if (S.keep) {
    scrollTo(0, S.keep);
    S.keep = 0;
  } else scrollTo(0, 0);
}

// Eventos e inicialização
document.addEventListener('click', e => {
  const t = e.target.closest('[data-a]');
  if (!t) return;
  const a = t.dataset.a;
  if (H[a]) {
    S.errs = {};
    e.stopImmediatePropagation();
    H[a](t, +t.dataset.id, +t.dataset.i);
  }
});
document.addEventListener('submit', e => {
  if (e.target.dataset.a == 'save') {
    e.preventDefault();
    e.stopImmediatePropagation();
    saveFam(false);
  }
});
document.addEventListener('change', e => {
  if (e.target.id == 'pe') {
    S.rp = e.target.value;
    render();
  }
  if (e.target.id == 'pv') {
    S.rv = e.target.value;
    render();
  }
});
document.addEventListener('click', e => {
  const t = e.target.closest('[data-a]');
  if (!t) return;
  const a = t.dataset.a,
    id = +t.dataset.id;
  const $ = i => document.getElementById(i);
  if (a == 'bg') {
    if (e.target == t) modal('');
  } else if (a == 'go') {
    go(t.dataset.v);
  } else if (a == 'vol') {
    S.role = 'v';
    go('inicio');
  } else if (a == 'fam') {
    S.fid = t.dataset.id;
    S.tab = t.dataset.t || 'Resumo';
    S.showc = false;
    go('familia');
    render();
  } else if (a == 'tab') {
    S.tab = t.dataset.t;
    render();
  } else if (a == 'showc') {
    S.showc = !S.showc;
    render();
  } else if (a == 'vf') {
    S.vf = t.dataset.t;
    render();
  } else if (a == 'clr') {
    S.q = '';
    S.fst = 'Todas';
    render();
  } else if (a == 'agendar') vmodal(0, 'new');
  else if (a == 'dist') vmodal(id, 'new');
  else if (a == 'rea') vmodal(id, 'rea');
  else if (a == 'cm') modal('');
  else if (a == 'reg') {
    S.vid = id;
    S.reg = [];
    go('registro');
  } else if (a == 'addn') {
    S.reg.push({ t: $('nt').value, d: $('nd').value, p: $('np').value, e: '' });
    render();
  } else if (a == 'enc') {
    const i = +t.dataset.i;
    S.reg[i].e = 'Carla M.';
    render();
    toast('Encaminhamento gerado');
  } else if (a == 'fin') {
    V.find(x => x.id == S.vid).s = 'Concluída';
    S.reg.forEach(n => NEED.push({ f: V.find(x => x.id == S.vid).f, ...n }));
    go('agenda');
    toast('Visita concluída e registrada');
  } else if (a == 'sv') {
    const d = $('vd').value,
      h = $('vh').value;
    S.errs = {};
    if (!d || !h) {
      S.errs = { vd: d ? '' : 'Escolha a data.', vh: h ? '' : 'Escolha o horário.' };
      $(
        'cf'
      ).innerHTML = `<div class="alert b-er" role="alert">Preencha data e horário para confirmar.</div>`;
      return;
    }
    const r = $('vr') ? $('vr').value : 'Ana L.';
    const dd = d.slice(8) + '/' + d.slice(5, 7);
    if (V.some(v => v.r == r && v.d == dd && v.h == h && v.id != id)) {
      $(
        'cf'
      ).innerHTML = `<div class="alert b-wn" role="alert"><b>!</b><span>${r} já tem visita em ${dd} às ${h}. Escolha outro horário ou responsável.</span></div>`;
      return;
    }
    if (id) {
      const v = V.find(x => x.id == id);
      v.r = r;
      v.d = dd;
      v.h = h;
      v.s = 'Agendada';
    } else
      V.push({
        id: V.length + 1,
        d: dd,
        w: '',
        h,
        f: $('vf').value.slice(0, 4),
        r,
        p: $('vp').value,
        s: r ? 'Agendada' : 'Sem responsável',
      });
    modal('');
    render();
    toast('Visita agendada');
  } else if (a == 'rc') {
    if (!$('mo').value.trim()) {
      $('me').hidden = false;
      $('mo').classList.add('bad');
      $('mo').focus();
      return;
    }
    const v = V.find(x => x.id == id);
    v.s = $('ra').value == 'Reagendar' ? 'Reagendada' : 'Cancelada';
    modal('');
    render();
    toast(v.s == 'Cancelada' ? 'Visita cancelada' : 'Visita reagendada');
  } else if (a == 'nu')
    modal(
      `<h2>Novo usuário</h2><div class="grid" style="margin-top:14px">${fld('Nome completo', 'un', {
        r: 1,
      })}${fld('E-mail', 'ue', { r: 1, t: 'email' })}${fld('Perfil', 'up', {
        sel: ['Voluntário', 'Gestor'],
        h: 'Gestores acessam usuários e relatórios.',
      })}</div><div class="bar"><button class="btn s" data-a="cm">Cancelar</button><button class="btn" data-a="su">Cadastrar</button></div>`
    );
  else if (a == 'su') {
    const n = $('un').value.trim();
    if (!n) {
      $('un').classList.add('bad');
      $('un').focus();
      return;
    }
    U.push([n, $('up').value, 'Ativo']);
    modal('');
    render();
    toast('Usuário cadastrado');
  } else if (a == 'tog') {
    const i = +t.dataset.i;
    if (U[i][2] == 'Ativo')
      modal(
        `<h2>Desativar ${U[i][0]}?</h2><p class="mu" style="margin-top:8px">A pessoa perde o acesso ao sistema. As visitas atribuídas precisarão ser redistribuídas. Você pode reativar depois.</p><div class="bar"><button class="btn s" data-a="cm">Manter ativo</button><button class="btn d" data-a="td" data-i="${i}">Desativar</button></div>`
      );
    else {
      U[i][2] = 'Ativo';
      render();
      toast('Usuário reativado');
    }
  } else if (a == 'td') {
    U[+t.dataset.i][2] = 'Inativo';
    modal('');
    render();
    toast('Usuário desativado');
  } else if (a == 'sp') toast('Alterações salvas');
  else if (a == 'memb') toast('Membro adicionado ao núcleo familiar');
});
document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target,
    $ = i => document.getElementById(i);
  if (f.dataset.a == 'login') {
    if (!$('em').value || !$('pw').value) {
      S.errs = {
        em: $('em').value ? '' : 'Informe o e-mail.',
        pw: $('pw').value ? '' : 'Informe a senha.',
        login: 'Não foi possível entrar. Preencha e-mail e senha.',
      };
      const k = [$('em').value, $('pw').value];
      render();
      $('em').value = k[0];
      return;
    }
    S.errs = {};
    S.role = 'g';
    go('inicio');
  } else if (f.dataset.a == 'save') {
    const k = ['nm', 'tel', 'rua', 'bai'],
      lb = {
        nm: 'o nome do responsável',
        tel: 'um telefone de contato',
        rua: 'a rua e número',
        bai: 'o bairro',
      },
      vals = {};
    document.querySelectorAll('#app input,#app select').forEach(x => (vals[x.id] = x.value));
    S.errs = {};
    k.forEach(i => {
      if (!vals[i].trim()) S.errs[i] = 'Informe ' + lb[i] + '.';
    });
    if (Object.keys(S.errs).length) {
      render();
      Object.keys(vals).forEach(i => {
        const x = document.getElementById(i);
        if (x) x.value = vals[i];
      });
      document.querySelector('.bad').focus();
      return;
    }
    FAM.push({
      id: '0' + (190 + FAM.length),
      r: vals.nm.split(' ')[0] + ' ' + (vals.nm.split(' ')[1] || '')[0] + '.',
      b: vals.bai,
      m: 1,
      s: 'Cadastro recente',
      p: '—',
    });
    go('familias');
    toast('Família cadastrada');
  }
});
document.addEventListener('input', e => {
  if (e.target.id == 'q') {
    S.q = e.target.value;
    const p = e.target.selectionStart;
    render();
    const q = document.getElementById('q');
    q.focus();
    q.setSelectionRange(p, p);
  }
});
document.addEventListener('change', e => {
  if (e.target.id == 'fs') {
    S.fst = e.target.value;
    render();
  }
});
document.addEventListener('keydown', e => {
  if (e.key == 'Enter' && e.target.matches('tr.c')) e.target.click();
  if (e.key == 'Escape') modal('');
});
addEventListener('hashchange', render);
render();
