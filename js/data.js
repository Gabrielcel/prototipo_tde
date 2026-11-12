// Dados iniciais e recursos compartilhados
// Configuração, dados iniciais e estado da aplicação
const P={home:'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',users:'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8',cal:'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',chart:'M4 20V10M10 20V4M16 20v-7M22 20H2',user:'M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',shield:'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',plus:'M12 5v14M5 12h14'};
const ic=n=>`<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[n]}"/></svg>`;
const NAV=[['inicio','Início','home'],['familias','Famílias','users'],['agenda','Agenda','cal'],['usuarios','Usuários','shield','g'],['relatorios','Relatórios','chart','g'],['perfil','Perfil','user']];
const ST={Agendada:['b-in','◷'],'Sem responsável':['b-wn','!'],Concluída:['b-ok','✓'],Reagendada:['b-n','↻'],Cancelada:['b-er','✕']};
const PR={Alta:'b-er',Média:'b-wn',Baixa:'b-n'};
const bd=s=>`<span class="badge ${ST[s]?ST[s][0]:'b-n'}">${ST[s]?ST[s][1]+' ':''}${s}</span>`;
const pb=p=>`<span class="badge ${PR[p]}">Prioridade ${p.toLowerCase()}</span>`;
let S={role:'g',view:'login',tab:'Resumo',fid:'0142',q:'',fst:'Todas',vf:'Todas',showc:false,reg:[],vid:0,errs:{}};
const FAM=[{id:'0142',r:'Maria S.',b:'Bairro Novo',m:4,s:'Em acompanhamento',p:'05/11'},{id:'0157',r:'João P.',b:'Centro',m:3,s:'Em acompanhamento',p:'30/10'},{id:'0163',r:'Ana C.',b:'Vila Alta',m:5,s:'Cadastro recente',p:'—'},{id:'0171',r:'Pedro R.',b:'Bairro Novo',m:2,s:'Em acompanhamento',p:'03/11'},{id:'0188',r:'Lúcia M.',b:'Centro',m:6,s:'Aguardando visita',p:'—'}];
let V=[{id:1,d:'29/10',w:'Hoje',h:'09:00',f:'0142',r:'Ana L.',p:'Alta',s:'Agendada'},{id:2,d:'29/10',w:'Hoje',h:'14:00',f:'0157',r:'',p:'Média',s:'Sem responsável'},{id:3,d:'30/10',w:'Amanhã',h:'10:30',f:'0171',r:'Ana L.',p:'Baixa',s:'Agendada'},{id:4,d:'03/11',w:'Seg',h:'09:00',f:'0163',r:'Bruno T.',p:'Alta',s:'Reagendada'},{id:5,d:'27/10',w:'Ter',h:'15:00',f:'0188',r:'Ana L.',p:'Média',s:'Concluída'}];
let NEED=[{f:'0142',t:'Alimentação',d:'Cesta básica mensal',p:'Alta',e:'Carla M.'},{f:'0142',t:'Documentação',d:'Segunda via de certidão',p:'Média',e:''}];
const U=[['Carla Mendes','Gestor','Ativo'],['Ana Lima','Voluntário','Ativo'],['Bruno Teixeira','Voluntário','Ativo'],['Davi Rocha','Voluntário','Inativo']];
const fam=id=>FAM.find(x=>x.id==id);
const me=()=>S.role=='g'?'Carla Mendes':'Ana Lima';
const go=v=>{S.v={};S.mem=[];S.dup=null;location.hash=v};
function toast(t){const e=document.getElementById('t');e.innerHTML=`<div class="toast">✓ ${t}</div>`;setTimeout(()=>e.innerHTML='',3200)}
function modal(h){document.getElementById('m').innerHTML=h?`<div class="ov" data-a="bg"><div class="dlg" role="dialog" aria-modal="true">${h}</div></div>`:'';if(h){const d=document.querySelector('.dlg h2');if(d){d.id='dt';document.querySelector('.dlg').setAttribute('aria-labelledby','dt')}const f=document.querySelector('.dlg input,.dlg select,.dlg textarea,.dlg button');if(f)f.focus()}}
const fld=(l,n,o={})=>`<div><label for="${n}">${l}${o.r?' <i aria-hidden="true">*</i>':''}</label>${o.sel?`<select id="${n}">${o.sel.map(x=>`<option>${x}</option>`).join('')}</select>`:`<input id="${n}" type="${o.t||'text'}" placeholder="${o.ph||''}" ${o.v?`value="${o.v}"`:''} ${o.r?'required aria-required="true"':''} class="${S.errs[n]?'bad':''}" ${S.errs[n]?'aria-invalid="true"':''}>`}${S.errs[n]?`<p class="err">${S.errs[n]}</p>`:o.h?`<p class="hint">${o.h}</p>`:''}</div>`;
const head=(t,s,act='',cr='')=>`<div class="crumb">${cr}</div><div class="head"><div><h1>${t}</h1><p class="mu">${s}</p></div><div class="bar">${act}</div></div>`;
const back=(v,l)=>`<button data-a="go" data-v="${v}">${l}</button>`;
