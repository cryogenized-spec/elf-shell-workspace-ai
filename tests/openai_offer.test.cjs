"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const C=require("../ai/openai-complimentary.js");
const STANDARD=["gpt-5.4","gpt-5.2","gpt-5.1","gpt-5","gpt-4.1","gpt-4o","o1","o3"];
const SMALL=["gpt-5.4-mini","gpt-5.4-nano","gpt-5-mini","gpt-5-nano",
  "gpt-4.1-mini","gpt-4.1-nano","gpt-4o-mini","o3-mini","o4-mini"];
function api(){
  const local={};
  return {local,browserApi:{storage:{local:{
    get:async key=>({[key]:local[key]}),
    set:async updates=>Object.assign(local,updates)
  }}}};
}
test("catalog reproduces every model in the supplied 250k/2.5m screenshot",()=>{
  assert.deepEqual(C.GROUPS.standard.map(x=>x.id),STANDARD);
  assert.deepEqual(C.GROUPS.small.map(x=>x.id),SMALL);
  assert.deepEqual(C.LIMITS,{standard:250000,small:2500000});
  assert.equal(C.lookup("gpt-5.4").group,"standard");
  assert.equal(C.lookup("gpt-5.4-mini").group,"small");
  assert.equal(C.lookup("gpt-6-luna").group,"other");
  assert.equal(C.lookup("other-custom-model"),null);
  assert.equal(C.lookup("gpt-4o").nonReasoning,true);
  assert.equal(C.lookup("o3-mini").status,"shut-down");
  assert.equal(C.lookup("o4-mini").status,"shut-down");
});
test("never represents a screenshot's eligibility as confirmed enrollment",async()=>{
  const {browserApi}=api();
  const state=await C.status(browserApi,Date.UTC(2026,10,8,1,10));
  assert.equal(state.enrollmentSelfReported,false);
  assert.equal(state.verifiedByOpenAI,false);
  assert.equal(state.remainingIsAuthoritative,false);
  assert.match(state.note,/Not a billing guarantee/);
  assert.match(state.note,/Tool calls and overruns can be billed/);
  assert.deepEqual(state.observedTokens,{standard:0,small:0});
});
test("enrollment is user attestation, not an organization settings modification",async()=>{
  const {browserApi,local}=api();
  const now=Date.UTC(2026,10,8,12,0);
  const state=await C.setEnrollment(browserApi,true,now);
  assert.equal(state.enrollmentSelfReported,true);
  assert.equal(state.verifiedByOpenAI,false);
  assert.deepEqual(Object.keys(local),[C.KEY]);
  assert.deepEqual(Object.keys(local[C.KEY]).sort(),["enrolled","usage"]);
  assert.equal((await C.setEnrollment(browserApi,false,now)).enrollmentSelfReported,false);
  await assert.rejects(C.setEnrollment(browserApi,"true",now));
});
test("local token accounting sums only verified provider usage in the correct group",async()=>{
  const {browserApi,local}=api();
  const now=Date.UTC(2026,10,8,11,0);
  await C.record(browserApi,"gpt-5.4",{inputTokens:7,outputTokens:13},now);
  await C.record(browserApi,"gpt-5.2",{inputTokens:2,outputTokens:4},now);
  await C.record(browserApi,"gpt-5.4-mini",{inputTokens:5,outputTokens:6},now);
  await C.record(browserApi,"gpt-6-luna",{inputTokens:100,outputTokens:200},now);
  await C.record(browserApi,"gpt-5.4-mini",{inputTokens:null,outputTokens:2},now);
  await C.record(browserApi,"gpt-5.4",{inputTokens:-1,outputTokens:3},now);
  const status=await C.status(browserApi,now);
  assert.deepEqual(status.observedTokens,{standard:26,small:11});
  assert.equal(Object.keys(local).length,1);
  assert(!JSON.stringify(local).includes("prompt"));
});
test("daily counters reset at exact 00:00 UTC; cross-project traffic is not inferred",async()=>{
  const {browserApi}=api();
  const evening=Date.UTC(2026,10,8,23,59,59);
  await C.record(browserApi,"gpt-5.4-mini",{inputTokens:24,outputTokens:16},evening);
  assert.equal((await C.status(browserApi,evening)).observedTokens.small,40);
  const morning=Date.UTC(2026,10,9,0,0,0);
  assert.equal((await C.status(browserApi,morning)).observedTokens.small,0);
  assert.equal((await C.status(browserApi,morning)).date,"2026-11-09");
  await C.record(browserApi,"gpt-5.4",{inputTokens:1,outputTokens:1},morning);
  assert.deepEqual((await C.status(browserApi,morning)).observedTokens,{standard:2,small:0});
});
test("concurrent completions from two UI surfaces preserve local counts",async()=>{
  const {browserApi}=api(),now=Date.UTC(2026,10,8,16,0);
  await Promise.all(Array.from({length:8},(_,i)=>C.record(browserApi,
    i%2===0?"gpt-5.4-mini":"gpt-5.4",
    {inputTokens:10,outputTokens:20},now)));
  assert.deepEqual((await C.status(browserApi,now)).observedTokens,
    {standard:120,small:120});
});
test("offer status commands never perform network access and reject nonboolean consent",async()=>{
  const {browserApi}=api();
  const s=await C.handle(browserApi,{type:"AI_OFFER_STATUS"});
  assert.equal(s.ok,true);
  assert.equal(s.offer.verifiedByOpenAI,false);
  assert.equal((await C.handle(browserApi,{type:"AI_OFFER_SET_ENROLLMENT",enrolled:true}))
    .offer.enrollmentSelfReported,true);
  await assert.rejects(C.handle(browserApi,{type:"AI_OFFER_SET_ENROLLMENT",enrolled:"yes"}));
  await assert.rejects(C.handle(browserApi,{type:"AI_DELETE_API_LOGS"}));
});
