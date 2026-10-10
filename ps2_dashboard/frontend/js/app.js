/* CreditNirvana PS2 dashboard — SPA logic + ECharts */
const API=(window.CN_API_BASE||'');  /* '' = same origin; set in index.html for split hosting */
const CN={ink:'#0B2540',teal:'#10877A',gold:'#F2A93B',rose:'#B4443F',cyan:'#2E8B9E',purple:'#7A5C9E',mut:'#6B7A86',line:'#E2EAE8',panel:'#EEF4F3'};
const PALETTE=[CN.teal,CN.gold,CN.cyan,CN.ink,CN.rose,CN.purple];
const SUBTITLES={overview:'Right-Party-Contact prediction & skip-trace prioritisation · live from the deployed model weights',
 scorer:'Enter a number’s context + its recent calls — the model computes recency, Markov & HMM signals and scores it live',
 dialer:'Contact points ranked by predicted health · the dialer calls the best number first',
 skip:'Value-of-information: trace only when expected recovery beats the cost',
 performance:'Held-out performance of the primary contact-point-health model + the technique evaluation',
 eda:'The exploratory analysis that shaped the features and the decisions',
 compliance:'The guardrails that keep every action within RBI FPC & DPDP'};
const TITLES={overview:'Command Center',scorer:'Contact-Point Scorer',dialer:'Dial List & Actions',skip:'Skip-Trace Value',performance:'Model Performance',eda:'EDA & Insights',compliance:'Compliance'};
let META=null, DATA=null; const charts={}; const rendered={};
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
function ec(id){ if(charts[id]){charts[id].resize();return charts[id];} const el=document.getElementById(id); charts[id]=echarts.init(el,null,{renderer:'canvas'}); return charts[id]; }
const baseGrid={left:46,right:18,top:24,bottom:34}; const axisStyle={axisLine:{lineStyle:{color:CN.line}},axisTick:{show:false},axisLabel:{color:CN.mut},splitLine:{lineStyle:{color:'#EEF3F2'}}};
const TT={backgroundColor:'#0B2540',borderWidth:0,textStyle:{color:'#fff',fontSize:12},padding:[7,11]};

/* ---------- routing ---------- */
function show(view){
  $$('.navlinks a').forEach(a=>a.classList.toggle('active',a.dataset.view===view));
  $$('.view').forEach(s=>s.classList.toggle('hidden',s.id!==view));
  $('#viewTitle').textContent=TITLES[view]; $('#viewSub').textContent=SUBTITLES[view];
  if(!rendered[view]){ (RENDER[view]||(()=>{}))(); rendered[view]=true; }
  setTimeout(()=>Object.values(charts).forEach(c=>c.resize()),60);
}
$$('.navlinks a').forEach(a=>a.addEventListener('click',()=>show(a.dataset.view)));
window.addEventListener('resize',()=>Object.values(charts).forEach(c=>c.resize()));

/* ---------- boot ---------- */
(async function(){
  try{
    META=await (await fetch(API+'/api/meta')).json();
    DATA=await (await fetch(API+'/api/data')).json();
    $('#apiStatus').textContent='model online'; $('.dot').classList.add('ok');
    buildScorerForm(); buildSkipForm(); RENDER.overview();
  }catch(e){ $('#apiStatus').textContent='backend offline'; console.error(e); }
})();

