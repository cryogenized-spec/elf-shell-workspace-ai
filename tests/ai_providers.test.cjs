"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const P=require("../ai/providers.js");
const MODELS={openai:"gpt-5.5",anthropic:"claude-sonnet-4-5",gemini:"gemini-3.8-flash"};
test("providers and model IDs are strictly validated",()=>{
  for(const provider of Object.keys(MODELS))assert(P.PROVIDERS[provider].host.startsWith("https://"));
  for(const bad of ["http://attacker.example","gemini/x","../model","",1,"x".repeat(91)])
    assert.throws(()=>P.modelId(bad));
  assert.throws(()=>P.providerName("other"));
  assert.throws(()=>P.keyText("a\rb"));
  assert.throws(()=>P.userText("x".repeat(6001)));
  assert.throws(()=>P.userText("   "));
});
test("OpenAI Responses request sends plain text and persona only, with no tools or Google data",()=>{
  const r=P.buildRequest("openai",MODELS.openai,"sk-TEST123456","Composed assistant","Summarize my plan");
  assert.equal(r.url,"https://api.openai.com/v1/responses");
  assert.equal(r.options.method,"POST");
  assert.equal(r.options.credentials,"omit");
  assert.equal(r.options.redirect,"error");
  const body=JSON.parse(r.options.body);
  assert.equal(body.model,MODELS.openai);assert.equal(body.input,"Summarize my plan");
  assert.equal(body.store,false);assert.equal(body.instructions,"Composed assistant");
  assert.equal(body.tools,undefined);
  assert(!r.url.includes("sk-TEST"));
});
test("Anthropic Messages request uses explicit text input and no tool grants",()=>{
  const r=P.buildRequest("anthropic",MODELS.anthropic,"sk-ant-TEST123456","Precise","Hello");
  assert.equal(r.url,"https://api.anthropic.com/v1/messages");
  assert.equal(r.options.headers["x-api-key"],"sk-ant-TEST123456");
  assert(r.options.headers["anthropic-version"]);
  const body=JSON.parse(r.options.body);
  assert.equal(body.messages[0].content,"Hello");
  assert.equal(body.system,"Precise");assert.equal(body.tools,undefined);
});
test("Gemini generateContent model path is validated and provider key uses header",()=>{
  const r=P.buildRequest("gemini",MODELS.gemini,"AIzTEST123456","Calm and technical","Hello");
  assert(r.url.includes("/models/gemini-3.8-flash:generateContent"));
  assert.equal(r.options.headers["x-goog-api-key"],"AIzTEST123456");
  const body=JSON.parse(r.options.body);
  assert.equal(body.contents[0].parts[0].text,"Hello");
  assert.equal(body.systemInstruction.parts[0].text,"Calm and technical");
});
test("all providers parse text-only responses without trusting raw HTML",async()=>{
  const fake={
    openai:{output:[{content:[{type:"output_text",text:"Hello from OpenAI"}]}]},
    anthropic:{content:[{type:"text",text:"Hello from Claude"}]},
    gemini:{candidates:[{content:{parts:[{text:"Hello from Gemini"}]}}]}
  };
  for(const provider of Object.keys(fake)){
    const r=await P.infer({provider,model:MODELS[provider],key:"TESTKEY123456",system:"Helpful",
      prompt:"Hello",fetchImpl:async()=>({ok:true,status:200,json:async()=>fake[provider]})});
    assert.match(r.text,/Hello from/);
  }
});
test("provider errors hide response bodies that could echo prompts or credentials",async()=>{
  const r=()=>P.infer({provider:"openai",model:MODELS.openai,key:"TESTKEY123456",system:"Helpful",
    prompt:"Sensitive prompt",fetchImpl:async()=>({
      ok:false,status:401,json:async()=>{throw Error("Contains secret");}
    })});
  await assert.rejects(r(),/authentication or model access/);
});
test("provider output preview is capped and does not execute HTML",()=>{
  const r=P.extract("openai",{output_text:"<script>alert(1)</script>"+"Z".repeat(15000)});
  assert.equal(r.text.length,12000);assert.equal(r.truncated,true);
  assert(r.text.startsWith("<script>"));
  // Consumer renders this only with textContent; no DOM parsing.
});

test("BYOK provider success body is bounded before parsing",async()=>{
  const big=JSON.stringify({output_text:"x".repeat(300_000)});
  const response=new Response(big,{status:200,headers:{"Content-Type":"application/json"}});
  await assert.rejects(P.infer({provider:"openai",model:MODELS.openai,key:"TESTKEY123456",
    system:"",prompt:"Hello",fetchImpl:async()=>response}),/safety limit/);
});
test("BYOK response parser rejects invalid or secret-bearing provider JSON safely",async()=>{
  await assert.rejects(P.infer({provider:"openai",model:MODELS.openai,key:"TESTKEY123456",
    system:"",prompt:"Hello",fetchImpl:async()=>new Response("BAD_PROMPT_SECRET",{status:200})}),
  err=>err.message==="AI provider returned invalid JSON" && !err.message.includes("BAD_PROMPT_SECRET"));
  await assert.rejects(P.infer({provider:"openai",model:MODELS.openai,key:"TESTKEY123456",
    system:"",prompt:"Hello",fetchImpl:async()=>{throw Error("PRIVATE_KEY_SHOULD_NOT_LEAK")}}),
  err=>err.message==="AI provider request could not be completed");
});
test("non-stream BYOK honors cancellation before network and during fetch",async()=>{
  const ctrl=new AbortController(),options={provider:"gemini",model:MODELS.gemini,
    key:"TESTKEY123456",system:"",prompt:"Hi"};
  ctrl.abort();
  let called=0;
  await assert.rejects(P.infer({...options,signal:ctrl.signal,
    fetchImpl:async()=>{called++;throw Error("Forbidden")}}),/cancelled/);
  assert.equal(called,0);
  const running=new AbortController();
  const job=P.infer({...options,signal:running.signal,fetchImpl:async(_url,init)=>{
    assert.equal(init.redirect,"error");
    assert.equal(init.credentials,"omit");
    return await new Promise((_resolve,reject)=>{
      init.signal.addEventListener("abort",()=>reject(Error("Synthetic provider cancelled")),{once:true});
    });
  }});
  running.abort();
  await assert.rejects(job,/AI request cancelled/);
});
test("BYOK successful response has 30s abort bound, no remote tools or Google tokens",async()=>{
  let saved;
  const value=await P.infer({provider:"anthropic",model:MODELS.anthropic,
    key:"TESTKEY123456",system:"Friendly",prompt:"Hello",
    fetchImpl:async(_url,options)=>{
      saved=options;
      return new Response(JSON.stringify({content:[{type:"text",text:"Hello"}]}),{status:200});
    }});
  assert.equal(value.text,"Hello");
  assert(saved.signal instanceof AbortSignal);
  assert.equal(P.REQUEST_TIMEOUT_MS,30_000);
  assert.equal(P.MAX_PROVIDER_JSON_BYTES,262_144);
  assert(!saved.body.includes("tools"));
});
