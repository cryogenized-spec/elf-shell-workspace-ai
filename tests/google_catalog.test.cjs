"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const OAUTH=require("../google/oauth.js");
require("../google/read.js");
const CATALOG=require("../google/catalog.js");
const now=Date.parse("2026-11-08T11:00:00Z");
const TOKEN="TEST_GOOGLE_ACCESS_TOKEN_KEEP_PRIVATE";
function token(scope){return{accessToken:TOKEN,expiresAt:now+3600000,scopes:[scope]};}
test("Drive and Gmail scopes are additive, distinct, restricted and never implied",()=>{
  assert(OAUTH.ALLOWED_SCOPES.includes(OAUTH.DRIVE_METADATA_READ));
  assert(OAUTH.ALLOWED_SCOPES.includes(OAUTH.GMAIL_METADATA_READ));
  assert.equal(OAUTH.scopes([OAUTH.CALENDAR_READ]).length,1);
  assert(!OAUTH.scopes([OAUTH.CALENDAR_READ]).includes(OAUTH.GMAIL_METADATA_READ));
  assert.throws(()=>OAUTH.scopes([OAUTH.CALENDAR_READ,"https://www.googleapis.com/auth/gmail.modify"]));
});
test("Drive metadata GET is bounded, read-only, on a fixed Google endpoint",async()=>{
  const calls=[];
  const result=await CATALOG.recentDrive(token(OAUTH.DRIVE_METADATA_READ),async(url,opts)=>{
    calls.push({url,opts});
    assert.equal(opts.method,"GET");
    assert.equal(opts.credentials,"omit");assert.equal(opts.redirect,"error");
    assert.equal(opts.body,undefined);
    assert(url.startsWith("https://www.googleapis.com/drive/v3/files?"));
    const p=new URL(url).searchParams;
    assert.equal(p.get("pageSize"),"20");
    assert.equal(p.get("q"),"trashed = false");
    assert.equal(p.get("orderBy"),"modifiedTime desc");
    assert.equal(p.get("fields"),"nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)");
    return {status:200,ok:true,json:async()=>({
      files:[{id:"doc123",name:"Monthly Register",mimeType:"application/vnd.google-apps.document",
        modifiedTime:"2026-11-07T10:00:00Z",
        webViewLink:"https://docs.google.com/document/d/doc123/edit",content:"SECRET_FILE_BODY"}],
      nextPageToken:"TOKEN_NOT_TO_EXPOSE"
    })};
  },now);
  assert.equal(calls.length,1);
  assert.equal(result.files.length,1);
  assert.equal(result.files[0].name,"Monthly Register");
  assert.equal(result.files[0].link,"https://docs.google.com/document/d/doc123/edit");
  assert.equal(result.limited,true);
  assert(!JSON.stringify(result).includes("SECRET_FILE_BODY"));
  assert(!JSON.stringify(result).includes(TOKEN));
  assert(!JSON.stringify(result).includes("TOKEN_NOT_TO_EXPOSE"));
});
test("metadata link sanitizer rejects foreign origins, credentials and JS",()=>{
  for(const url of ["javascript:alert(1)","https://evil.invalid/file",
    "https://docs.google.com.evil.invalid/document/x",
    "https://person:pass@drive.google.com/file",
    "http://drive.google.com/file","https://drive.google.com:8443/file"]){
    assert.equal(CATALOG.safeFileLink(url),null,url);
  }
  assert(CATALOG.safeFileLink("https://drive.google.com/file/d/abc"));
});
test("Gmail metadata uses INBOX label, not forbidden q search, and no bodies",async()=>{
  const calls=[];
  const data=await CATALOG.inboxGmail(token(OAUTH.GMAIL_METADATA_READ),async(url,opts)=>{
    calls.push({url,opts});assert.equal(opts.method,"GET");
    assert.equal(opts.body,undefined);assert.equal(opts.redirect,"error");
    assert.equal(new URL(url).hostname,"gmail.googleapis.com");
    if(url.includes("/messages?")){
      const p=new URL(url).searchParams;
      assert.equal(p.get("maxResults"),"8");
      assert.equal(p.get("labelIds"),"INBOX");
      assert.equal(p.has("q"),false,"gmail.metadata forbids the query parameter");
      return{status:200,ok:true,json:async()=>({messages:[
        {id:"abcd1234",threadId:"secret-thread"}],nextPageToken:"SECRET_PAGE_TOKEN"})};
    }
    const query=new URL(url).searchParams;
    assert.equal(query.get("format"),"metadata");
    assert.deepEqual(query.getAll("metadataHeaders"),["From","Subject","Date"]);
    return{status:200,ok:true,json:async()=>({
      id:"abcd1234",threadId:"secret-thread",labelIds:["INBOX","UNREAD"],
      payload:{headers:[
        {name:"From",value:"Customer <customer@example.com>"},
        {name:"Subject",value:"Invoice request"},
        {name:"Date",value:"Sun, 08 Nov 2026 12:30:00 +0200"}],
        body:{data:"SECRET_FULL_MESSAGE_BODY"}
      },snippet:"SECRET_PREVIEW_TEXT"
    })};
  },now);
  assert.equal(calls.length,2);
  assert.equal(data.messages.length,1);
  assert.equal(data.messages[0].unread,true);
  assert.equal(data.messages[0].subject,"Invoice request");
  assert.equal(data.limited,true);
  assert(!JSON.stringify(data).includes("SECRET_FULL_MESSAGE_BODY"));
  assert(!JSON.stringify(data).includes("SECRET_PREVIEW_TEXT"));
  assert(!JSON.stringify(data).includes("secret-thread"));
  assert(!JSON.stringify(data).includes(TOKEN));
});
test("missing or expired scope prevents any metadata network request",async()=>{
  let calls=0;
  const f=async()=>{calls++;throw Error("Unexpected network");};
  await assert.rejects(CATALOG.recentDrive(token(OAUTH.CALENDAR_READ),f,now),/scope/);
  await assert.rejects(CATALOG.inboxGmail(token(OAUTH.DRIVE_METADATA_READ),f,now),/scope/);
  const expired=token(OAUTH.GMAIL_METADATA_READ);expired.expiresAt=now;
  await assert.rejects(CATALOG.inboxGmail(expired,f,now),/expired/);
  assert.equal(calls,0);
});
test("provider HTTP errors are safe status categories without raw error bodies",async()=>{
  for(const status of [401,403,429,500]){
    const err=await CATALOG.recentDrive(token(OAUTH.DRIVE_METADATA_READ),async()=>({
      ok:false,status,json:async()=>({error:"SENSITIVE_EMAIL_OR_ACCESS_TOKEN"})
    }),now).then(()=>null,e=>e);
    assert(err&&err.message);
    assert(!err.message.includes("SENSITIVE"));
    assert(!err.message.includes(TOKEN));
    assert.match(err.message,new RegExp("HTTP "+status));
  }
});
test("Gmail maximum eight messages even with a larger backend response",async()=>{
  let reads=0;
  const result=await CATALOG.inboxGmail(token(OAUTH.GMAIL_METADATA_READ),async(url)=>{
    reads++;
    if(url.includes("/messages?"))
      return {ok:true,status:200,json:async()=>({
        messages:Array.from({length:50},(_,i)=>({id:"ab"+String(i).padStart(6,"0")}))
      })};
    return {ok:true,status:200,json:async()=>({payload:{headers:[]}})};
  },now);
  assert.equal(result.messages.length,8);
  assert.equal(reads,9);
});
