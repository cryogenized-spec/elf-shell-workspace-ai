"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
require("../shared/persona.js");
require("../ai/providers.js");
const STREAM=require("../ai/openai-stream.js");
const encode=new TextEncoder();
function fakeResponse(chunks,status=200){
  const body=new ReadableStream({start(c){for(const x of chunks)c.enqueue(encode.encode(x));c.close();}});
  return {ok:status===200,status,body};
}
function fixture(){
  return {browserApi:{
    storage:{
      local:{get:async()=>({"elfshell.byok.settings.v1":{provider:"openai",model:"gpt-6-luna"}})},
      session:{get:async()=>({"elfshell.byok.apiKey.v1":{provider:"openai",key:"sk_TEST_SECRET_ONLY"}})}
    },
    permissions:{contains:async()=>true}
  },personaLoader:async()=>({mode:"professional"}),fetchImpl:null};
}
test("streaming request opts into summaries without automatically enabling tools",()=>{
  const r=STREAM.buildRequest({model:"gpt-6-luna",key:"sk_TEST_SECRET_ONLY",
    prompt:"Hello",system:"Professional",effort:"medium",webSearch:false});
  const b=JSON.parse(r.options.body);
  assert.equal(r.url,"https://api.openai.com/v1/responses");
  assert.equal(b.store,false);assert.equal(b.stream,true);
  assert.equal(b.model,"gpt-6-luna");assert.equal(b.max_output_tokens,768);
  assert.deepEqual(b.reasoning,{effort:"medium",summary:"auto"});
  assert.equal(b.tools,undefined);
  assert.equal(r.options.redirect,"error");assert.equal(r.options.credentials,"omit");
  assert(!r.options.body.includes("sk_TEST"));
});
test("larger reasoning budget requires explicit selection and remains bounded",()=>{
  const base=STREAM.buildRequest({model:"gpt-6-luna",key:"sk_TEST_SECRET_ONLY",
    prompt:"Analyze carefully",system:"",effort:"high",webSearch:false});
  assert.equal(JSON.parse(base.options.body).max_output_tokens,768);
  for(const maxOutputTokens of [2048,4096]){
    const request=STREAM.buildRequest({model:"gpt-6-luna",key:"sk_TEST_SECRET_ONLY",
      prompt:"Analyze carefully",system:"",effort:"high",webSearch:false,maxOutputTokens});
    assert.equal(JSON.parse(request.options.body).max_output_tokens,maxOutputTokens);
  }
  for(const maxOutputTokens of [0,512,100000,"2048",null]){
    assert.throws(()=>STREAM.optionsFrom({text:"Hello",effort:"high",webSearch:false,maxOutputTokens}),
      /budget/);
    assert.throws(()=>STREAM.buildRequest({model:"gpt-6-luna",key:"sk_TEST_SECRET_ONLY",
      prompt:"Hello",system:"",effort:"high",webSearch:false,maxOutputTokens}),/budget/);
  }
});
test("reasoning token totals reflect provider usage without showing private text",()=>{
  const sent=[],presenter=STREAM.presenter(x=>sent.push(x));
  presenter.handle({type:"response.reasoning_text.delta",delta:"HIDDEN_NOT_FORWARDABLE"});
  presenter.handle({type:"response.reasoning_summary_text.delta",item_id:"rs",summary_index:0,delta:"Checking options"});
  presenter.handle({type:"response.output_text.delta",item_id:"msg",content_index:0,delta:"Answer"});
  presenter.handle({type:"response.completed",response:{usage:{input_tokens:42,output_tokens:110,
    output_tokens_details:{reasoning_tokens:75}}}});
  assert.deepEqual(sent.at(-1).usage,{inputTokens:42,outputTokens:110,reasoningTokens:75});
  assert(!JSON.stringify(sent).includes("HIDDEN_NOT_FORWARDABLE"));
});
test("web search needs explicit opt-in; reasoning none does not request summaries",()=>{
  const r=STREAM.buildRequest({model:"gpt-6.1-sol",key:"sk_TEST_SECRET_ONLY",
    prompt:"Hello",system:"",effort:"none",webSearch:true});
  const b=JSON.parse(r.options.body);
  assert.deepEqual(b.tools,[{type:"web_search"}]);
  assert.equal(b.tool_choice,"auto");assert.equal(b.reasoning,undefined);
  assert.throws(()=>STREAM.optionsFrom({text:"Hi",effort:"super",webSearch:false}));
  assert.throws(()=>STREAM.optionsFrom({text:"Hi",webSearch:"true"}));
});
test("SSE decoder handles split UTF-8, CRLF, comments and [DONE]",async()=>{
  const text=": keepalive\r\n\r\n"+
    "data: {\"type\":\"response.created\"}\r\n\r\n"+
    "data: {\"type\":\"response.output_text.delta\",\"item_id\":\"m\",\"delta\":\"🪐\"}\n\n"+
    "data: {\"type\":\"response.completed\",\"response\":{\"usage\":{\"input_tokens\":4,\"output_tokens\":6}}}\n\n"+
    "data: [DONE]\n\n";
  const bytes=encode.encode(text),parts=[];
  for(const byte of bytes)parts.push(new Uint8Array([byte]));
  const response={status:200,ok:true,body:new ReadableStream({
    start(c){for(const part of parts)c.enqueue(part);c.close();}
  })};
  const events=[];await STREAM.consume(response,e=>events.push(e));
  assert.deepEqual(events.map(e=>e.type),[
    "response.created","response.output_text.delta","response.completed"
  ]);
  assert.equal(events[1].delta,"🪐");
});
test("incomplete SSE and malformed or excessive frames fail closed",async()=>{
  await assert.rejects(STREAM.consume(fakeResponse([
    "data: {\"type\":\"response.output_text.delta\",\"delta\":\"hello\"}\n\n",
    "data: [DONE]\n\n"
  ]),()=>{}),/without a terminal/);
  await assert.rejects(STREAM.consume(fakeResponse(["data: NOT_JSON\n\n"]),()=>{}),/malformed JSON/);
  await assert.rejects(STREAM.consume(fakeResponse(["data: "+("x".repeat(150000))]),()=>{}),/frame too large/);
});
test("only provider reasoning summaries appear; raw reasoning never forwarded",()=>{
  const sent=[],trace=STREAM.presenter(e=>sent.push(e));
  trace.handle({type:"response.reasoning_text.delta",delta:"RAW_PRIVATE"});
  trace.handle({type:"response.reasoning_summary_text.delta",item_id:"rs1",summary_index:0,delta:"**Plan** "});
  trace.handle({type:"response.reasoning_summary_text.delta",item_id:"rs1",summary_index:0,delta:"check"});
  trace.handle({type:"response.reasoning_summary_text.done",item_id:"rs1",summary_index:0,text:"**Plan** check"});
  trace.handle({type:"response.output_text.delta",item_id:"m1",content_index:0,delta:"Hello"});
  trace.handle({type:"response.output_text.done",item_id:"m1",content_index:0,text:"Hello!"});
  trace.handle({type:"response.completed",response:{usage:{input_tokens:3,output_tokens:9}}});
  assert(!JSON.stringify(sent).includes("RAW_PRIVATE"));
  assert.equal(sent.filter(e=>e.kind==="summary").length,3);
  assert.equal(sent.findLast(x=>x.kind==="answer").text,"Hello!");
  assert.deepEqual(sent.at(-1).usage,{inputTokens:3,outputTokens:9});
});
test("tool steps appear only from real tool events",()=>{
  const sent=[],trace=STREAM.presenter(x=>sent.push(x));
  trace.handle({type:"response.reasoning_summary_text.delta",item_id:"rs",summary_index:0,delta:"Working"});
  assert.equal(sent.filter(x=>x.kind==="tool").length,0);
  trace.handle({type:"response.output_item.added",item:{type:"web_search_call",id:"ws2"}});
  trace.handle({type:"response.web_search_call.searching",item_id:"ws2"});
  trace.handle({type:"response.web_search_call.completed",item_id:"ws2"});
  trace.handle({type:"response.output_item.done",item:{type:"web_search_call",id:"ws2"}});
  trace.handle({type:"response.completed",response:{}});
  assert.deepEqual(sent.filter(x=>x.kind==="tool").map(x=>x.state),
    ["active","active","done","done"]);
  assert(sent.filter(x=>x.kind==="tool").every(x=>x.toolType==="web_search_call"));
  assert(!sent.filter(x=>x.kind==="tool").some(x=>"iconUrl" in x),"Tool event must not pass arbitrary URLs");
  assert.equal(sent.at(-1).toolCount,1);
});
test("incomplete and failed are not successful; raw provider errors not surfaced",()=>{
  for(const kind of ["response.incomplete","response.failed","error"]){
    const sent=[];STREAM.presenter(x=>sent.push(x)).handle({
      type:kind,response:{error:{message:"SECRET"}},message:"SECRET"
    });
    assert.equal(sent.at(-1).status,kind==="response.incomplete"?"incomplete":"failed");
    assert(!JSON.stringify(sent).includes("SECRET"));
  }
});
test("permissions and session key are checked before any network access",async()=>{
  const t=fixture();let calls=0;
  t.fetchImpl=async()=>{calls++;throw Error("Unexpected request");};
  t.browserApi.permissions.contains=async()=>false;
  await assert.rejects(STREAM.run({...t,message:{text:"Hi",effort:"low",webSearch:false},emit:()=>{}}),/permission/);
  t.browserApi.permissions.contains=async()=>true;
  t.browserApi.storage.session.get=async()=>({});
  await assert.rejects(STREAM.run({...t,message:{text:"Hi",effort:"low",webSearch:false},emit:()=>{}}),/API key/);
  assert.equal(calls,0);
});
test("stream run emits summary, answer and terminal usage without keys",async()=>{
  const t=fixture(),sent=[];
  t.fetchImpl=async(url,opts)=>{
    assert.equal(opts.method,"POST");assert.equal(JSON.parse(opts.body).reasoning.summary,"auto");
    return fakeResponse([
      "data: {\"type\":\"response.created\"}\n\n",
      "data: {\"type\":\"response.reasoning_summary_text.delta\",\"item_id\":\"rs\",\"summary_index\":0,\"delta\":\"Checking\"}\n\n",
      "data: {\"type\":\"response.output_text.delta\",\"item_id\":\"m\",\"content_index\":0,\"delta\":\"Result\"}\n\n",
      "data: {\"type\":\"response.completed\",\"response\":{\"usage\":{\"input_tokens\":7,\"output_tokens\":11}}}\n\n"
    ]);
  };
  await STREAM.run({...t,message:{text:"Hello",effort:"medium",webSearch:false},emit:x=>sent.push(x)});
  assert.equal(sent.at(-1).status,"completed");
  assert(sent.some(x=>x.kind==="summary"));assert(sent.some(x=>x.kind==="answer"));
  assert(!JSON.stringify(sent).includes("sk_TEST_SECRET_ONLY"));
});
test("API errors are sanitized and do not parse private response bodies",async()=>{
  const t=fixture();
  t.fetchImpl=async()=>({ok:false,status:429,json:async()=>{throw Error("SECRET");}});
  await assert.rejects(STREAM.run({...t,message:{text:"Hi",effort:"low",webSearch:false},
    emit:()=>{}}),/rate or credit limit/);
});
