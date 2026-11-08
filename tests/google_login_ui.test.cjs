"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {launch,safeStartFailure}=require("../google/login-ui.js");

const VALID="https://accounts.google.com/o/oauth2/v2/auth"+
  "?client_id=1234-abcdef.apps.googleusercontent.com"+
  "&response_type=code&redirect_uri="+
  encodeURIComponent("http://127.0.0.1/mozoauth2/devredirect");

test("Firefox OAuth uses the proven two-field launch signature, synchronously",()=>{
  let calls=0;
  const browser={identity:{launchWebAuthFlow:options=>{
    calls++;
    assert.equal(options.interactive,true);
    assert.equal(options.url,VALID);
    assert.deepEqual(Object.keys(options).sort(),["interactive","url"]);
    assert.equal(Object.hasOwn(options,"redirect_uri"),false);
    return Promise.resolve("callback");}
  }};
  const start=launch(browser,VALID);
  assert.equal(calls,1,"Must start in same click without awaiting preparatory work");
  return assert.doesNotReject(start);
});
test("invalid authorization URLs and missing browser APIs produce classified safe codes",()=>{
  for(const invalid of [
    "https://evil.example/auth?response_type=code&redirect_uri=BAD",
    "https://accounts.google.com/other?response_type=code&redirect_uri=BAD",
    "https://accounts.google.com/o/oauth2/v2/auth?response_type=token",
    "not-a-url"
  ]){
    assert.throws(()=>launch({identity:{launchWebAuthFlow:()=>{throw Error("CALLED");}}},invalid),
      /oauth-auth-url-invalid/);
  }
  assert.throws(()=>launch({},VALID),/oauth-identity-api-unavailable/);
  assert.match(safeStartFailure(Error("oauth-identity-api-unavailable")),/AUTH_START_IDENTITY_UNAVAILABLE/);
  assert.match(safeStartFailure(Error("oauth-auth-url-invalid")),/AUTH_START_INVALID_REQUEST/);
});
test("unexpected Firefox launch errors never reflect callback URLs or authorization codes",()=>{
  const secret="AUTH_CODE_123456";
  let result;
  try{
    launch({identity:{launchWebAuthFlow:()=>{throw Error("Firefox code="+secret);}}},VALID);
  }catch(error){result=safeStartFailure(error);}
  assert.match(result,/AUTH_START_BROWSER_REJECTED/);
  assert(!result.includes(secret));
  assert(!result.includes("127.0.0.1"));
});
