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
