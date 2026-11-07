"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
require("../ai/providers.js");
const D=require("../diagnostics/connection.js");
const key="sk_TEST_SECRET_123456";
test("model access checks use exactly one authenticated GET, no inference or prompt",()=>{
  const expected={
    openai:"https://api.openai.com/v1/models/gpt-6-mini",
    anthropic:"https://api.anthropic.com/v1/models/claude-sonnet-4-5",
    gemini:"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash"
  };
  for(const [provider,model] of [
    ["openai","gpt-6-mini"],["anthropic","claude-sonnet-4-5"],["gemini","gemini-2.5-flash"]
  ]){
    const req=D.modelRequest(provider,model,key);
    assert.equal(req.url,expected[provider]);
    assert.equal(req.options.method,"GET");
    assert.equal(req.options.credentials,"omit");
    assert.equal(req.options.redirect,"error");
    assert.equal(req.options.body,undefined);
    assert(!req.url.includes(key));
    assert(!JSON.stringify(req.options).includes("systemInstruction"));
  }
});
test("provider metadata is reduced to safe, small fields; API key not returned",async()=>{
  const cases=[
    ["openai","gpt-6-mini",{id:"gpt-6-mini",object:"model",created:3}],
    ["anthropic","claude-sonnet-4-5",{id:"claude-sonnet-4-5",type:"model",lifecycle:"active"}],
    ["gemini","gemini-2.5-flash",{name:"models/gemini-2.5-flash",displayName:"Gemini Flash",
       supportedGenerationMethods:["generateContent"]}]
  ];
  for(const [provider,model,payload] of cases){
    let calls=0;
    const result=await D.modelProbe({provider,model,key,now:1000000,fetchImpl:async(url,opts)=>{
      calls++;assert.equal(opts.method,"GET");
      return {ok:true,status:200,json:async()=>({...payload,secret: "NEVER_RETURN"})};
    }});
    assert.equal(calls,1);
    assert.equal(result.ok,true);
    assert.equal(result.modelId,model);
    assert.equal(result.checkedAt,"1970-01-01T00:16:40.000Z");
    assert(!JSON.stringify(result).includes(key));
    assert(!JSON.stringify(result).includes("NEVER_RETURN"));
    assert.match(result.message,/not yet verified/);
  }
});
test("model failures never return response bodies, keys or user content",async()=>{
  for(const status of [401,403,404,429,500]){
    const result=await D.modelProbe({provider:"openai",model:"gpt-6-mini",key,
      fetchImpl:async()=>({status,ok:false,json:async()=>({error:"LEAKED SECRET"})})});
    assert.equal(result.ok,false);
    assert(!JSON.stringify(result).includes("LEAKED"));
    assert(!JSON.stringify(result).includes(key));
  }
  const offline=await D.modelProbe({provider:"openai",model:"gpt-6-mini",key,
    fetchImpl:async()=>{throw Error("SECRET_IN_NETWORK_ERROR");}});
  assert.equal(offline.ok,false);
  assert(!JSON.stringify(offline).includes("SECRET_IN_NETWORK_ERROR"));
});
test("only selected authorized Google sources are queried, with no data parsing or AI calls",async()=>{
  const calls=[];
  const now=Date.parse("2026-11-07T12:00:00Z");
  const read={accessToken:"secret_google_access_token",expiresAt:now+200000,
    scopes:[D.PROBES.calendar.scope,D.PROBES.tasks.scope]};
  const result=await D.googleProbe({
    sources:{calendar:true,tasks:false},token:read,now,
    permitted:async()=>true,
    fetchImpl:async(url,opts)=>{
      calls.push({url,opts});
      return {ok:true,status:200,json:async()=>{throw Error("DO_NOT_READ_OR_LOG_ITEM_DATA");}};
    }
  });
  assert.equal(result.allPassed,true);
  assert.equal(result.accountDataReturned,false);
  assert.equal(result.aiUsed,false);
  assert.equal(result.sources.length,1);
  assert.equal(calls.length,1);
  assert.equal(calls[0].opts.method,"GET");
  assert.equal(calls[0].opts.credentials,"omit");
  assert(calls[0].url.includes("maxResults=1"));
  assert(calls[0].url.includes("fields="));
  assert(!JSON.stringify(result).includes("secret_google_access_token"));
});
test("Google tests are blocked without OAuth scope, token or Firefox data consent",async()=>{
  const now=1000000;
  const token={accessToken:"TEST_GOOGLE_TOKEN",expiresAt:now+200000,scopes:[D.PROBES.calendar.scope]};
  let calls=0;
  const fetchImpl=async()=>{calls++;return {ok:true,status:200}};
  await assert.rejects(D.googleProbe({sources:{calendar:true},token:null,now,
    permitted:async()=>true,fetchImpl}));
  await assert.rejects(D.googleProbe({sources:{},token,now,
    permitted:async()=>true,fetchImpl}));
  const denied=await D.googleProbe({sources:{calendar:false,tasks:true},token,now,
    permitted:async()=>true,fetchImpl});
  assert.equal(denied.sources[0].ok,false);
  const rejected=await D.googleProbe({sources:{calendar:true},token,now,
    permitted:async()=>false,fetchImpl});
  assert.equal(rejected.sources[0].ok,false);
  assert.equal(calls,0);
});
