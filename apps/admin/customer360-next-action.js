import { request } from './api-client.js';
const nextActionApiBase=()=>((localStorage.getItem('ARABISK_API_BASE')||window.ARABISK_API_BASE||(location.hostname==='localhost'?'http://localhost:3000':'/proxy')).replace(/\/$/,''));
const nextActionEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const nextActionMoney=v=>'AED '+Number(v||0).toFixed(0);
const nextActionState=v=>({needs_consent:'مراجعة الموافقة',blocked:'عائق تشغيلي',overdue:'مهمة متأخرة',open:'إجراء مفتوح',observe:'مراقبة فقط'})[String(v||'').toLowerCase()]||'مراجعة مطلوبة';

let activeCustomerId='';
let pendingProfile=null;

function ensureNextActionStyles(){
  if(document.getElementById('customer360-next-action-styles'))return;
  const style=document.createElement('style');
  style.id='customer360-next-action-styles';
  style.textContent='.customer360-next-action{margin-top:10px;padding:12px;border:1px solid rgba(183,146,79,.22);border-radius:12px;background:linear-gradient(135deg,rgba(183,146,79,.09),rgba(255,255,255,.02));display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center}.customer360-next-action-main{display:grid;gap:4px;min-width:0}.customer360-next-action-main>span{font-size:10px;opacity:.55;letter-spacing:.03em}.customer360-next-action-main>strong{font-size:14px}.customer360-next-action-main>p{margin:0;font-size:11px;opacity:.75;line-height:1.55}.customer360-next-action-main>small{font-size:10px;opacity:.56;line-height:1.45}.customer360-next-action-learning{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:2px}.customer360-next-action-learning b{font-size:9px;padding:4px 7px;border-radius:999px;background:rgba(183,146,79,.12);font-weight:700}.customer360-next-action-learning span{font-size:9px;opacity:.58}.customer360-next-action-side{display:grid;justify-items:end;gap:5px;text-align:end}.customer360-next-action-side>b{font-size:10px;opacity:.68}.customer360-next-action-side>strong{font-size:13px}.customer360-next-action-side .small-action{white-space:nowrap}@media(max-width:760px){.customer360-next-action{grid-template-columns:1fr}.customer360-next-action-side{justify-items:start;text-align:start}}';
  document.head.appendChild(style);
}

function openNextRevenueAction(id){
  const campaignId=String(id||'').trim();
  if(!campaignId)return;
  document.querySelector('[data-section="revenue"]')?.click();
  setTimeout(async()=>{
    if(window.ARABISK_LOAD_REVENUE)await window.ARABISK_LOAD_REVENUE();
    const target=document.querySelector('[data-campaign-id="'+CSS.escape(campaignId)+'"]');
    if(!target)return;
    target.classList.add('customer360-highlight-row');
    target.scrollIntoView({behavior:'smooth',block:'center'});
    target.querySelector('[data-campaign-detail]')?.click();
    setTimeout(()=>target.classList.remove('customer360-highlight-row'),2200);
  },80);
}

async function createNextRevenueAction(decision){
  if(!decision?.actionType||!decision?.actionReference)return;
  const data=await request('/api/revenue/campaign-drafts',{
    method:'POST',
    body:JSON.stringify({type:decision.actionType,reference:decision.actionReference})
  });
  const campaignId=data.id||data.campaignId||'';
  if(campaignId)openNextRevenueAction(campaignId);
}

