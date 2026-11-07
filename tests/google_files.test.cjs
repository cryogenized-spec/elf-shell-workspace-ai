"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const F=require("../google/files.js");
const doc={name:"Service Notes",url:"https://docs.google.com/document/d/ABCDEfg12345678/edit",
  key:"file:document:ABCDEfg12345678"};
const sheet={name:"Workshop Stock Register",
  url:"https://docs.google.com/spreadsheets/d/ZYX9876543210/edit#gid=607118293",
  key:"file:spreadsheets:ZYX9876543210"};
const DOCS="https://www.googleapis.com/auth/documents.readonly";
const SHEETS="https://www.googleapis.com/auth/spreadsheets.readonly";
test("saved file parser requires exact Google Docs/Sheets identity",()=>{
  assert.deepEqual(F.validatedResource(doc),{kind:"docs",id:"ABCDEfg12345678",sheetId:null});
  assert.deepEqual(F.validatedResource(sheet),{kind:"sheets",id:"ZYX9876543210",sheetId:607118293});
  for(const value of [
    {...doc,url:"https://malicious.example/document/d/ABCDEfg12345678/edit"},
    {...doc,key:"file:document:DIFFERENT12345"},
    {key:"app:docs",url:"https://docs.google.com/document/u/0/"},
    {...sheet,url:"https://docs.google.com/spreadsheets/d/ZYX9876543210/edit#gid=bogus"}
  ]) assert.throws(()=>F.validatedResource(value));
});
test("bounded A1 ranges prevent unbounded or broad data reads",()=>{
  assert.equal(F.validatedRange("A1:Z50").rows,50);
  assert.equal(F.validatedRange("B4:Z103").rows,100);
  for(const range of ["A:A","1:100000","A1:ZZ99999","A1:Z101","A1:AA100","Z1:A20","A100:A1","A0:B5","Sheet1!A1:Z50","https://attacker.example"])
    assert.throws(()=>F.validatedRange(range));
});
test("Google Docs nested tab content and tables produce bounded plain-text preview",()=>{
  const value={tabs:[{documentTab:{body:{content:[
    {paragraph:{elements:[{textRun:{content:"Workshop service notes\n"}}]}},
    {table:{tableRows:[{tableCells:[{content:[
      {paragraph:{elements:[{textRun:{content:"Verified item\n"}}]}}
    ]}]}]}}
  ]}}}]};
  const got=F.collectText(value);
  assert(got.text.includes("Workshop service notes"));
  assert(got.text.includes("Verified item"));
  assert.equal(got.truncated,false);
  const huge=F.collectText({body:{content:[{paragraph:{elements:[{textRun:{content:"X".repeat(15000)}}]}}]}});
  assert.equal(huge.text.length,12000);
  assert.equal(huge.truncated,true);
});
test("Docs request is GET-only, no cookies, with a token requiring Docs scope",async()=>{
  const calls=[];const token={accessToken:"test_bearer_valid",scopes:[DOCS],expiresAt:Date.now()+600000};
  const fake=async(url,opts)=>{
    calls.push({url,opts});
    return {ok:true,status:200,json:async()=>({
      title:"Workbench","tabs":[{documentTab:{body:{content:[
        {paragraph:{elements:[{textRun:{content:"Inspection completed"}}]}}
      ]}}}]})};
  };
  const result=await F.readDoc(doc,token,fake);
  assert.equal(result.kind,"docs");assert.equal(result.title,"Workbench");
  assert.equal(result.text,"Inspection completed");
  assert.equal(calls.length,1);
  assert.equal(calls[0].opts.method,"GET");assert.equal(calls[0].opts.credentials,"omit");
  assert.equal(new URL(calls[0].url).hostname,"docs.googleapis.com");
  assert.equal(new URL(calls[0].url).searchParams.get("includeTabsContent"),"true");
  await assert.rejects(F.readDoc(doc,{...token,scopes:[SHEETS]},fake));
  assert.equal(calls.length,1);
});
test("Sheets metadata resolves saved gid, escapes quoted sheet title, and bounds values",async()=>{
  const calls=[];const token={accessToken:"test_bearer_valid",scopes:[SHEETS],expiresAt:Date.now()+600000};
  const fake=async(url,opts)=>{
    calls.push({url,opts});
    if(url.includes("/values/"))return {ok:true,status:200,json:async()=>({values:[["SKU","Qty"],["P-50","10"]]})};
    return {ok:true,status:200,json:async()=>({
      properties:{title:"Workshop Stock"},sheets:[{properties:{sheetId:0,title:"Overview"}},
      {properties:{sheetId:607118293,title:"Today's Stock"}}]})};
  };
  const result=await F.readSheet(sheet,"A1:B2",token,fake);
  assert.equal(result.kind,"sheets");assert.equal(result.sheet,"Today's Stock");
  assert.equal(result.title,"Workshop Stock");
  assert.deepEqual(result.rows,[["SKU","Qty"],["P-50","10"]]);
  assert.equal(calls.length,2);
  assert(calls.every(x=>x.opts.method==="GET" && x.opts.redirect==="error"));
  assert(calls[1].url.includes("Today"));
  assert(decodeURIComponent(new URL(calls[1].url).pathname).includes("'Today's Stock'")===false);
  assert(decodeURIComponent(new URL(calls[1].url).pathname).includes("Today''s Stock"));
});
test("oversized response is stopped before JSON parsing",async()=>{
  const token={accessToken:"test_bearer_valid",scopes:[DOCS],expiresAt:Date.now()+600000};
  await assert.rejects(F.readDoc(doc,token,async()=>({
    ok:true,status:200,headers:{get:()=>String(3*1024*1024)},
    json:async()=>{throw Error("must not parse oversized data");}
  })),/too large/);
});
