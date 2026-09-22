const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const money=value=>'AED '+Number(value||0).toFixed(0);

function learningTarget(rows){
  return rows.slice().filter(row=>Number(row.sampleSize||row.total||0)>=3).sort((a,b)=>{
    const rate=Number(b.conversionRate||0)-Number(a.conversionRate||0);
    return rate||Number(b.measuredRevenue||0)-Number(a.measuredRevenue||0)||Number(b.total||0)-Number(a.total||0);
  })[0]||rows.slice().sort((a,b)=>Number(b.measuredRevenue||0)-Number(a.measuredRevenue||0)||Number(b.total||0)-Number(a.total||0))[0]||null;
}
function renderLearningSignals(){
  const panel=document.getElementById('revenue-command-center');
  if(!panel)return;
  let section=document.getElementById('rcc-learning-signals');
  if(!section){
    section=document.createElement('section');
    section.id='rcc-learning-signals';
    section.className='rcc-learning-signals';
    const linked=panel.querySelector('.rcc-linked');
    panel.insertBefore(section,linked||null);
  }
  const state=window.__ARABISK_REVENUE_LEARNING__||{};
  const learning=state.outcomeLearning||{};
  const insights=state.outcomeInsights||{};
  const rows=Array.isArray(learning.rows)?learning.rows:[];
  const target=learningTarget(rows);
  const friction=insights.topFriction||null;
  const signalTitle=target?.label||'بانتظار نتائج كافية';
  const signalDetail=target
    ? 'معدل التحول '+Number(target.conversionRate||0).toFixed(1)+'% من '+Number(target.sampleSize||target.total||0)+' نتائج.'
    : 'لا توجد عينة كافية لاستخراج إشارة مقارنة.';
  const action=target?.learningAction||'استمر في تسجيل النتيجة والسبب بعد كل إجراء.';
  const frictionText=friction
    ? 'الاحتكاك المتكرر: '+String(friction.label||'غير مصنف')+' ('+Number(friction.count||0)+' نتيجة).'
    : 'لم يظهر سبب احتكاك متكرر بعد.';
  section.innerHTML='<div class="rcc-learning-head"><div><span>OUTCOME LEARNING</span><h3>ماذا تعلمنا من النتائج؟</h3><small>القراءة مبنية على النتائج المسجلة فعليًا، مع توضيح حجم العينة قبل اعتبارها إشارة.</small></div><strong>'+Number(learning.outcomesMeasured||0)+' نتيجة</strong></div>'+
    '<div class="rcc-learning-grid">'+
      '<article><span>إشارة قابلة لإعادة الاختبار</span><strong>'+esc(signalTitle)+'</strong><p>'+esc(signalDetail)+'</p><small>'+esc(target?.signalLabel||'إشارة مبكرة')+'</small></article>'+
      '<article><span>التعديل المقترح</span><strong>الخطوة التالية</strong><p>'+esc(action)+'</p><small>'+esc(frictionText)+'</small></article>'+
      '<article><span>القيمة المقاسة</span><strong>'+money(learning.measuredRevenue||0)+'</strong><p>تحولات: '+Number(learning.converted||0)+' من '+Number(learning.outcomesMeasured||0)+' نتيجة.</p><small>هذه إشارة تشغيلية وليست إثباتًا سببيًا.</small></article>'+
    '</div>'+
    '<div class="rcc-learning-actions"><button type="button" class="small-action" id="rcc-learning-open">فتح سجل التعلم</button></div>';
  section.querySelector('#rcc-learning-open').addEventListener('click',()=>{const el=document.getElementById('revenue-outcome-learning');if(el){el.scrollIntoView({behavior:'smooth',block:'start'});el.classList.add('rcc-focus');setTimeout(()=>el.classList.remove('rcc-focus'),1200);}});
}
function bootLearningSignals(){
  renderLearningSignals();
  window.addEventListener('arabisk:revenue-state-updated',renderLearningSignals);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootLearningSignals,{once:true});else bootLearningSignals();