/* ---------- helpers ---------- */
const fmtPct=v=>(v*100).toFixed(1)+'%'; const cap=s=>(s||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
function kpiTile(c,lab,val,foot){return `<div class="kpi ${c}"><div class="lab">${lab}</div><div class="val tnum">${val}</div><div class="foot">${foot}</div></div>`;}

/* ===================== OVERVIEW ===================== */
const RENDER={};
RENDER.overview=function(){
  const k=DATA.kpi;
  $('#kpirow').innerHTML=[
    kpiTile('', 'Contact-point health AUC', k.health_auc, 'primary deliverable · P(RPC within 14d)'),
    kpiTile('gold','RPC per 1,000 dials', k.rpc_per_1000_after, `up from <b>${k.rpc_per_1000_before}</b> · model-ranked`),
    kpiTile('cyan','Gold borrower-ID AUC', k.gold_borrower_auc, 'vs verified ground truth'),
    kpiTile('', 'Address RPC AUC', k.address_auc, 'field / visit model'),
    kpiTile('rose','Compliance suppressions', k.suppressions, 'recycled / third-party blocked')
  ].join('');
  // reachability gauge
  const reach=DATA.health_base? (1-DATA.health_base):0.41; // share with health (approx share labelled)
  gauge('gaugeReach', Math.round((k.health_auc)*0)+ (DATA.kpi.health_auc, (meanHealth())) , 'reachable');
  // rpc bar
  ec('barRpc').setOption({grid:baseGrid,tooltip:{...TT,trigger:'axis'},xAxis:{type:'category',data:['Current rule','Model top-50%','Model top-25%'],...axisStyle},yAxis:{type:'value',name:'per 1,000',...axisStyle},
    series:[{type:'bar',barWidth:'46%',itemStyle:{color:p=>[CN.mut,CN.teal,CN.gold][p.dataIndex],borderRadius:[6,6,0,0]},
      data:[k.rpc_per_1000_before,k.rpc_per_1000_after,316],label:{show:true,position:'top',color:CN.ink,fontWeight:600}}]});
  // leaderboard
  const lb=DATA.leaderboard.slice().reverse();
  ec('barLeader').setOption({grid:{left:120,right:40,top:10,bottom:24},tooltip:TT,xAxis:{type:'value',min:0.66,max:0.78,...axisStyle},yAxis:{type:'category',data:lb.map(x=>x.model),...axisStyle},
    series:[{type:'bar',barWidth:'58%',data:lb.map(x=>({value:x.auc,itemStyle:{color:x.model.includes('Health')?CN.gold:CN.teal,borderRadius:[0,5,5,0]}})),label:{show:true,position:'right',formatter:p=>p.value.toFixed(3),color:CN.ink,fontWeight:600}}]});
  // states pie
  pieStates('pieStates');
};
function meanHealth(){ const h=DATA.health_hist; if(!h) return 50; let s=0,w=0; h.x.forEach((x,i)=>{s+=(x+0.025)*h.y[i];w+=h.y[i];}); return Math.round((w?s/w:0.4)*100); }
function gauge(id,val,label){
  ec(id).setOption({series:[{type:'gauge',startAngle:210,endAngle:-30,min:0,max:100,radius:'92%',center:['50%','58%'],
    progress:{show:true,width:16,itemStyle:{color:val<30?CN.rose:val<50?CN.gold:CN.teal}},
    axisLine:{lineStyle:{width:16,color:[[0.3,'#f3dcd9'],[0.5,'#fbeccb'],[1,'#d5ebe6']]}},
    pointer:{show:false},axisTick:{show:false},splitLine:{show:false},axisLabel:{show:false},
    anchor:{show:false},title:{show:true,offsetCenter:[0,'32%'],color:CN.mut,fontSize:12},
    detail:{valueAnimation:true,offsetCenter:[0,'-2%'],formatter:v=>v.toFixed(0)+'%',color:CN.ink,fontSize:34,fontFamily:'Space Grotesk',fontWeight:700},
    data:[{value:val,name:label}]}]});
}
function pieStates(id){
  const d=(DATA.scorecard_states||[]).map((x,i)=>({name:cap(x.name),value:x.value}));
  ec(id).setOption({tooltip:TT,legend:{bottom:0,textStyle:{color:CN.mut,fontSize:11},icon:'circle'},color:PALETTE,
    series:[{type:'pie',radius:['45%','70%'],center:['50%','44%'],avoidLabelOverlap:true,itemStyle:{borderColor:'#fff',borderWidth:2},
      label:{show:false},data:d}]});
}

/* ===================== SCORER ===================== */
const NUMF=[['priority_slot','Priority slot (0=primary)','number',0],['phone_age_days','Number age (days)','number',45],
  ['masked_n_accounts','# accounts sharing this number','number',1],['dpd_start','Days past due','number',35],
  ['outstanding','Outstanding (₹)','number',320000],['emi_amount','EMI (₹)','number',14000],
  ['overdue_start','Overdue (₹)','number',42000],['other_active_loans','Other active loans','number',1],
  ['ability_to_pay_estimate','Ability-to-pay (0-1)','number',''],['prev_ptp_count','Prior PTPs','number',2],
  ['prev_ptp_broken','Prior PTPs broken','number',1],['hour','Hour of day','number',9],['dow','Day of week (0=Mon)','number',2]];
const CATF=['source','relation_recorded','channel','dialling_arm','bucket_start','bureau_score_band','income_type','portfolio','town_id','preferred_language','last_bounce_reason','lender_id'];
const CATLAB={source:'Number source',relation_recorded:'Recorded relation',channel:'Channel',dialling_arm:'Dialling arm',bucket_start:'Delinquency bucket',bureau_score_band:'Bureau band',income_type:'Income type',portfolio:'Portfolio',town_id:'Town',preferred_language:'Language',last_bounce_reason:'Last bounce reason',lender_id:'Lender'};
function buildScorerForm(){
  const cats=META.categories; let h='';
  CATF.forEach(c=>{const opts=(cats[c]||cats['ph_'+c]||[]).map(o=>`<option value="${o}">${cap(o)}</option>`).join(''); h+=`<div class="fld"><label>${CATLAB[c]}</label><select id="f_${c}">${opts}</select></div>`;});
  NUMF.forEach(([id,lab,,def])=>{h+=`<div class="fld"><label>${lab}</label><input id="f_${id}" type="number" step="any" value="${def}"></div>`;});
  h+=`<div class="fld"><label>Salary day known</label><select id="f_salary_day_known"><option value="false">No</option><option value="true">Yes</option></select></div>`;
  h+=`<div class="fld"><label>Paid other lenders 30d</label><select id="f_paid_other_lenders_30d"><option value="false">No</option><option value="true">Yes</option></select></div>`;
  $('#scoreForm').innerHTML=h;
  $('#addCall').onclick=()=>addSeq('NO_ANSWER',3);
  $('#scoreBtn').onclick=scorePredict;
  buildPresets(); applyPreset('reachable');
}
function addSeq(state,days){
  const opts=META.states.map(s=>`<option value="${s}" ${s===state?'selected':''}>${cap(s)}</option>`).join('');
  const div=document.createElement('div'); div.className='seqitem';
  div.innerHTML=`<select>${opts}</select><input type="number" step="any" value="${days}" title="days ago"><button class="rm">×</button>`;
  div.querySelector('.rm').onclick=()=>div.remove();
  $('#seqList').appendChild(div);
}
function setSeq(arr){ $('#seqList').innerHTML=''; arr.forEach(([s,d])=>addSeq(s,d)); }
function getSeq(){ return $$('#seqList .seqitem').map(it=>({state:it.querySelector('select').value,days_ago:parseFloat(it.querySelector('input').value)||0})); }
const PRESETS={
 reachable:{t:'Reachable borrower',f:{source:'kyc_origination',relation_recorded:'self',bucket_start:'1-30',bureau_score_band:'650-699',priority_slot:0,masked_n_accounts:1},seq:[['RPC',2],['RPC',9],['NO_ANSWER',16],['RPC',23]]},
 dead:{t:'Switched-off / dead',f:{source:'kyc_origination',relation_recorded:'self',bucket_start:'90+',bureau_score_band:'300-549',priority_slot:1,masked_n_accounts:1},seq:[['SWITCHED_OFF',1],['SWITCHED_OFF',8],['SWITCHED_OFF',15],['UNREACHABLE',22]]},
 recycled:{t:'Recycled / wrong',f:{source:'bureau',relation_recorded:'self',bucket_start:'61-90',bureau_score_band:'550-649',priority_slot:2,masked_n_accounts:4},seq:[['RPC',40],['WRONG',6],['WRONG',13],['THIRD_PARTY',20]]},
 thirdparty:{t:'Third-party number',f:{source:'reference',relation_recorded:'reference_spouse',bucket_start:'31-60',bureau_score_band:'550-649',priority_slot:2,masked_n_accounts:2},seq:[['THIRD_PARTY',3],['THIRD_PARTY',10],['NO_ANSWER',17],['THIRD_PARTY',24]]},
 avoiding:{t:'Valid but avoiding',f:{source:'borrower_update',relation_recorded:'self',bucket_start:'31-60',bureau_score_band:'650-699',priority_slot:0,masked_n_accounts:1},seq:[['NO_ANSWER',1],['REJECTED',4],['NO_ANSWER',8],['REJECTED',12]]}
};
function buildPresets(){ $('#presets').innerHTML=Object.entries(PRESETS).map(([k,v])=>`<button data-p="${k}">${v.t}</button>`).join(''); $$('#presets button').forEach(b=>b.onclick=()=>applyPreset(b.dataset.p)); }
function applyPreset(k){ const p=PRESETS[k]; Object.entries(p.f).forEach(([id,val])=>{const el=$('#f_'+id); if(el) el.value=val;}); setSeq(p.seq); scorePredict(); }
async function scorePredict(){
  const payload={sequence:getSeq()};
  CATF.forEach(c=>payload[c==='source'?'source':c]=$('#f_'+c).value);
  NUMF.forEach(([id])=>{const v=$('#f_'+id).value; payload[id]=v===''?null:parseFloat(v);});
  payload.salary_day_known=$('#f_salary_day_known').value==='true'; payload.paid_other_lenders_30d=$('#f_paid_other_lenders_30d').value==='true';
  const r=await (await fetch(API+'/api/predict/health',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})).json();
  $('#outTarget').textContent=`P(RPC within ${r.horizon_days} days)`;
  gauge('gaugeHealth', Math.round(r.p_health*100), 'health');
  const sb=$('#stateBadge'); sb.className='statebadge '+r.state; sb.textContent=cap(r.state);
  $('#actLabel').textContent=cap(r.action); $('#actReason').textContent=r.reason;
  $('#compBanner').classList.toggle('hidden',!r.suppress);
  $('#drivers').innerHTML=r.drivers.map(d=>`<div class="driver"><span>${d.label}</span><span class="vwrap"><b class="v">${d.value===null?'—':d.value}</b><span class="pill ${d.good?'g':'b'}"></span></span></div>`).join('');
  const hb=r.hmm_belief; ec('hmmBelief').setOption({grid:{left:110,right:30,top:6,bottom:16},tooltip:TT,xAxis:{type:'value',max:1,...axisStyle,axisLabel:{show:false}},yAxis:{type:'category',data:Object.keys(hb).map(cap),...axisStyle},
    series:[{type:'bar',barWidth:'60%',data:Object.values(hb).map((v,i)=>({value:v,itemStyle:{color:i===0?CN.teal:PALETTE[(i+1)%6],borderRadius:[0,4,4,0]}})),label:{show:true,position:'right',formatter:p=>p.value.toFixed(2),color:CN.mut,fontSize:10}}]});
  $('#companion').innerHTML=`Companion per-attempt score (live dial-timing): <b>${r.p_attempt===null?'—':fmtPct(r.p_attempt)}</b> · history: ${r.agg.n} calls, ${r.agg.rpc} RPC, ${r.agg.tp} third-party, ${r.agg.wr} wrong`;
}

