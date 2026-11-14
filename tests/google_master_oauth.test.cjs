"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const cryptoApi=require("node:crypto").webcrypto;
require("../google/master-read-client.js");
const OAuth=require("../google/master-oauth.js");
const TOKEN="FAKE_MCP_READ_ONLY_SESSION_TOKEN_0123456789";
const CLIENT="client_test_firefox_pkce_123456789";
const REDIRECT="https://devredirect.extensions.allizom.org/";
function fixture(options={}){
  const session={},local={};
  const requests=[],authUrls=[];
  let permitted=options.permitted!==false;
  const browser={
    storage:{
      local:{
        get:async key=>({[key]:local[key]}),
        set:async value=>Object.assign(local,value)
      },
      session:{
        get:async key=>Array.isArray(key)
          ?Object.fromEntries(key.map(k=>[k,session[k]]))
          :{[key]:session[key]},
        set:async value=>Object.assign(session,value),
        remove:async keys=>{
          for(const key of Array.isArray(keys)?keys:[keys])delete session[key];
        }
      }
    },
    permissions:{contains:async({origins,data_collection})=>{
      assert.deepEqual(origins,[...OAuth.HOSTS]);
      assert.deepEqual(data_collection,[...OAuth.DATA_TYPES]);
      return permitted;
    }},
    identity:{
      getRedirectURL:()=>options.redirect||REDIRECT,
      launchWebAuthFlow:async({url,interactive})=>{
        assert.equal(interactive,true);
        authUrls.push(url);
        if(options.cancelAuth)throw Error("BROWSER_SECRET_AUTH_FAILURE_TEXT");
        const state=new URL(url).searchParams.get("state");
        return REDIRECT+"?state="+(options.wrongState?"WRONG":state)+"&code=FAKE_AUTH_CODE"+
          (options.omitIssuer?"":(options.issuerSupported||options.invalidIssuer
            ?"&iss="+encodeURIComponent(options.invalidIssuer?"https://attacker.invalid":OAuth.AUTH):""));
      }
    }
  };
  const fetchImpl=async(url,init)=>{
    requests.push({url,init});
    assert.equal(init.credentials,"omit");
    assert.equal(init.redirect,"error");
    assert.equal(init.cache,"no-store");
    assert.equal(init.referrerPolicy,"no-referrer");
    assert(init.signal instanceof AbortSignal);
    if(url===OAuth.METADATA)return Response.json({
      issuer:OAuth.AUTH,
      authorization_endpoint:OAuth.AUTHORIZE,
      token_endpoint:OAuth.EXCHANGE,
      registration_endpoint:OAuth.REGISTER,
      code_challenge_methods_supported:["S256"],
      authorization_response_iss_parameter_supported:options.issuerSupported===true
    });
    if(url===OAuth.REGISTER){
      const request=JSON.parse(init.body);
      assert.deepEqual(request.redirect_uris,[options.redirect||REDIRECT]);
      assert.equal(request.token_endpoint_auth_method,"none");
      assert.deepEqual(request.grant_types,["authorization_code"]);
      assert.equal(request.client_secret,undefined);
      assert.equal(init.headers["Content-Type"],"application/json");
      if(options.badRegistration)return Response.json({...{
        client_id:CLIENT,token_endpoint_auth_method:"none",
        redirect_uris:[REDIRECT],grant_types:["authorization_code"],
        response_types:["code"]
      },client_secret:"FORBIDDEN"});
      return Response.json({
        client_id:CLIENT,token_endpoint_auth_method:"none",
        redirect_uris:[options.redirect||REDIRECT],grant_types:["authorization_code"],
        response_types:["code"]
      });
    }
    if(url===OAuth.EXCHANGE){
      const form=new URLSearchParams(init.body);
      assert.equal(form.get("client_id"),CLIENT);
      assert.equal(form.get("redirect_uri"),REDIRECT);
      assert.equal(form.get("resource"),OAuth.RESOURCE);
      assert.equal(form.get("grant_type"),"authorization_code");
      assert.equal(form.get("code"),"FAKE_AUTH_CODE");
      assert.match(form.get("code_verifier"),/^[0-9a-f]{64}$/);
      assert.equal(form.get("client_secret"),null);
      return Response.json({
        access_token:TOKEN,token_type:"Bearer",expires_in:3600,
        scope:options.escalatedScope?"mcp:read mcp:write":"mcp:read",
        ...(options.refreshToken?{refresh_token:"FORBIDDEN_REFRESH"}:{})
      });
    }
    if(url===OAuth.REVOKE){
      const form=new URLSearchParams(init.body);
      assert.equal(form.get("token"),TOKEN);
      assert.equal(form.get("token_type_hint"),"access_token");
      assert.equal(form.get("client_id"),CLIENT);
      return new Response(null,{status:200});
    }
    throw Error("UNEXPECTED_REMOTE_ORIGIN");
  };
  return {browser,fetchImpl,session,local,requests,authUrls,
    permission:next=>{permitted=next;}};
}
test("MCP OAuth is inert until explicit connect; no local persistence or Google token reused",async()=>{
  const x=fixture();
  const before=await OAuth.status(x.browser);
  assert.equal(before.connected,false);
  assert.equal(before.permissionsGranted,true);
  assert.equal(x.requests.length,0);
  assert.deepEqual(x.session,{});
  assert.deepEqual(x.local,{});
  await assert.rejects(OAuth.accessToken(x.browser),/MASTER_NOT_CONNECTED/);
  assert.equal(x.requests.length,0);
});
test("explicit Firefox OAuth DCR + PKCE obtains read-only MCP bearer in session ONLY",async()=>{
  const x=fixture();
  const result=await OAuth.connect(x.browser,x.fetchImpl,cryptoApi);
  assert.equal(result.connected,true);
  assert.deepEqual(result.scope,["mcp:read"]);
  assert.equal(result.readOnly,true);
  assert(result.expiresAt>Date.now());
  assert.deepEqual(x.requests.map(r=>r.url),
    [OAuth.METADATA,OAuth.REGISTER,OAuth.EXCHANGE]);
  const authorize=new URL(x.authUrls[0]);
  assert.equal(authorize.origin,OAuth.AUTH);
  assert.equal(authorize.pathname,"/authorize");
  assert.equal(authorize.searchParams.get("response_type"),"code");
  assert.equal(authorize.searchParams.get("resource"),OAuth.RESOURCE);
  assert.equal(authorize.searchParams.get("scope"),"mcp:read");
  assert.equal(authorize.searchParams.get("client_id"),CLIENT);
  assert.equal(authorize.searchParams.get("redirect_uri"),REDIRECT);
  assert.equal(authorize.searchParams.get("code_challenge_method"),"S256");
  assert.match(authorize.searchParams.get("code_challenge"),/^[A-Za-z0-9_-]{43}$/);
  assert.match(authorize.searchParams.get("state"),/^[0-9a-f]{48}$/);
  assert.equal(x.session[OAuth.PENDING],undefined);
  assert.equal(x.session[OAuth.TOKEN].accessToken,TOKEN);
  assert.deepEqual(x.local,{});
  assert.equal(await OAuth.accessToken(x.browser),TOKEN);
});
test("missing Firefox host/data consent prevents OAuth before metadata fetch",async()=>{
  const x=fixture({permitted:false});
  await assert.rejects(OAuth.connect(x.browser,x.fetchImpl,cryptoApi),
    /MASTER_FIREFOX_PERMISSION_REQUIRED/);
  assert.equal(x.requests.length,0);
  assert.equal(x.authUrls.length,0);
});
test("Firefox identity must be present; no arbitrary redirect scheme or host",async()=>{
  const x=fixture({redirect:"https://attacker.invalid/"});
  await assert.rejects(OAuth.connect(x.browser,x.fetchImpl,cryptoApi),
    /INVALID_FIREFOX_REDIRECT/);
  assert.equal(x.requests.length,0);
  const y=fixture();
  delete y.browser.identity.launchWebAuthFlow;
  await assert.rejects(OAuth.connect(y.browser,y.fetchImpl,cryptoApi),
    /FIREFOX_IDENTITY_PERMISSION_REQUIRED/);
  assert.equal(y.requests.length,0);
});
test("registered public OAuth client cannot carry a secret",async()=>{
  const x=fixture({badRegistration:true});
  await assert.rejects(OAuth.connect(x.browser,x.fetchImpl,cryptoApi),
    /OAUTH_PUBLIC_CLIENT_REGISTRATION_INVALID/);
  assert.deepEqual(x.requests.map(r=>r.url),[OAuth.METADATA,OAuth.REGISTER]);
  assert.equal(x.session[OAuth.TOKEN],undefined);
});
test("tampered OAuth callback state never reaches token endpoint; pending wiped",async()=>{
  const x=fixture({wrongState:true});
  await assert.rejects(OAuth.connect(x.browser,x.fetchImpl,cryptoApi),
    /OAUTH_CALLBACK_INVALID/);
  assert(!x.requests.some(r=>r.url===OAuth.EXCHANGE));
  assert.equal(x.session[OAuth.PENDING],undefined);
  assert.equal(x.session[OAuth.TOKEN],undefined);
});
test("cancelled Firefox authorization never leaks raw callback exceptions",async()=>{
  const x=fixture({cancelAuth:true});
  await assert.rejects(OAuth.connect(x.browser,x.fetchImpl,cryptoApi),
    e=>e.message==="OAUTH_CONNECTION_UNAVAILABLE" &&
       !e.message.includes("BROWSER_SECRET"));
  assert.equal(x.session[OAuth.PENDING],undefined);
  assert(!x.requests.some(r=>r.url===OAuth.EXCHANGE));
});
test("MCP OAuth rejects extra write scopes and any refresh token",async()=>{
  for(const opts of [{escalatedScope:true},{refreshToken:true}]){
    const x=fixture(opts);
    await assert.rejects(OAuth.connect(x.browser,x.fetchImpl,cryptoApi),
      /OAUTH_SCOPE_ESCALATION/);
    assert.equal(x.session[OAuth.TOKEN],undefined);
    assert.equal(x.session[OAuth.PENDING],undefined);
  }
});
test("expired access tokens and Firefox permission revocation wipe local session",async()=>{
  const x=fixture();await OAuth.connect(x.browser,x.fetchImpl,cryptoApi);
  const farFuture=Date.now()+86400*1000;
  await assert.rejects(OAuth.accessToken(x.browser,farFuture),/MASTER_NOT_CONNECTED/);
  assert.equal(x.session[OAuth.TOKEN],undefined);
  await OAuth.connect(x.browser,x.fetchImpl,cryptoApi);
  x.permission(false);
  await OAuth.clearOnPermissionChange(x.browser);
  assert.equal(x.session[OAuth.TOKEN],undefined);
  assert.equal((await OAuth.status(x.browser)).connected,false);
  await assert.rejects(OAuth.accessToken(x.browser),/MASTER_FIREFOX_PERMISSION_REQUIRED/);
});
test("disconnect forgets local credentials and requests best-effort remote revocation",async()=>{
  const x=fixture();await OAuth.connect(x.browser,x.fetchImpl,cryptoApi);
  const result=await OAuth.disconnect(x.browser,x.fetchImpl);
  assert.deepEqual(result,{connected:false,localSessionCleared:true,remotelyRevoked:true});
  assert.equal(x.session[OAuth.TOKEN],undefined);
  assert.equal(x.session[OAuth.PENDING],undefined);
  assert.equal(x.requests.at(-1).url,OAuth.REVOKE);
  assert.equal((await OAuth.status(x.browser)).connected,false);
});
test("disconnect while host permission revoked is still locally successful and no remote request",async()=>{
  const x=fixture();await OAuth.connect(x.browser,x.fetchImpl,cryptoApi);
  const before=x.requests.length;x.permission(false);
  const result=await OAuth.disconnect(x.browser,x.fetchImpl);
  assert.equal(result.localSessionCleared,true);
  assert.equal(result.remotelyRevoked,false);
  assert.equal(x.session[OAuth.TOKEN],undefined);
  assert.equal(x.requests.length,before);
});
test("validation only accepts strict redirect and token response",()=>{
  assert.throws(()=>OAuth.callbackCode(REDIRECT+"?state=x&code=c",REDIRECT,"y"),
    /OAUTH_CALLBACK_INVALID/);
  assert.throws(()=>OAuth.callbackCode(REDIRECT+"?state=x&code=c&code=d",REDIRECT,"x"),
    /OAUTH_CALLBACK_INVALID/);
  assert.throws(()=>OAuth.callbackCode("https://wrong.extensions.allizom.org/?state=x&code=c",REDIRECT,"x"),
    /OAUTH_CALLBACK_INVALID/);
  assert.throws(()=>OAuth.tokenResult({access_token:TOKEN,token_type:"Bearer",expires_in:3600,scope:"mcp:write"},CLIENT,Date.now()),
    /OAUTH_SCOPE_ESCALATION/);
});

test("OAuth RFC 9207 issuer identification matches metadata exactly when advertised",async()=>{
  const good=fixture({issuerSupported:true});
  assert.equal((await OAuth.connect(good.browser,good.fetchImpl,cryptoApi)).connected,true);
  const forged=fixture({issuerSupported:true,invalidIssuer:true});
  await assert.rejects(OAuth.connect(forged.browser,forged.fetchImpl,cryptoApi),
    /OAUTH_ISSUER_INVALID/);
  assert(!forged.requests.some(x=>x.url===OAuth.EXCHANGE));
  const missing=fixture({issuerSupported:true,omitIssuer:true});
  await assert.rejects(OAuth.connect(missing.browser,missing.fetchImpl,cryptoApi),
    /OAUTH_ISSUER_INVALID/);
  assert(!missing.requests.some(x=>x.url===OAuth.EXCHANGE));
});
