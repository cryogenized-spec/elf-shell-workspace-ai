"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto").webcrypto;
const O=require("../google/oauth.js");
const READ=require("../google/read.js");
const fakeClient="123456789-abcdefabcdef.apps.googleusercontent.com";
const idRedirect="https://devredirect.extensions.allizom.org/";
test("Firefox loopback OAuth URL uses derived extension identity and PKCE S256",async()=>{
  const p=await O.prepare({client:fakeClient,selected:[O.CALENDAR_READ],
    identityRedirect:idRedirect,cryptoApi:crypto});
  const url=new URL(p.url);
  assert.equal(url.origin,"https://accounts.google.com");
  assert.equal(url.pathname,"/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("response_type"),"code");
  assert.equal(url.searchParams.get("code_challenge_method"),"S256");
  assert.equal(url.searchParams.get("redirect_uri"),"http://127.0.0.1/mozoauth2/devredirect");
  assert.equal(url.searchParams.get("client_id"),fakeClient);
  assert.equal(p.verifier.length,64);
  assert(p.state.length>=32);
  assert.notEqual(url.searchParams.get("code_challenge"),p.verifier);
  assert(!url.href.includes("client_secret"));
});
test("unauthorized Google clients and unexpected scope escalation are rejected",async()=>{
  assert.throws(()=>O.clientId("https://example.com"));
  assert.throws(()=>O.clientId("123.apps.googleusercontent.com"));
  assert.throws(()=>O.scopes(["https://mail.google.com/"]));
  assert.throws(()=>O.scopes([]));
  assert.throws(()=>O.scopes([O.CALENDAR_READ,O.CALENDAR_READ]));
  assert.throws(()=>O.redirectUri("https://untrusted.example.com"));
});
test("callback origin/path/state and expiry are validated",async()=>{
  const p=await O.prepare({client:fakeClient,selected:[O.CALENDAR_READ],identityRedirect:idRedirect,cryptoApi:crypto});
  const pending={...p,createdAt:100000};
  const ok=p.redirectUri+"?code=goodcode&state="+p.state;
  assert.equal(O.validateCallback(ok,pending,100010),"goodcode");
  assert.throws(()=>O.validateCallback(p.redirectUri+"?code=x&state=WRONG",pending,100010));
  assert.throws(()=>O.validateCallback("http://evil.example/mozoauth2/devredirect?code=x&state="+p.state,pending,100010));
  assert.throws(()=>O.validateCallback(ok,pending,500001));
  assert.throws(()=>O.validateCallback(p.redirectUri+"?error=access_denied&state="+p.state,pending,100010));
});
test("access-token response drops refresh_token and rejects missing scopes",()=>{
  const answer=O.validateToken({access_token:"token_test_12345678",token_type:"Bearer",
    scope:O.CALENDAR_READ,expires_in:3600,refresh_token:"DO_NOT_STORE"},[O.CALENDAR_READ],1000);
  assert.equal(answer.accessToken,"token_test_12345678");
  assert.equal(answer.scopes[0],O.CALENDAR_READ);
  assert.equal(answer.expiresAt,1000+3600000-30000);
  assert.equal(answer.refresh_token,undefined);
  assert.throws(()=>O.validateToken({access_token:"token_test_12345678",token_type:"Bearer",
    scope:"https://mail.google.com/",expires_in:3600},[O.CALENDAR_READ],1000));
});
test("Calendar reader uses only the specific primary calendar GET endpoint",async()=>{
  const requested=[];
  const now=new Date("2026-11-07T09:00:00Z").valueOf();
  const token={accessToken:"abcdef",expiresAt:now+300000,scopes:[O.CALENDAR_READ]};
  const fakeFetch=async(url,init)=>{requested.push({url,init});return {
    ok:true,status:200,json:async()=>({items:[{id:"a",summary:"Team planning",start:{dateTime:"2026-11-07T11:00:00+02:00"}}]})
  };};
  const got=await READ.todayCalendar(token,fakeFetch,now);
  assert.equal(got.events.length,1);
  assert.equal(got.events[0].title,"Team planning");
  assert.equal(requested.length,1);
  assert.equal(requested[0].init.method,"GET");
  assert.equal(requested[0].init.credentials,"omit");
  assert.equal(new URL(requested[0].url).hostname,"www.googleapis.com");
  assert(new URL(requested[0].url).pathname.includes("/calendars/primary/events"));
});
test("Tasks reader bounds list enumeration and never writes",async()=>{
  const requested=[];
  const token={accessToken:"abcdef",expiresAt:Date.now()+300000,scopes:[O.TASKS_READ]};
  const fakeFetch=async(url,init)=>{
    requested.push({url,init});
    if(url.includes("/users/@me/lists"))
      return {ok:true,status:200,json:async()=>({items:Array.from({length:6},(_,i)=>({id:"list"+i,title:"List "+i}))})};
    return {ok:true,status:200,json:async()=>({items:[{id:"x",title:"A task"}]})};
  };
  const result=await READ.currentTasks(token,fakeFetch);
  assert.equal(result.lists.length,5);
  assert.equal(result.limited,true);
  assert.equal(requested.length,6);
  assert(requested.every(x=>x.init.method==="GET" && x.init.headers.Authorization==="Bearer abcdef"));
});
test("readers reject expired tokens and do not issue network calls",async()=>{
  let calls=0;
  const fakeFetch=async()=>{calls++;throw Error("must not call");};
  await assert.rejects(READ.todayCalendar({accessToken:"abc",expiresAt:0,scopes:[O.CALENDAR_READ]},fakeFetch));
  await assert.rejects(READ.currentTasks({accessToken:"abc",expiresAt:0,scopes:[O.TASKS_READ]},fakeFetch));
  assert.equal(calls,0);
});
