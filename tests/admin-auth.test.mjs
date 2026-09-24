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
