(() => {
'use strict';
const PROFILE_DATA_KEY='ARABISK_PROFILE_DATA_V1';
const PROFILE_TOKEN_KEY='ARABISK_PROFILE_TOKEN_V1';
const DEVICE_ID_KEY='ARABISK_DEVICE_ID_V1';
const $=s=>document.querySelector(s);

function getJson(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
function getProfile(){return getJson(PROFILE_DATA_KEY)}
function getToken(){try{return localStorage.getItem(PROFILE_TOKEN_KEY)||''}catch{return ''}}
function saveProfile(profile){
  const shared=window.ARABISK_PROFILE?.setProfile;
  if(typeof shared==='function'){shared(profile);return;}
  try{
    localStorage.setItem(PROFILE_DATA_KEY,JSON.stringify(profile));
    if(profile?.profileToken)localStorage.setItem(PROFILE_TOKEN_KEY,String(profile.profileToken));
  }catch{}
  window.dispatchEvent(new CustomEvent('arabisk:profile-updated',{detail:{profile}}));
}
function getDeviceId(){
  try{
    let value=localStorage.getItem(DEVICE_ID_KEY);
    if(!value){
      value=crypto.randomUUID?.()||('device-'+Date.now()+'-'+Math.random().toString(36).slice(2));
      localStorage.setItem(DEVICE_ID_KEY,value);
    }
    return value;
  }catch{return 'device-'+Date.now()}
}
function initials(name){
  const value=String(name||'ARABISK').trim();
  return value.split(/\s+/).slice(0,2).map(item=>item.charAt(0)).join('').toUpperCase()||'A';
}
function render(profile){
  $('#profile-loading')?.setAttribute('hidden','');
  const content=$('#profile-content');
  if(!content)return;
  content.hidden=false;
  const name=String(profile?.name||'عميل ARABISK');
  $('#profile-name').value=profile?.name||'';
  $('#profile-phone').value=profile?.phone||'';
  $('#profile-name-heading').textContent=name;
  $('#profile-phone-heading').textContent=String(profile?.phone||'—');
  $('#profile-avatar').textContent=initials(name);
  $('#profile-phone-status').textContent=profile?.phoneVerified===true?'موثّق':'غير موثّق';
}
function showMessage(message,error=false){
  const node=$('#profile-status');
  if(!node)return;
  node.textContent=message||'';
  node.classList.toggle('error',Boolean(error));
}
async function refreshProfile(){
  const token=getToken();
  const cached=getProfile();
  if(!token){
    render(cached||{});
    showMessage(cached?'بياناتك محفوظة على هذا الجهاز.':'أنشئ ملفك ببياناتك لبدء استخدام حساب ARABISK.');
    return cached;
  }
  try{
    const response=await fetch('/api/customer-profile',{headers:{'X-ARABISK-PROFILE-TOKEN':token},cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(response.ok&&data?.profileToken){
      const profile={...data,profileToken:token};
      saveProfile(profile);render(profile);showMessage('تم تحديث بيانات ملفك من خادم ARABISK.');
      return profile;
    }
    if(response.status===401){
      render(cached||{});
      showMessage('انتهت جلسة الملف. احفظ بياناتك مرة أخرى لاستعادتها.',true);
      return cached;
    }
    throw new Error(data?.message||'تعذر تحميل الملف.');
  }catch(error){
    if(cached){render(cached);showMessage('الاتصال غير متاح حاليًا. نعرض آخر بيانات محفوظة على الجهاز.');return cached}
    render({});
    showMessage(error.message||'تعذر تحميل الملف.',true);
    return null;
  }
}
async function save(){
  const form=$('#profile-form');
  const button=$('#profile-save');
  if(!form||!button)return;
  const name=String(form.elements.name.value||'').trim();
  const phone=String(form.elements.phone.value||'').trim();
  button.disabled=true;
  button.textContent='جاري الحفظ…';
  showMessage('');
  try{
    const token=getToken();
    const response=await fetch('/api/customer-profile',{
      method:'POST',
      headers:{'Content-Type':'application/json',...(token?{'X-ARABISK-PROFILE-TOKEN':token}:{})},
      body:JSON.stringify({name,phone,privacyConsent:true,deviceId:getDeviceId()})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.message||'تعذر حفظ بياناتك الآن.');
    saveProfile(data);render(data);
    showMessage('تم حفظ ملفك وربطه بتجربتك داخل ARABISK.');
  }catch(error){
    showMessage(error.message||'تعذر حفظ بياناتك الآن.',true);
  }finally{
    button.disabled=false;
    button.textContent='حفظ بياناتي';
  }
}
document.addEventListener('DOMContentLoaded',()=>{
  $('#profile-form')?.addEventListener('submit',event=>{event.preventDefault();void save()});
  void refreshProfile();
});
})();