/* ===================== DIALER ===================== */
let DIALROWS=[];
const DIALACT=st=>({reachable:'Continue — best number, best slot',avoiding:'Switch channel (WhatsApp / field)',switched_off_longterm:'Retry w/ back-off, else trace',temporarily_unreachable:'Retry later (back-off)',third_party_recycled:'SUPPRESS — compliance',invalid:'Trace',untested:'Dial to gather evidence'}[st]||'Review');
RENDER.dialer=async function(){
  const r=await (await fetch(API+'/api/scorecard?limit=5000')).json(); DIALROWS=r.rows;
  const counts={}; DIALROWS.forEach(x=>counts[x.state]=(counts[x.state]||0)+1);
  const order=['reachable','avoiding','temporarily_unreachable','switched_off_longterm','third_party_recycled','invalid'];
  const chips=['all'].concat(order.filter(s=>counts[s]));
  const card=document.querySelector('#dialer .card'); let bar=document.getElementById('dialChips');
  if(!bar){bar=document.createElement('div'); bar.id='dialChips'; bar.className='presets'; bar.style.margin='2px 0 12px'; card.querySelector('.tablewrap').before(bar);}
  bar.innerHTML=chips.map((s,i)=>`<button data-s="${s}" class="${i===0?'on':''}">${s==='all'?'All':cap(s)} <b>${s==='all'?DIALROWS.length:counts[s]}</b></button>`).join('');
  bar.querySelectorAll('button').forEach(b=>b.onclick=()=>{bar.querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on');drawDial(b.dataset.s);});
  drawDial('all');
};
function drawDial(filter){
  const rows=(filter==='all'?DIALROWS:DIALROWS.filter(x=>x.state===filter)).slice(0,500);
  document.querySelector('#dialTable tbody').innerHTML=rows.map((x,i)=>{const p=x.p_health||0,pr=(x.p_raw!=null?x.p_raw:p);
    return `<tr><td class="tnum">${i+1}</td><td>${x.phone_id}</td><td>${x.account_id}</td><td><span class="bar" style="width:${Math.round(pr*90)}px"></span><b class="tnum">${fmtPct(p)}</b></td><td><span class="sb ${x.state}">${cap(x.state||'')}</span></td><td>${DIALACT(x.state)}</td></tr>`;}).join('');
}

/* ===================== SKIP ===================== */
const SKF=[['bucket_start','Delinquency bucket','select'],['bureau_score_band','Bureau band','select'],['outstanding','Outstanding (₹)','n',250000],['dpd_start','Days past due','n',120],['emi_amount','EMI (₹)','n',12000],['overdue_start','Overdue (₹)','n',60000],['other_active_loans','Other active loans','n',2],['prev_ptp_count','Prior PTPs','n',1],['prev_ptp_broken','Prior PTPs broken','n',1],['n_phones','# numbers on file','n',2],['n_attempts','Total dial attempts','n',16],['cost_inr','Trace cost (₹)','n',104]];
function buildSkipForm(){ let h=''; SKF.forEach(([id,lab,t,def])=>{ if(t==='select'){const opts=(META.categories[id]||[]).map(o=>`<option>${o}</option>`).join('');h+=`<div class="fld"><label>${lab}</label><select id="s_${id}">${opts}</select></div>`;} else h+=`<div class="fld"><label>${lab}</label><input id="s_${id}" type="number" step="any" value="${def}"></div>`;}); $('#skipForm').innerHTML=h; $('#skipBtn').onclick=skipPredict; }
async function skipPredict(){
  const p={}; SKF.forEach(([id,,t])=>{p[id]=t==='select'?$('#s_'+id).value:parseFloat($('#s_'+id).value);});
  const r=await (await fetch(API+'/api/skiptrace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)})).json();
  const eb=$('#evBig'); eb.textContent='₹'+Number(r.ev).toLocaleString('en-IN'); eb.className='evbig '+(r.worth_it?'pos':'neg');
  $('#evPfind').textContent=fmtPct(r.p_find); $('#evErec').textContent='₹'+Number(r.E_recovery).toLocaleString('en-IN'); $('#evCost').textContent='₹'+r.cost;
  const v=$('#evVerdict'); v.className='verdict '+(r.worth_it?'pos':'neg'); v.textContent=r.worth_it?'✓ Trace is worth it — positive expected value. Add to the EV-ranked queue.':'✗ Not worth tracing — expected value is negative. Hold / deprioritise.';
}

/* ===================== PERFORMANCE ===================== */
RENDER.performance=function(){
  $('#perfKpi').innerHTML=[
    kpiTile('','Health ROC-AUC',DATA.health_auc,'test · P(RPC within 14d)'),
    kpiTile('gold','Health PR-AUC',DATA.health_prauc,`base rate ${DATA.health_base}`),
    kpiTile('cyan','Per-attempt AUC',DATA.kpi.per_attempt_auc,'companion · dial timing'),
    kpiTile('','Skip P(find) AUC',DATA.kpi.skip_pfind_auc,'trace-success model'),
    kpiTile('rose','Gold borrower AUC',DATA.kpi.gold_borrower_auc,'vs verified truth')
  ].join('');
  ec('rocChart').setOption({grid:baseGrid,tooltip:TT,xAxis:{type:'value',name:'FPR',min:0,max:1,...axisStyle},yAxis:{type:'value',name:'TPR',min:0,max:1,...axisStyle},
    series:[{type:'line',smooth:true,showSymbol:false,data:DATA.roc,lineStyle:{width:3,color:CN.teal},areaStyle:{color:'rgba(16,135,122,.08)'}},
            {type:'line',showSymbol:false,data:[[0,0],[1,1]],lineStyle:{type:'dashed',color:CN.mut,width:1}}]});
  ec('prChart').setOption({grid:baseGrid,tooltip:TT,xAxis:{type:'value',name:'recall',min:0,max:1,...axisStyle},yAxis:{type:'value',name:'precision',min:0,max:1,...axisStyle},
    series:[{type:'line',smooth:true,showSymbol:false,data:DATA.pr,lineStyle:{width:3,color:CN.gold},areaStyle:{color:'rgba(242,169,59,.08)'}},
            {type:'line',showSymbol:false,data:[[0,DATA.health_base],[1,DATA.health_base]],lineStyle:{type:'dashed',color:CN.mut,width:1}}]});
  ec('calChart').setOption({grid:baseGrid,tooltip:TT,xAxis:{type:'value',name:'predicted',min:0,max:1,...axisStyle},yAxis:{type:'value',name:'observed',min:0,max:1,...axisStyle},
    series:[{type:'line',data:DATA.calibration,symbolSize:7,lineStyle:{width:3,color:CN.teal},itemStyle:{color:CN.teal}},
            {type:'line',showSymbol:false,data:[[0,0],[1,1]],lineStyle:{type:'dashed',color:CN.mut,width:1}}]});
  const tech=[['Markov: prev network-response + fail-streak','+0.008 AUC','yes','Adopted'],['Recency-weighted state shares + recycled-sigs','+0.004','yes','Adopted'],['HMM hidden-state borrower belief','+0.006','yes','Adopted'],['Power-transform (Yeo-Johnson) — linear only','+0.02','yes','Adopted'],['Markov transition features (into GBM)','+0.000','no','Dropped (redundant)'],['Remark NLP (code-mixed keywords)','≈0.000','no','Dropped (redundant)'],['Isolation-Forest as a feature','AUC→0.98','no','Dropped (leakage)'],['SMOTE oversampling','≈0','no','Dropped (hurts calibration)']];
  $('#techTable').innerHTML=`<table class="techtbl"><tbody>${tech.map(t=>`<tr><td>${t[0]}</td><td class="tnum">${t[1]}</td><td class="${t[2]==='yes'?'yes':'no'}">${t[3]}</td></tr>`).join('')}</tbody></table>`;
};

/* ===================== EDA ===================== */
RENDER.eda=function(){
  // best-time heatmap
  const bt=DATA.besttime, dows=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const vals=bt.data.filter(d=>d[2]!==null).map(d=>d[2]);
  ec('heatTime').setOption({tooltip:{...TT,formatter:p=>`${dows[p.value[0]]} ${bt.hours[p.value[1]]}:00<br/>RPC ${(p.value[2]*100).toFixed(0)}%`},grid:{left:44,right:16,top:10,bottom:44},
    xAxis:{type:'category',data:dows,...axisStyle},yAxis:{type:'category',data:bt.hours.map(h=>h+':00'),...axisStyle},
    visualMap:{min:Math.min(...vals),max:Math.max(...vals),calculable:true,orient:'horizontal',left:'center',bottom:4,itemWidth:12,itemHeight:120,inRange:{color:['#F6FAF4','#9FD0C6','#10877A','#0B2540']},textStyle:{color:CN.mut,fontSize:10}},
    series:[{type:'heatmap',data:bt.data.map(d=>[d[0],d[1],d[2]]),itemStyle:{borderColor:'#fff',borderWidth:1},progressive:0}]});
  // personas
  const ps=DATA.personas;
  ec('personaChart').setOption({grid:baseGrid,tooltip:{...TT,trigger:'axis'},legend:{top:0,textStyle:{color:CN.mut}},
    xAxis:{type:'category',data:ps.map((p,i)=>`Seg ${i+1}`),...axisStyle},yAxis:{type:'value',max:1,...axisStyle},
    series:[{name:'RPC rate',type:'bar',data:ps.map(p=>p.rpc),itemStyle:{color:CN.teal,borderRadius:[4,4,0,0]}},{name:'Payment rate',type:'bar',data:ps.map(p=>p.pay),itemStyle:{color:CN.gold,borderRadius:[4,4,0,0]}}]});
  // funnel (answered disposition)
  ec('funnelChart').setOption({tooltip:TT,color:PALETTE,series:[{type:'funnel',left:'6%',right:'6%',top:6,bottom:6,sort:'descending',gap:2,label:{color:CN.ink,fontSize:11,formatter:p=>cap(p.name)},data:DATA.answered_disp.map(d=>({name:d.name,value:d.value}))}]});
  // shared
  const sh=DATA.shared;
  ec('sharedChart').setOption({grid:baseGrid,tooltip:{...TT,trigger:'axis'},legend:{top:0,textStyle:{color:CN.mut},data:['RPC','third_party','wrong']},
    xAxis:{type:'category',data:sh.groups,...axisStyle},yAxis:{type:'value',...axisStyle},
    series:[{name:'RPC',type:'bar',data:sh.RPC,itemStyle:{color:CN.teal}},{name:'third_party',type:'bar',data:sh.third_party,itemStyle:{color:CN.gold}},{name:'wrong',type:'bar',data:sh.wrong,itemStyle:{color:CN.rose}}]});
  // survival
  ec('survChart').setOption({grid:baseGrid,tooltip:{...TT,trigger:'axis'},xAxis:{type:'value',name:'days',...axisStyle},yAxis:{type:'value',name:'S(t)',min:0,max:1,...axisStyle},
    series:[{type:'line',step:'end',showSymbol:false,data:DATA.survival,lineStyle:{color:CN.teal,width:2.5},areaStyle:{color:'rgba(16,135,122,.08)'}}]});
  // source
  const sr=DATA.source_rpc;
  ec('sourceChart').setOption({grid:{left:120,right:40,top:6,bottom:24},tooltip:TT,xAxis:{type:'value',...axisStyle},yAxis:{type:'category',data:sr.map(x=>cap(x.name)),...axisStyle},
    series:[{type:'bar',barWidth:'55%',data:sr.map(x=>({value:x.value,itemStyle:{color:x.value>0.15?CN.teal:CN.rose,borderRadius:[0,5,5,0]}})),label:{show:true,position:'right',formatter:p=>(p.value*100).toFixed(0)+'%',color:CN.ink,fontWeight:600}}]});
};
RENDER.compliance=function(){ pieStates('compPie'); };
RENDER.scorer=function(){};  /* built on boot */
RENDER.skip=function(){};
