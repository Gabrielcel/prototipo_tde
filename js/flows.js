// Regras do protótipo e fluxos de cadastro e visita
/* ===== v2: correções da análise ===== */

// Utilitários e regras de negócio
const G=i=>document.getElementById(i),sh=n=>{const p=n.trim().split(/\s+/);return p[0]+(p[1]?' '+p[1][0]+'.':'')},esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),al=(c,t)=>`<div class="alert ${c}" role="alert"><span>${t}</span></div>`;
const TODAY='2026-10-29',dm=d=>d.slice(8)+'/'+d.slice(5,7),key=s=>+(s.slice(3)+s.slice(0,2)),OPEN=['Agendada','Reagendada','Sem responsável'];
const free=(r,d,h,id)=>!V.some(v=>v.r==r&&v.d==d&&v.h==h&&v.id!=id&&OPEN.includes(v.s));
const DSM=['Seg','Ter','Qua','Qui','Sex','Sáb'],disp=x=>x.dias.length?x.dias.map(d=>DSM[d]).join(', ')+' · '+x.turno:'Não informada',vols=()=>U.filter(u=>u[1]=='Voluntário'&&u[2]=='Ativo');
const CK=['Moradia em condições adequadas de higiene e segurança','Acesso a água potável e saneamento','Alimentos disponíveis para todos os moradores','Crianças e adolescentes frequentando a escola','Moradores com acompanhamento de saúde em dia','Documentação pessoal em dia'];Object.assign(S,{mem:[],v:{},rp:'Todo o período',rv:'Todos'});
const keep=()=>{S.keep=scrollY||1;document.querySelectorAll('#app input,#app select,#app textarea').forEach(x=>{if(x.id)S.v[x.id]=x.type=='checkbox'?x.checked:x.value})};
const rest=()=>{Object.entries(S.v).forEach(([i,v])=>{const x=G(i);if(x){if(x.type=='checkbox')x.checked=v;else x.value=v}})};FAM.forEach(f=>Object.assign(f,{nm:f.r,tel:'(88) 9'+f.id+'-0021',end:'Rua das Acácias, '+f.id.slice(1)+' – '+f.b,ee:'',ocup:'Autônomo(a)',renda:'Até 1 salário mínimo',mem:Array.from({length:f.m},(_,k)=>({n:k?'Membro '+(k+1):f.r,p:k?(k==1?'Cônjuge':'Filho(a)'):'Responsável',dn:''}))}));
const DI=[[0,2,4],[1,3],[0,1,2,3,4]],TU=['Manhã','Tarde','Manhã e tarde'];U.forEach((u,k)=>u[3]={cpf:'123.456.789-0'+k,dn:'',tel:'(88) 90000-10'+k+'0',em:u[0].split(' ')[0].toLowerCase()+'@sesfa.org',end:'',dias:DI[k%3],turno:TU[k%3]});
const vsel=(cur,blank)=>`<div><label for="vr">Responsável</label><select id="vr">${blank?'<option value="">— Distribuir depois —</option>':''}${vols().map(u=>`<option value="${sh(u[0])}" ${sh(u[0])==cur?'selected':''}>${sh(u[0])} — ${disp(u[3])}</option>`).join('')}</select></div>`;
function saveFam(force){keep();
const v=S.v;S.errs={};S.dup=null;[['nm','o nome do responsável'],['nc','a data de nascimento'],['tel','um telefone de contato'],['rua','a rua e número'],['bai','o bairro'],['cid','a cidade']].forEach(([k,l])=>{if(!(v[k]||'').trim())S.errs[k]='Informe '+l+'.'});if(!v.cons)S.errs.cons='Confirme o consentimento para salvar.';if(!Object.keys(S.errs).length&&!force){const d=FAM.find(x=>x.tel.replace(/\D/g,'')==v.tel.replace(/\D/g,'')||x.nm.toLowerCase()==v.nm.trim().toLowerCase());if(d){S.dup=d;render();return}}
if(Object.keys(S.errs).length){render();
const b=document.querySelector('.bad,.err');if(b)b.scrollIntoView({block:'center'});return}
const id=String(Math.max(...FAM.map(x=>+x.id))+1).padStart(4,'0'),nm=v.nm.trim(),mem=[{n:nm,p:'Responsável',dn:v.nc},...S.mem];FAM.push({id,r:sh(nm),nm,b:v.bai,m:mem.length,s:'Cadastro recente',p:'—',tel:v.tel,end:v.rua+' – '+v.bai+', '+v.cid+(v.cep?' · CEP '+v.cep:''),ee:v.ee,ocup:v.oc,renda:v.rd,mem});go('familias');toast('Família '+id+' cadastrada')}
const rvs=()=>{const R={'Todo o período':[0,1299],'Últimos 7 dias':[1022,1029],'Este mês':[1001,1031]}[S.rp];return V.filter(v=>key(v.d)>=R[0]&&key(v.d)<=R[1]&&(S.rv=='Todos'||v.r==S.rv))};
