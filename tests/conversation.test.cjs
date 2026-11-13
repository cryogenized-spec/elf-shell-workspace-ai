"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const Transcript=require("../ai/transcript.js");
const KEY=Transcript.KEY;
function harness(){
  const data={},writes=[];
  const browser={storage:{session:{
    async get(k){return {[k]:data[k]};},
    async set(o){Object.assign(data,structuredClone(o));writes.push("set");},
    async remove(k){delete data[k];writes.push("remove");}
  }}};
  return {browser,data,writes,request:msg=>Transcript.handle(browser,msg)};
}
test("session conversation is blank by default; only explicitly appended exchanges are stored",async()=>{
  const h=harness();
  assert.deepEqual((await h.request({type:"AI_CONVERSATION_LIST"})).entries,[]);
  assert.equal(h.writes.length,0,"opening Hub cannot write or call a model");
  const saved=await h.request({type:"AI_CONVERSATION_APPEND",
    prompt:"   Hello Ayarime   ",answer:"   Welcome back.   ",provider:"openai",model:"gpt-6-luna"});
  assert.equal(saved.entries.length,1);
  assert.equal(saved.entries[0].prompt,"Hello Ayarime");
  assert.equal(saved.entries[0].answer,"Welcome back.");
  assert.equal(h.data[KEY].length,1);
  assert.equal(typeof h.data[KEY][0].at,"number");
});
test("bounded session transcript discards old exchanges without persistent storage",async()=>{
  const h=harness();
  for(let i=0;i<14;i++)await h.request({type:"AI_CONVERSATION_APPEND",prompt:"Question "+i,
    answer:"A".repeat(200),provider:"gemini",model:"gemini-3.8-flash"});
  const entries=(await h.request({type:"AI_CONVERSATION_LIST"})).entries;
  assert.equal(entries.length,10);
  assert.equal(entries[0].prompt,"Question 4");
  assert.equal(entries.at(-1).prompt,"Question 13");
  assert.equal(h.browser.storage.local,undefined);
});
test("rejects oversized, malformed, or provider-unknown records",async()=>{
  const h=harness();
  for(const bad of [
    {prompt:"",answer:"x",provider:"openai",model:"gpt-6-luna"},
    {prompt:"x",answer:"x".repeat(12001),provider:"openai",model:"gpt-6-luna"},
    {prompt:"x",answer:"x",provider:"invalid",model:"gpt-6-luna"},
    {prompt:"x",answer:"x",provider:"openai",model:"../secret"}
  ])await assert.rejects(h.request({type:"AI_CONVERSATION_APPEND",...bad}),/Invalid local transcript entry/);
  assert.equal(h.writes.length,0);
});
test("clear removes session transcript but leaves other session records untouched",async()=>{
  const h=harness();
  h.data["elfshell.byok.apiKey.v1"]={provider:"openai",key:"private"};
  await h.request({type:"AI_CONVERSATION_APPEND",prompt:"test",answer:"reply",provider:"openai",model:"gpt-6-luna"});
  assert.deepEqual((await h.request({type:"AI_CONVERSATION_CLEAR"})).entries,[]);
  assert.equal(h.data[KEY],undefined);
  assert.equal(h.data["elfshell.byok.apiKey.v1"].key,"private");
});
test("both Hub and sidebar show the same session-only disclosure and controls",()=>{
  for(const file of ["hub.html","sidebar.html"]){
    const html=read(file);
    for(const id of ["ai-conversation-list","ai-conversation-clear","ai-conversation-count","ai-conversation-status"])
      assert(html.includes('id="'+id+'"'),file+" lacks "+id);
    assert(html.includes("are not sent as context unless you opt in for that request"),file+" must disclose that history requires an explicit opt-in");
    assert(html.includes('src="ui-conversation.js"'),file+" must load shared transcript UI");
    assert(html.indexOf('src="ui-conversation.js"')<html.indexOf('src="ui.js"'));
  }
  const background=read("background.js"),manifest=read("manifest.json"),packagePy=read("scripts/package.py");
  assert(background.includes('case "AI_CONVERSATION_LIST"'));
  assert(background.includes('case "AI_CONVERSATION_APPEND"'));
  assert(!background.slice(background.indexOf("async function handleCoreMessage"),background.indexOf("browser.runtime.onMessageExternal.addListener")).includes("AI_CONVERSATION"),"external core must never reach transcript");
  assert(manifest.includes('"ai/transcript.js"'));
  for(const f of ["ai/transcript.js","ui-conversation.js"])assert(packagePy.includes('"'+f+'"'),"package missing "+f);
});
test("visible transcript is never silently sent as provider context",()=>{
  const providers=read("ai/providers.js"),stream=read("ai/openai-stream.js"),session=read("ai/session.js"),ui=read("ui-conversation.js");
  assert(session.includes('const prompt=PROVIDERS.userText(message.text)'));
  assert(!session.includes("AI_CONVERSATION_LIST"));
  assert(providers.includes('input:text,instructions'));
  assert(providers.includes('messages:[{role:"user",content:text}]'));
  assert(stream.includes("prompt:message.text"));
  assert(!ui.includes("fetch("));
});

test("truncated provider previews remain labelled after archiving and reloading",async()=>{
  const h=harness();
  const entry={type:"AI_CONVERSATION_APPEND",prompt:"Long response",
    answer:"A".repeat(12000),provider:"anthropic",model:"claude-sonnet-4-5",truncated:true};
  const appended=await h.request(entry);
  assert.equal(appended.entries[0].truncated,true);
  const reloaded=await h.request({type:"AI_CONVERSATION_LIST"});
  assert.equal(reloaded.entries[0].truncated,true);
  const normal=await h.request({...entry,prompt:"Brief",answer:"Done",truncated:false});
  assert.equal(normal.entries.at(-1).truncated,false);
  const ui=read("ui-conversation.js"),caller=read("ui.js");
  assert(ui.includes("item.truncated===true"));
  assert(ui.includes("Response preview truncated"));
  assert(ui.includes("truncated:truncated===true"));
  assert(caller.includes("truncated:result.result.truncated===true"));
});
