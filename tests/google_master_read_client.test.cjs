"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const M=require("../google/master-read-client.js");
const TOKEN="MCP_READ_ONLY_SYNTHETIC_TOKEN_DO_NOT_USE";
const HOST="https://google-master-mcp.cryogenized.workers.dev";
function fixture(overrides={}){
  const events={permission:0,approval:0,token:0,network:0,options:null};
  const client=M.create({
    hasHostPermission:async origin=>{events.permission++;assert.equal(origin,HOST);return true;},
    approveRead:async info=>{events.approval++;assert.equal(info.risk,"read");return true;},
    getAccessToken:async()=>{events.token++;return TOKEN;},
    fetchImpl:async(url,options)=>{
      events.network++;events.options=options;
      assert.equal(new URL(url).origin,HOST);
      if(url.endsWith("/capabilities"))return Response.json({operations:[
        {name:"tasks_list_tasklists",description:"List task lists",risk:"read"},
        {name:"gmail_list_messages",description:"List metadata",risk:"read"},
        {name:"tasks_create_task",description:"Forbidden",risk:"write"},
        {name:"write_prepare_action",description:"Forbidden",risk:"prepare"}
      ]});
      return Response.json({result:{items:[{id:"safe_synthetic",title:"QA"}]}});
    },...overrides
  });
  return {client,events};
}
test("Google Master adapter is inert by construction and targets one exact protected MCP resource",()=>{
  const {client,events}=fixture();
  assert.equal(M.RESOURCE,HOST+"/mcp");
  assert.equal(client.operations.length,24);
  assert.deepEqual([events.network,events.token,events.approval,events.permission],[0,0,0,0]);
  assert(Object.isFrozen(client));
  for(const bad of ["http://"+HOST.slice(8)+"/mcp",HOST+"/mcp?token=x",
    "https://attacker.invalid/mcp",HOST+"/mcp/../v1",HOST+"/",
    "https://user:pass@google-master-mcp.cryogenized.workers.dev/mcp"]){
    assert.throws(()=>M.create({resourceUrl:bad,...{} ,
      hasHostPermission:async()=>true,approveRead:async()=>true,
      getAccessToken:async()=>TOKEN,fetchImpl:async()=>{}}),/INVALID_RESOURCE/);
  }
});
test("all mutations, unsafe input, and arbitrary URLs are rejected before token acquisition",async()=>{
  const {client,events}=fixture();
  for(const op of ["tasks_create_task","gmail_send_message","write_prepare_action",
    "script_update_sources","../tasks_list_tasks","https://evil.invalid"]){
    await assert.rejects(client.read(op,{}),/UNKNOWN_OPERATION/);
  }
  for(const input of [{accessToken:"forbidden"},{input:{approval:true}},
    {constructor:"bad"},{unsafe:()=>42},{payload:"a".repeat(35000)}]){
    await assert.rejects(client.read("tasks_list_tasks",input),/INVALID_INPUT|INPUT_TOO_LARGE/);
  }
  assert.deepEqual([events.network,events.token,events.approval],[0,0,0]);
});
test("per-call refusal and revoked optional host access both prevent token acquisition",async()=>{
  let tokenCalls=0,netCalls=0;
  const first=M.create({approveRead:async()=>false,hasHostPermission:async()=>true,
    getAccessToken:async()=>{tokenCalls++;return TOKEN;},
    fetchImpl:async()=>{netCalls++;return Response.json({});}});
  await assert.rejects(first.read("tasks_list_tasklists"),/USER_CONSENT_REQUIRED/);
  const second=M.create({approveRead:async()=>true,hasHostPermission:async()=>false,
    getAccessToken:async()=>{tokenCalls++;return TOKEN;},
    fetchImpl:async()=>{netCalls++;return Response.json({});}});
  await assert.rejects(second.read("tasks_list_tasklists"),/FIREFOX_HOST_PERMISSION_REQUIRED/);
  assert.equal(tokenCalls,0);assert.equal(netCalls,0);
});
test("strict authenticated read filters write capabilities and does not send cookies",async()=>{
  const {client,events}=fixture();
  const capabilities=await client.capabilities();
  assert.deepEqual(capabilities.map(x=>x.name),["tasks_list_tasklists","gmail_list_messages"]);
  assert(capabilities.every(x=>x.risk==="read"));
  const result=await client.read("tasks_list_tasklists",{maxResults:3});
  assert.equal(result.items[0].title,"QA");
  assert.equal(events.network,2);assert.equal(events.approval,2);
  assert.equal(events.token,2);assert.equal(events.permission,2);
  assert.equal(events.options.method,"POST");
  assert.equal(events.options.headers.Authorization,"Bearer "+TOKEN);
  assert.equal(events.options.credentials,"omit");
  assert.equal(events.options.redirect,"error");
  assert.equal(events.options.cache,"no-store");
  assert.equal(events.options.referrerPolicy,"no-referrer");
  assert.deepEqual(JSON.parse(events.options.body),{maxResults:3});
});
test("resource tokens are never inferred, cached, logged or accepted from Google vault",async()=>{
  const {client,events}=fixture({getAccessToken:async()=>""});
  await assert.rejects(client.read("tasks_get_task",{tasklistId:"t",taskId:"1"}),/MCP_TOKEN_REQUIRED/);
  assert.equal(events.network,0);
});
test("large and malformed responses are rejected without echoing remote data",async()=>{
  const large=fixture({fetchImpl:async()=>new Response(JSON.stringify({result:"x".repeat(600000)}))});
  await assert.rejects(large.client.read("tasks_list_tasks",{tasklistId:"t"}),/RESPONSE_TOO_LARGE/);
  const invalid=fixture({fetchImpl:async()=>new Response("SECRET_BODY_NEVER_ECHO")});
  await assert.rejects(invalid.client.read("tasks_list_tasks",{tasklistId:"t"}),
    e=>e.message==="REMOTE_RESPONSE_INVALID");
  const unauthorized=fixture({fetchImpl:async()=>new Response("PRIVATE_401_BODY",{status:401})});
  await assert.rejects(unauthorized.client.read("tasks_list_tasks",{tasklistId:"t"}),
    e=>e.message==="CLIENT_UNAUTHORIZED");
});

test("OAuth and optional-permission callback failures never echo secrets",async()=>{
  for(const [overrides,code] of [
    [{approveRead:async()=>{throw Error("SENSITIVE_USER_CONTEXT")}},"USER_CONSENT_REQUIRED"],
    [{hasHostPermission:async()=>{throw Error("SENSITIVE_BROWSER_CONTEXT")}},"FIREFOX_HOST_PERMISSION_REQUIRED"],
    [{getAccessToken:async()=>{throw Error("SENSITIVE_OAUTH_CALLBACK_URL")}},"MCP_TOKEN_REQUIRED"]
  ]){
    const {client,events}=fixture(overrides);
    await assert.rejects(client.read("tasks_list_tasklists"),err=>
      err.name==="WorkspaceGoogleMasterError" && err.message===code &&
      !err.message.includes("SENSITIVE"));
    assert.equal(events.network,0);
  }
});
