const apiBase=()=>{
  if(!import.meta.env.DEV)return '/proxy';
  return (localStorage.getItem('ARABISK_API_BASE')||window.ARABISK_API_BASE||import.meta.env.VITE_API_BASE_URL||'http://localhost:3000').replace(/\/$/,'');
};

export class AdminApiError extends Error{
  constructor(message,status=0,requestId=''){
    super(message); this.name='AdminApiError'; this.status=status; this.requestId=requestId;
  }
}

export async function request(path,options={}){
  const controller=new AbortController();
  const timeoutMs=Number(options.timeoutMs||15000);
  const timeout=window.setTimeout(()=>controller.abort(new DOMException('Request timeout','TimeoutError')),timeoutMs);
  const callerSignal=options.signal;
  const forwardCallerAbort=()=>{
    if(!controller.signal.aborted)controller.abort(callerSignal?.reason);
  };
  if(callerSignal){
    if(callerSignal.aborted)forwardCallerAbort();
    else callerSignal.addEventListener('abort',forwardCallerAbort,{once:true});
  }

  const headers={'Content-Type':'application/json',Accept:'application/json','X-Request-Id':crypto.randomUUID(),...(options.headers||{})};
  const fetchOptions={...options,headers,cache:'no-store',signal:controller.signal};
  delete fetchOptions.timeoutMs;

  try{
    const response=await fetch(`${apiBase()}${path}`,fetchOptions);
    const responseRequestId=response.headers.get('X-Request-Id')||headers['X-Request-Id'];
    const text=await response.text();
    let data={};
    if(text){try{data=JSON.parse(text)}catch{data={message:text.slice(0,300)}}}
    if(!response.ok){
      const message=response.status===401?'انتهت جلسة لوحة التحكم. سجّل الدخول مرة أخرى.':
        response.status===403?'ليس لديك صلاحية تنفيذ هذا الإجراء.':
        response.status===429?'تم تجاوز عدد المحاولات المسموح بها. حاول مرة أخرى لاحقًا.':
        data.message||`تعذر تنفيذ الطلب (HTTP ${response.status}).`;
      throw new AdminApiError(message,response.status,responseRequestId);
    }
    return data;
  }catch(error){
    if(error instanceof AdminApiError)throw error;
    if(error?.name==='AbortError'||error?.name==='TimeoutError'||error?.message==='Request timeout'){
      throw new AdminApiError('انتهت مهلة الاتصال بالخادم. حاول مرة أخرى.',408,headers['X-Request-Id']);
    }
    throw new AdminApiError('تعذر الاتصال بالخادم. تحقق من الشبكة ثم حاول مرة أخرى.',0,headers['X-Request-Id']);
  }finally{
    window.clearTimeout(timeout);
    callerSignal?.removeEventListener('abort',forwardCallerAbort);
  }
}

window.ARABISK_ADMIN_REQUEST=request;
