import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ARABISK_ADMIN_USERNAME='ci';
process.env.ARABISK_ADMIN_PASSWORD='ci';

const { createAdminAuth } = await import('../apps/admin/auth-service.js');

const makeReq=()=>({headers:{},socket:{remoteAddress:'198.51.100.10'}});
const makeRes=()=>({setHeader(){},writeHead(){},end(){}});

test('successful-auth reset clears the login rate bucket',()=>{
  const { consumeAuthAttempt, resetAuthAttempts } = createAdminAuth();
  const req=makeReq();
  const res=makeRes();

  for(let i=0;i<6;i++) assert.equal(consumeAuthAttempt(req,res),false);
  assert.equal(consumeAuthAttempt(req,res),true);
  resetAuthAttempts(req);
  assert.equal(consumeAuthAttempt(req,res),false);
});

test('session storage evicts the oldest session at the configured cap',()=>{
  const { createSession, getSession } = createAdminAuth();
  const req=makeReq();
  let firstCookie='';
  const makeCookieRes=()=>({
    setHeader(name,value){ if(name==='Set-Cookie' && !firstCookie) firstCookie=value; },
    writeHead(){},
    end(){}
  });

  createSession(makeCookieRes(),req,'ci');
  const firstToken=decodeURIComponent(firstCookie.split(';',1)[0].split('=',2)[1]);

  for(let i=0;i<2000;i++) {
    createSession({setHeader(){},writeHead(){},end(){}},req,'ci');
  }

  assert.equal(getSession({...req,headers:{cookie:`arabisk_admin_session=${encodeURIComponent(firstToken)}`}}),null);
});
