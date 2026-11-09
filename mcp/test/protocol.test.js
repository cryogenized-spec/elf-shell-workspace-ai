import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createInterface} from "node:readline";

test("official v2 MCP stdio handshake discovers exactly four dedicated Tasks tools",async t=>{
  const child=spawn(process.execPath,["src/stdio.js"],{
    cwd:new URL("../",import.meta.url).pathname,
    env:{...process.env,ELFSHELL_GOOGLE_ACCESS_TOKEN:"",ELFSHELL_GOOGLE_SCOPES:""},
    stdio:["pipe","pipe","pipe"]
  });
  t.after(()=>{child.kill();});
  const pending=new Map();
  let childStderr="";
  child.stderr.on("data",chunk=>{childStderr+=chunk.toString().slice(0,2500);});
  child.on("exit",(code,signal)=>{
    for(const cb of pending.values())cb({error:{message:"MCP_CHILD_EXIT",code,signal,stderr:childStderr.slice(0,1800)}});
    pending.clear();
  });
  const reader=createInterface({input:child.stdout});
  reader.on("line",line=>{
    const data=JSON.parse(line);const cb=pending.get(data.id);
    if(cb){pending.delete(data.id);cb(data);}
  });
  let id=0;
  const ask=(method,params={})=>new Promise((resolve,reject)=>{
    const requestId=++id;
    const timer=setTimeout(()=>reject(Error("MCP_TIMEOUT: "+method+" "+childStderr.slice(0,1500))),12000);
    pending.set(requestId,data=>{clearTimeout(timer);resolve(data);});
    child.stdin.write(JSON.stringify({jsonrpc:"2.0",id:requestId,method,params})+"\n");
  });
  const initialized=await ask("initialize",{protocolVersion:"2026-07-28",
    capabilities:{},clientInfo:{name:"m1-qa",version:"0.0.1"}});
  assert(initialized.result,JSON.stringify(initialized));
  child.stdin.write(JSON.stringify({jsonrpc:"2.0",method:"notifications/initialized"})+"\n");
  const listed=await ask("tools/list");
  assert(listed.result,JSON.stringify(listed));
  const names=listed.result.tools.map(x=>x.name).sort();
  assert.deepEqual(names,["tasks_create_task","tasks_get_task","tasks_list_tasklists","tasks_list_tasks"]);
  const denied=await ask("tools/call",{name:"tasks_create_task",arguments:{
    accountId:"default",tasklistId:"demo",title:"Never create"
  }});
  assert(denied.result?.isError);
  assert(!JSON.stringify(denied).includes("accessToken"));
  child.stdin.end();
});