function renderNextAction(profile,customerId){
  if(!profile||!customerId||customerId!==activeCustomerId)return;
  const body=document.querySelector('#customer360-body');
  const summary=body?.querySelector('[data-customer360-outcome-summary]');
  if(!body||!summary)return;
  summary.querySelector('[data-customer360-next-action]')?.remove();
  const decision=profile.decision||{};
  const nextAction=String(profile.nextAction||decision.recommendedAction||'راجع آخر نشاط للعميل وحدد الخطوة المناسبة.').trim();
  const createAllowed=Boolean(decision.actionType&&decision.actionReference&&decision.consentRequired===false&&decision.ready&&!decision.nextOpenActionId);
  const button=decision.nextOpenActionId
    ? '<button type="button" class="small-action" data-next-action-open="'+nextActionEsc(decision.nextOpenActionId)+'">فتح الإجراء المفتوح</button>'
    : createAllowed
      ? '<button type="button" class="small-action" data-next-action-create>إنشاء الإجراء المقترح</button>'
      : '';
  const value=Number(decision.potentialValue||0)>0?'<strong>'+nextActionMoney(decision.potentialValue)+'</strong>':'';
  const policy=decision.learningPolicy||null;
  const learning=policy
    ? '<div class="customer360-next-action-learning"><b>'+nextActionEsc(policy.label||'تعلّم تشغيلي')+'</b><span>العينة: '+Number(policy.sampleSize||0)+' — التحول: '+Number(policy.conversionRate||0).toFixed(1)+'%'+(policy.reason?' — السبب المتكرر: '+nextActionEsc(policy.reason):'')+'</span></div>'
    : '';
  const html='<section class="customer360-next-action" data-customer360-next-action><div class="customer360-next-action-main"><span>الخطوة التالية للنظام</span><strong>'+nextActionEsc(decision.label||'مراجعة العميل')+'</strong><p>'+nextActionEsc(nextAction)+'</p><small>الحالة: '+nextActionEsc(nextActionState(decision.stateKey))+(decision.reason?' — '+nextActionEsc(decision.reason):'')+'</small>'+learning+'</div><div class="customer360-next-action-side"><b>'+nextActionEsc(nextActionState(decision.stateKey))+'</b>'+value+button+'</div></section>';
  const head=summary.querySelector('.customer360-outcome-summary-head');
  if(head)head.insertAdjacentHTML('afterend',html);else summary.insertAdjacentHTML('afterbegin',html);
}

function scheduleRender(attempt=0){
  if(!pendingProfile||!activeCustomerId)return;
  const body=document.querySelector('#customer360-body');
  const summary=body?.querySelector('[data-customer360-outcome-summary]');
  if(summary){renderNextAction(pendingProfile,activeCustomerId);return;}
  if(attempt<8)setTimeout(()=>scheduleRender(attempt+1),50);
}

document.addEventListener('click',event=>{
  const opener=event.target.closest('[data-customer-360]');
  if(opener?.dataset.customer360){activeCustomerId=opener.dataset.customer360;pendingProfile=null;setTimeout(scheduleRender,0);}
  const open=event.target.closest('[data-next-action-open]');
  if(open){open.disabled=true;openNextRevenueAction(open.dataset.nextActionOpen);}
  const create=event.target.closest('[data-next-action-create]');
  if(create){
    create.disabled=true;
    void createNextRevenueAction(pendingProfile?.decision||{}).catch(error=>alert(error.message||'تعذر إنشاء الإجراء المقترح.')).finally(()=>{create.disabled=false;});
  }
},true);

function patchCustomer360Response(){
  if(window.__ARABISK_CUSTOMER360_NEXT_ACTION_PATCHED__)return;
  window.__ARABISK_CUSTOMER360_NEXT_ACTION_PATCHED__=true;
  const originalFetch=window.fetch.bind(window);
  window.fetch=async(...args)=>{
    const response=await originalFetch(...args);
    try{
      const input=args[0];
      const rawUrl=typeof input==='string'?input:(input?.url||'');
      const path=new URL(rawUrl,window.location.href).pathname;
      const match=path.match(/\/api\/revenue\/customers\/([^/]+)\/360$/);
      if(match&&response.ok){
        const clone=response.clone();
        void clone.json().then(profile=>{
          const customerId=decodeURIComponent(match[1]);
          if(!activeCustomerId)activeCustomerId=customerId;
          if(customerId===activeCustomerId){pendingProfile=profile;scheduleRender();}
        }).catch(()=>{});
      }
    }catch(_){}
    return response;
  };
}
ensureNextActionStyles();
patchCustomer360Response();
