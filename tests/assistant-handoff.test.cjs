"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const bg=read("background.js"),html=read("hub.html"),ui=read("ui.js");
test("assistant route is a local, explicit UI handoff",()=>{
  assert(html.includes('id="ai-console"'));
  assert(html.includes('href="#assistant"'));
  assert(html.includes('id="ai-open-sidebar"'));
  assert(ui.includes('browser.sidebarAction.open().then('));
  assert(ui.includes('openAssistantSidebar.addEventListener("click",()=>{'));
  assert(ui.includes('location.hash!=="#assistant"'));
  assert(ui.includes('prompt.focus({preventScroll:true})'));
  assert(ui.includes('prompt.scrollIntoView({block:"center"})'),"Handoff must show the actual AI composer, not just top of settings");
  assert(ui.includes('history.replaceState(null,"",location.pathname+location.search)'));
  assert(bg.includes('capabilities:["OPEN_WORKSPACE","OPEN_ASSISTANT"'));
  assert(bg.includes('case "OPEN_ASSISTANT"'));
});
test("OPEN_ASSISTANT reuses pinned hub without launching Google or inference",async()=>{
  const from=bg.indexOf("async function ensureHub("),to=bg.indexOf("async function ensureGroup(",from);
  assert(from>=0&&to>from,"hub and assistant handoff functions are present");
  const snippet=bg.slice(from,to);
  const hubUrl="moz-extension://companion/hub.html";
  const tabs=[];const calls=[];
  const browser={
    runtime:{getURL:()=>hubUrl},
    tabs:{
      query:async()=>tabs.map(t=>({...t})),
      create:async props=>{const t={id:7,windowId:props.windowId,url:props.url,active:props.active,pinned:props.pinned,incognito:false};tabs.push(t);calls.push(["create",props]);return {...t}},
      update:async(id,props)=>{const t=tabs.find(t=>t.id===id);assert(t);Object.assign(t,props);calls.push(["update",props]);return {...t}}
    },
    windows:{update:async(id,props)=>{calls.push(["focus",id,props]);}}
  };
  const context={browser,currentWindow:async()=>({id:1})};
  vm.createContext(context);
  vm.runInContext(snippet+"globalThis.go=focusAssistant;",context);
  const first=await context.go();
  assert.equal(first.focused,true);assert.equal(tabs.length,1);
  assert.equal(tabs[0].url,hubUrl+"#assistant");assert.equal(tabs[0].pinned,true);
  tabs[0].url=hubUrl; // Simulate Hub clearing the transient route after focusing.
  const second=await context.go();
  assert.equal(second.hubTabId,first.hubTabId);
  assert.equal(tabs.length,1,"second handoff must reuse the Hub");
  assert.equal(calls.filter(x=>x[0]==="create").length,1);
  assert(calls.filter(x=>x[0]==="update").every(x=>x[1].active===true));
  assert(!/launchWorkspace|fetch\(|AI_SEND_PROMPT|GOOGLE_READ/.test(snippet),"handoff must not trigger Google or inference");
});
