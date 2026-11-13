"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const Transcript=require("../ai/transcript.js");
const Providers=require("../ai/providers.js");
const Context=require("../ai/context.js");
const Stream=require("../ai/openai-stream.js");
require("../shared/persona.js");
const Session=require("../ai/session.js");
const entry=(prompt,answer,provider="openai",model="gpt-5.4-mini",at=123)=>({prompt,answer,provider,model,at});
function mockBrowser(entries,provider="anthropic",model="claude-sonnet-4-5"){
  const all={
    [Transcript.KEY]:entries,
    [Session.KEY_SESSION]:{provider,key:"fake-test-key-value-not-a-real-token"},
    [Session.SETTINGS_KEY]:{provider,model}
  };
  const reads=[];
  return {browser:{
    storage:{
      local:{get:async key=>{reads.push("local:"+key);return {[key]:all[key]};}},
      session:{get:async key=>{reads.push("session:"+key);return {[key]:all[key]};}}
    },
    permissions:{contains:async()=>true}
  },reads};
}
test("opt-in is false by default; malformed or excessive history requests fail closed",()=>{
  assert.deepEqual(Context.options({}),{includeHistory:false,historyLimit:0});
  assert.deepEqual(Context.options({includeHistory:false,historyLimit:99}),{includeHistory:false,historyLimit:0});
  for(const opts of [{includeHistory:"yes",historyLimit:2},{includeHistory:true},
    {includeHistory:true,historyLimit:0},{includeHistory:true,historyLimit:4},
    {includeHistory:true,historyLimit:"2"}])
    assert.throws(()=>Context.options(opts),/consent|Choose 1/);
});
test("history is selected in order, only from matching contiguous provider/model, up to 3 turns",()=>{
  const raw=[
    entry("old","older","openai"),
    entry("break","other provider","anthropic","claude-sonnet-4-5"),
    entry("one","first"),entry("two","second"),entry("three","third")
  ];
  const result=Context.choose(raw,"openai","gpt-5.4-mini",{includeHistory:true,historyLimit:3});
  assert.deepEqual(result.turns.map(x=>x.prompt),["one","two","three"]);
  assert.equal(result.characters,"onefirsttwosecondthreethird".length);
  assert.equal(Context.choose(raw,"openai","different-model",{includeHistory:true,historyLimit:3}).turns.length,0);
  assert.equal(Context.choose(raw,"openai","gpt-5.4-mini",{includeHistory:false,historyLimit:3}).turns.length,0);
});
test("oversized latest exchange is not partially sent or replaced with older nonadjacent entries",()=>{
  const raw=[entry("old","small"),entry("recent","a".repeat(12000))];
  const result=Context.choose(raw,"openai","gpt-5.4-mini",{includeHistory:true,historyLimit:3});
  assert.equal(result.turns.length,0);
  assert.equal(result.characters,0);
});
test("no transcript is even read when history opt-in is absent",async()=>{
  const {browser,reads}=mockBrowser([entry("a","b")]);
  const result=await Context.load(browser,"openai","gpt-5.4-mini",{includeHistory:false,historyLimit:3});
  assert.equal(result.turns.length,0);
  assert.deepEqual(reads,[]);
});
test("context preview exposes local counts only; no transcript text or secrets",async()=>{
  const first=entry("question-secret","answer-secret","anthropic","claude-sonnet-4-5");
  const {browser}=mockBrowser([first]);
  const summary=(await Context.preview(browser,{includeHistory:true,historyLimit:1})).summary;
  assert.equal(summary.turns,1);
  assert.equal(summary.characters,first.prompt.length+first.answer.length);
  assert(!JSON.stringify(summary).includes("secret"));
  assert.equal(summary.maximumCharacters,12000);
});
test("OpenAI Responses body keeps old single turn format unless explicitly using role messages",()=>{
  const simple=JSON.parse(Providers.buildRequest("openai","gpt-5.4-mini","fake-test-key-value-not-a-real-token","style","new query").options.body);
  assert.equal(simple.input,"new query");assert.equal(simple.store,false);
  const old=[{prompt:"question",answer:"answer"}];
  const multi=JSON.parse(Providers.buildRequest("openai","gpt-5.4-mini","fake-test-key-value-not-a-real-token","style","follow-up",old).options.body);
  assert.deepEqual(multi.input,[
    {role:"user",content:"question"},{role:"assistant",content:"answer"},
    {role:"user",content:"follow-up"}
  ]);
  assert.equal(multi.store,false);
});
test("Anthropic and Gemini use their native user/assistant or user/model roles",()=>{
  const history=[{prompt:"Hello",answer:"Hi!"},{prompt:"Question",answer:"Result"}];
  const a=JSON.parse(Providers.buildRequest("anthropic","claude-sonnet-4-5","fake-test-key-value-not-a-real-token","style","And next?",history).options.body);
  assert.deepEqual(a.messages.map(x=>x.role),["user","assistant","user","assistant","user"]);
  const g=JSON.parse(Providers.buildRequest("gemini","gemini-3.8-flash","fake-test-key-value-not-a-real-token","style","And next?",history).options.body);
  assert.deepEqual(g.contents.map(x=>x.role),["user","model","user","model","user"]);
  assert.equal(g.contents[0].parts[0].text,"Hello");
  assert.equal(g.contents.at(-1).parts[0].text,"And next?");
});
test("OpenAI SSE builds bounded role array with store:false and unchanged web-search opt-in",()=>{
  const request=Stream.buildRequest({model:"gpt-5.4-mini",key:"fake-test-key-value-not-a-real-token",prompt:"Now?",
    system:"Keep it concise",effort:"none",webSearch:false,history:[{prompt:"Earlier",answer:"Done"}]});
  const body=JSON.parse(request.options.body);
  assert.equal(body.stream,true);assert.equal(body.store,false);assert.equal(body.tools,undefined);
  assert.deepEqual(body.input.map(x=>x.role),["user","assistant","user"]);
  const plain=JSON.parse(Stream.buildRequest({model:"gpt-5.4-mini",key:"fake-test-key-value-not-a-real-token",
    prompt:"Now?",system:"Keep it concise",effort:"none",webSearch:false}).options.body);
  assert.equal(plain.input,"Now?");
});
test("nonstream execution includes history only on true, bounded consent; no Google data",async()=>{
  const records=[entry("old other","other answer","openai","gpt-5.4-mini"),
    entry("first","reply","anthropic","claude-sonnet-4-5"),
    entry("second","response","anthropic","claude-sonnet-4-5")];
  const {browser,reads}=mockBrowser(records);
  const requests=[];
  const fetchImpl=async(url,opts)=>{
    requests.push({url,body:JSON.parse(opts.body)});
    return {ok:true,status:200,json:async()=>({content:[{type:"text",text:"Fine, here is the response."}]})};
  };
  const persona=async()=>({mode:"ayarime",customPrompt:""});
  const plain=await Session.handle(browser,fetchImpl,persona,{type:"AI_SEND_PROMPT",text:"No history"});
  assert.equal(plain.result.contextTurns,0);
  assert.equal(requests[0].body.messages.length,1);
  assert(!reads.includes("session:"+Transcript.KEY));
  const more=await Session.handle(browser,fetchImpl,persona,{type:"AI_SEND_PROMPT",text:"Use prior replies",
    includeHistory:true,historyLimit:2});
  assert.equal(more.result.contextTurns,2);
  assert.deepEqual(requests[1].body.messages.map(x=>x.content),
    ["first","reply","second","response","Use prior replies"]);
  assert(!JSON.stringify(requests).includes("old other"));
  assert(!JSON.stringify(requests).includes("Google data"));
});
test("Hub and sidebar require a per-send checkbox, limit, and preview",()=>{
  for(const path of ["hub.html","sidebar.html"]){
    const html=read(path);
    for(const id of ["ai-context-enable","ai-context-limit","ai-context-preview"])
      assert(html.includes('id="'+id+'"'),"missing "+id+" from "+path);
    assert(html.includes("this request only"));
    assert(!/<input id="ai-context-enable"[^>]*checked/.test(html),"context must start unchecked");
    assert(html.includes("can increase tokens, cost and latency"));
  }
  const ui=read("ui.js"),trace=read("ui-trace.js"),conversation=read("ui-conversation.js");
  assert(ui.includes("...context"));
  assert(ui.includes("WorkspaceConversationUI.resetContext()"));
  assert(trace.includes("includeHistory:settings.includeHistory,historyLimit:settings.historyLimit"));
  assert(conversation.includes('AI_CONTEXT_PREVIEW'));
  assert(read("manifest.json").includes('"ai/context.js"'));
  assert(read("scripts/package.py").includes('"ai/context.js"'));
  assert(!read("background.js").slice(read("background.js").indexOf("async function handleCoreMessage"),
    read("background.js").indexOf("browser.runtime.onMessageExternal.addListener")).includes("AI_CONTEXT_PREVIEW"),
    "core bridge must not read conversation context");
});
