import test from "node:test";
import assert from "node:assert/strict";
import {createTasksService} from "../src/tasks.js";
import {TASKS_READ,TASKS_WRITE} from "../src/sessions.js";
import {createTaskAction} from "../src/approvals.js";
const later=()=>Date.now()+300000;
const getSession=(scopes)=>({get:async account=>{
  if(account!=="default")throw Error("UNKNOWN_GOOGLE_ACCOUNT");
  return {accessToken:"FAKE_TOKEN_DO_NOT_LEAK",scopes,expiresAt:later()};
}});
const good=(data)=>({ok:true,status:200,json:async()=>data});
test("M1 read tools invoke fixed Tasks REST endpoints and return bounded projections",async()=>{
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({url,opts});
    assert.equal(opts.method,"GET");
    assert.equal(opts.credentials,"omit");
    assert.equal(opts.redirect,"error");
    assert.match(opts.headers.Authorization,/^Bearer /);
    if(url.includes("/users/@me/lists"))
      return good({items:[{id:"abc",title:"Workshop",updated:"2026-11-09",secret:"DO_NOT_RETURN"}],
        nextPageToken:"NEXT_PAGE"});
    if(url.includes("/tasks/id_1"))
      return good({id:"id_1",title:"Fix log",notes:"Inspect",due:"2026-11-18T00:00:00.000Z",
        secret:"DO_NOT_RETURN"});
    return good({items:[{id:"id_1",title:"Fix log",status:"needsAction",
      due:"2026-11-18T00:00:00.000Z",privateField:"DO_NOT_RETURN"}]});
  };
  const tasks=createTasksService({sessions:getSession([TASKS_READ]),fetchImpl});
  const lists=await tasks.listTasklists({maxResults:3});
  const items=await tasks.listTasks({tasklistId:"abc",maxResults:12});
  const one=await tasks.getTask({tasklistId:"abc",taskId:"id_1"});
  assert.equal(lists.partial,true);
  assert.equal(lists.items[0].title,"Workshop");
  assert.equal(items.items[0].scheduledDate,"2026-11-18");
  assert.equal(one.task.notes,"Inspect");
  assert.equal(calls.length,3);
  assert(new URL(calls[0].url).pathname==="/tasks/v1/users/@me/lists");
  assert.equal(new URL(calls[0].url).searchParams.get("maxResults"),"3");
  assert.equal(new URL(calls[1].url).searchParams.get("showCompleted"),"false");
  assert.equal(new URL(calls[1].url).searchParams.get("maxResults"),"12");
  assert(!JSON.stringify({lists,items,one}).includes("DO_NOT_RETURN"));
  assert(!JSON.stringify({lists,items,one}).includes("FAKE_TOKEN"));
});
test("create requires both OAuth write scope and independent host approval",async()=>{
  let calls=0,approvals=0;
  const action={accountId:"default",tasklistId:"abc",title:"Test",notes:"",scheduledDate:""};
  const fakeFetch=async(url,opts)=>{
    calls++;assert.equal(opts.method,"POST");
    assert.equal(opts.headers["Content-Type"],"application/json");
    assert.equal(opts.credentials,"omit");
    assert.deepEqual(JSON.parse(opts.body),{title:"Test"});
    return good({id:"newtask",title:"Test",status:"needsAction"});
  };
  const gate={consume:async got=>{approvals++;assert.deepEqual(got,createTaskAction(action));}};
  const readonly=createTasksService({sessions:getSession([TASKS_READ]),fetchImpl:fakeFetch,approvalGate:gate});
  await assert.rejects(readonly.createTask(action),/GOOGLE_TASKS_SCOPE_MISSING/);
  assert.equal(approvals,0);assert.equal(calls,0);
  const noGate=createTasksService({sessions:getSession([TASKS_WRITE]),fetchImpl:fakeFetch});
  await assert.rejects(noGate.createTask(action),/WRITE_APPROVAL_REQUIRED/);
  assert.equal(calls,0);
  const approved=createTasksService({sessions:getSession([TASKS_WRITE]),fetchImpl:fakeFetch,approvalGate:gate});
  const reply=await approved.createTask(action);
  assert.equal(reply.created,true);assert.equal(reply.task.id,"newtask");
  assert.equal(approvals,1);assert.equal(calls,1);
});
test("unknown account, expired session and network errors fail closed without provider details",async()=>{
  let calls=0;
  const f=async()=>{calls++;return good({items:[]});};
  const tasks=createTasksService({sessions:getSession([TASKS_READ]),fetchImpl:f});
  await assert.rejects(tasks.listTasklists({accountId:"someone-else"}),/UNKNOWN_GOOGLE_ACCOUNT/);
  assert.equal(calls,0);
  const expired=createTasksService({sessions:{get:async()=>({
    accessToken:"FAKE_TOKEN_DO_NOT_LEAK",expiresAt:1,scopes:[TASKS_WRITE]
  })},fetchImpl:f});
  await assert.rejects(expired.listTasklists({}),/GOOGLE_SESSION_EXPIRED/);
  assert.equal(calls,0);
  const failing=createTasksService({sessions:getSession([TASKS_READ]),fetchImpl:async()=>({
    status:403,ok:false,json:async()=>({secret:"GOOGLE_PROVIDER_SECRET"})
  })});
  const error=await failing.listTasks({tasklistId:"abc"}).then(()=>null,e=>e);
  assert.equal(error.message,"GOOGLE_FORBIDDEN");
  assert(!error.message.includes("PROVIDER_SECRET"));
});
test("out-of-range and unsafe resources cannot create or query arbitrary hosts",async()=>{
  const calls=[];
  const tasks=createTasksService({sessions:getSession([TASKS_READ]),fetchImpl:async(url)=>{
    calls.push(url);return good({items:[]});
  }});
  await assert.rejects(tasks.listTasks({tasklistId:"x\ny"}),/INVALID_RESOURCE_ID/);
  assert.equal(calls.length,0);
  await tasks.listTasks({tasklistId:"https://evil.invalid/"});
  assert.equal(new URL(calls[0]).origin,"https://tasks.googleapis.com");
});
