/* Stage 6 Google Master OAuth: user-initiated, session-only, READ ONLY.
 * This is an MCP RESOURCE token. It never stores or accepts a Google access
 * or refresh token, client secret, copied ChatGPT token or write scope.
 * No network requests at module initialization / status / import.
 */
(function(root){
  "use strict";
  const AUTH="https://google-master-auth.cryogenized.workers.dev";
  const RESOURCE=root.WorkspaceGoogleMasterRead.RESOURCE;
  const HOSTS=Object.freeze([AUTH+"/*",new URL(RESOURCE).origin+"/*"]);
  const DATA_TYPES=Object.freeze([
    "authenticationInfo","personalCommunications",
    "websiteContent","personallyIdentifyingInfo"
  ]);
  const TOKEN="elfshell.master.oauthToken.v1";
  const PENDING="elfshell.master.oauthPending.v1";
  const MAX_JSON=16*1024, TIMEOUT_MS=12000, PENDING_MS=5*60*1000;
  const METADATA=AUTH+"/.well-known/oauth-authorization-server";
  const REGISTER=AUTH+"/oauth/register";
  const AUTHORIZE=AUTH+"/authorize";
  const EXCHANGE=AUTH+"/oauth/token";
  const REVOKE=AUTH+"/oauth/revoke";
  let connecting=false;
  function fail(code){const e=new Error(code);e.name="WorkspaceMasterOAuthError";return e;}
  function isObject(obj){return obj!==null&&typeof obj==="object"&&!Array.isArray(obj);}
  function approvedRedirect(browserApi){
    if(typeof browserApi.identity?.getRedirectURL!=="function" ||
       typeof browserApi.identity?.launchWebAuthFlow!=="function")
      throw fail("FIREFOX_IDENTITY_PERMISSION_REQUIRED");
    const redirect=browserApi.identity.getRedirectURL();
    let parsed;
    try{parsed=new URL(redirect);}catch{throw fail("INVALID_FIREFOX_REDIRECT");}
    if(parsed.protocol!=="https:" ||
       !/^[a-z0-9-]{3,120}\.extensions\.allizom\.org$/i.test(parsed.hostname) ||
       parsed.pathname!=="/" || parsed.search || parsed.hash ||
       parsed.port || parsed.username || parsed.password)
      throw fail("INVALID_FIREFOX_REDIRECT");
    return parsed.href;
  }
  async function permitted(browserApi){
    try{return await browserApi.permissions.contains({
      origins:[...HOSTS],data_collection:[...DATA_TYPES]
    })===true;}catch{return false;}
  }
  function hex(cryptoApi,len){
    const data=new Uint8Array(len);
    cryptoApi.getRandomValues(data);
    return Array.from(data,b=>b.toString(16).padStart(2,"0")).join("");
  }
  async function proof(cryptoApi,verifier){
    const bytes=await cryptoApi.subtle.digest("SHA-256",new TextEncoder().encode(verifier));
    return btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  }
  async function limitedJson(response){
    if(!response?.body?.getReader)throw fail("OAUTH_RESPONSE_INVALID");
    const claimed=response.headers?.get?.("Content-Length");
    if(claimed && (!/^[0-9]+$/.test(claimed)||Number(claimed)>MAX_JSON))
      throw fail("OAUTH_RESPONSE_TOO_LARGE");
    const reader=response.body.getReader(),chunks=[];
    let total=0;
    try{
      for(;;){
        const {done,value}=await reader.read();
        if(done)break;
        if(!(value instanceof Uint8Array))throw fail("OAUTH_RESPONSE_INVALID");
        total+=value.byteLength;
        if(total>MAX_JSON)throw fail("OAUTH_RESPONSE_TOO_LARGE");
        chunks.push(value);
      }
    }finally{try{await reader.cancel();}catch{} reader.releaseLock();}
    const raw=new Uint8Array(total);let offset=0;
    for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.byteLength;}
    try{
      const json=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(raw));
      if(!isObject(json))throw fail("OAUTH_RESPONSE_INVALID");
      return json;
    }catch{throw fail("OAUTH_RESPONSE_INVALID");}
  }
  async function request(fetchImpl,url,method,body,contentType){
    if(![METADATA,REGISTER,EXCHANGE,REVOKE].includes(url))
      throw fail("OAUTH_ENDPOINT_DENIED");
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
    const headers={Accept:"application/json"};
    if(contentType)headers["Content-Type"]=contentType;
    try{
      const reply=await fetchImpl(url,{
        method,headers,body,redirect:"error",cache:"no-store",
        credentials:"omit",referrerPolicy:"no-referrer",
        signal:controller.signal
      });
      if(!reply || !Number.isSafeInteger(reply.status))throw fail("OAUTH_RESPONSE_INVALID");
      if(reply.status===429)throw fail("OAUTH_RATE_LIMITED");
      if(!reply.ok)throw fail("OAUTH_ENDPOINT_REJECTED");
      if(url===REVOKE)return {};
      return await limitedJson(reply);
    }catch(error){
      if(controller.signal.aborted)throw fail("OAUTH_TIMEOUT");
      if(error?.name==="WorkspaceMasterOAuthError")throw error;
      throw fail("OAUTH_UNAVAILABLE");
    }finally{clearTimeout(timer);}
  }
  function checkMetadata(data){
    const issuer=typeof data.issuer==="string" ? data.issuer.replace(/\/$/,"") : "";
    if(issuer!==AUTH || data.authorization_endpoint!==AUTHORIZE ||
       data.token_endpoint!==EXCHANGE || data.registration_endpoint!==REGISTER ||
       !Array.isArray(data.code_challenge_methods_supported) ||
       !data.code_challenge_methods_supported.includes("S256"))
      throw fail("OAUTH_SERVER_METADATA_MISMATCH");
  }
  function checkRegistration(data,redirect){
    if(typeof data.client_id!=="string" ||
       data.client_id.length<8||data.client_id.length>512||
       /[^\x21-\x7e]/.test(data.client_id) ||
       data.token_endpoint_auth_method!=="none" ||
       Object.hasOwn(data,"client_secret") ||
       !Array.isArray(data.redirect_uris) ||
       !data.redirect_uris.includes(redirect) ||
       !Array.isArray(data.grant_types) || !data.grant_types.includes("authorization_code") ||
       !Array.isArray(data.response_types) || !data.response_types.includes("code"))
      throw fail("OAUTH_PUBLIC_CLIENT_REGISTRATION_INVALID");
    return data.client_id;
  }
  function authorizationUrl({clientId,redirect,state,challenge}){
    const url=new URL(AUTHORIZE);
    for(const [key,value] of Object.entries({
      response_type:"code",client_id:clientId,redirect_uri:redirect,
      scope:"mcp:read",resource:RESOURCE,state,
      code_challenge:challenge,code_challenge_method:"S256"
    }))url.searchParams.set(key,value);
    return url.href;
  }
  function callbackCode(callback,redirect,state,issuer=AUTH,requireIssuer=false){
    let actual,expected;
    try{actual=new URL(callback);expected=new URL(redirect);}
    catch{throw fail("OAUTH_CALLBACK_INVALID");}
    if(actual.origin!==expected.origin||actual.pathname!==expected.pathname ||
       actual.hash || actual.username || actual.password ||
       actual.searchParams.getAll("state").length!==1 ||
       actual.searchParams.get("state")!==state)
      throw fail("OAUTH_CALLBACK_INVALID");
    const ids=actual.searchParams.getAll("iss");
    if(ids.length>1 || (requireIssuer && ids.length!==1) ||
       (ids.length===1 && ids[0]!==issuer))
      throw fail("OAUTH_ISSUER_INVALID");
    if(actual.searchParams.has("error"))throw fail("OAUTH_USER_DECLINED");
    const codes=actual.searchParams.getAll("code");
    if(codes.length!==1||!codes[0]||codes[0].length>4096)
      throw fail("OAUTH_CALLBACK_INVALID");
    if([...actual.searchParams.keys()].some(key=>!["state","code","iss"].includes(key)))
      throw fail("OAUTH_CALLBACK_INVALID");
    return codes[0];
  }
  function tokenResult(raw,clientId,now){
    if(typeof raw.access_token!=="string"||raw.access_token.length<10 ||
       raw.access_token.length>8192 || /[^\x21-\x7e]/.test(raw.access_token) ||
       String(raw.token_type).toLowerCase()!=="bearer" ||
       !Number.isSafeInteger(raw.expires_in) ||
       raw.expires_in<60 || raw.expires_in>86400)
      throw fail("OAUTH_TOKEN_INVALID");
    const scope=typeof raw.scope==="string"?raw.scope.split(/\s+/).filter(Boolean):[];
    if(!scope.includes("mcp:read") ||
       scope.some(x=>x!=="mcp:read") ||
       Object.hasOwn(raw,"refresh_token"))
      throw fail("OAUTH_SCOPE_ESCALATION");
    return {accessToken:raw.access_token,clientId,scope:["mcp:read"],
      expiresAt:now+raw.expires_in*1000-30000};
  }
  async function current(browserApi,now=Date.now()){
    const raw=(await browserApi.storage.session.get(TOKEN))[TOKEN];
    if(!isObject(raw))return null;
    const good=typeof raw.accessToken==="string" &&
      raw.accessToken.length>=10&&raw.accessToken.length<=8192 &&
      Array.isArray(raw.scope)&&raw.scope.length===1&&raw.scope[0]==="mcp:read" &&
      typeof raw.clientId==="string" &&
      Number.isSafeInteger(raw.expiresAt)&&raw.expiresAt>now;
    if(!good){
      await browserApi.storage.session.remove(TOKEN);
      return null;
    }
    return raw;
  }
  async function status(browserApi,now=Date.now()){
    const permission=await permitted(browserApi);
    const token=permission?await current(browserApi,now):null;
    return {connected:!!token,permissionsGranted:permission,
      expiresAt:token?token.expiresAt:null,
      resource:RESOURCE,scope:token?["mcp:read"]:[],readOnly:true};
  }
  async function accessToken(browserApi,now=Date.now()){
    if(!await permitted(browserApi))throw fail("MASTER_FIREFOX_PERMISSION_REQUIRED");
    const token=await current(browserApi,now);
    if(!token)throw fail("MASTER_NOT_CONNECTED");
    return token.accessToken;
  }
  async function connect(browserApi,fetchImpl,cryptoApi,now=Date.now()){
    if(connecting)throw fail("OAUTH_ALREADY_IN_PROGRESS");
    connecting=true;
    try{
      if(!await permitted(browserApi))throw fail("MASTER_FIREFOX_PERMISSION_REQUIRED");
      const redirect=approvedRedirect(browserApi);
      await browserApi.storage.session.remove([TOKEN,PENDING]);
      const metadata=await request(fetchImpl,METADATA,"GET");
      checkMetadata(metadata);
      const registration=await request(fetchImpl,REGISTER,"POST",JSON.stringify({
        client_name:"ELF//SHELL Ayarime Firefox",
        redirect_uris:[redirect],
        token_endpoint_auth_method:"none",
        grant_types:["authorization_code"],
        response_types:["code"]
      }),"application/json");
      const clientId=checkRegistration(registration,redirect);
      const verifier=hex(cryptoApi,32),state=hex(cryptoApi,24);
      const challenge=await proof(cryptoApi,verifier);
      await browserApi.storage.session.set({[PENDING]:{
        clientId,redirect,state,verifier,createdAt:now,
        issuer:metadata.issuer,
        requireIssuer:metadata.authorization_response_iss_parameter_supported===true
      }});
      const authorized=await browserApi.identity.launchWebAuthFlow({
        url:authorizationUrl({clientId,redirect,state,challenge}),interactive:true
      });
      const saved=(await browserApi.storage.session.get(PENDING))[PENDING];
      if(!isObject(saved)||saved.state!==state||saved.clientId!==clientId||
         saved.redirect!==redirect||saved.verifier!==verifier ||
         saved.issuer!==metadata.issuer ||
         saved.requireIssuer!==(metadata.authorization_response_iss_parameter_supported===true) ||
         !Number.isSafeInteger(saved.createdAt) ||
         Date.now()-saved.createdAt<0 ||
         Date.now()-saved.createdAt>=PENDING_MS)
        throw fail("OAUTH_TRANSACTION_EXPIRED");
      const code=callbackCode(authorized,redirect,state,
        metadata.issuer,metadata.authorization_response_iss_parameter_supported===true);
      await browserApi.storage.session.remove(PENDING); // single use
      if(!await permitted(browserApi))throw fail("MASTER_FIREFOX_PERMISSION_REQUIRED");
      const form=new URLSearchParams({
        grant_type:"authorization_code",code,client_id:clientId,
        redirect_uri:redirect,code_verifier:verifier,resource:RESOURCE
      });
      const answer=await request(fetchImpl,EXCHANGE,"POST",form.toString(),
        "application/x-www-form-urlencoded");
      const token=tokenResult(answer,clientId,Date.now());
      await browserApi.storage.session.set({[TOKEN]:token});
      return status(browserApi);
    }catch(error){
      if(error?.name==="WorkspaceMasterOAuthError")throw error;
      throw fail("OAUTH_CONNECTION_UNAVAILABLE");
    }finally{
      // Auth callback codes, verifiers and state must not survive completion,
      // cancellation or errors; no refresh token is ever saved.
      await browserApi.storage.session.remove(PENDING);
      connecting=false;
    }
  }
  async function disconnect(browserApi,fetchImpl){
    const value=(await browserApi.storage.session.get(TOKEN))[TOKEN];
    await browserApi.storage.session.remove([TOKEN,PENDING]);
    let remotelyRevoked=false;
    if(isObject(value)&&typeof value.accessToken==="string" &&
       await permitted(browserApi)){
      try{
        const form=new URLSearchParams({token:value.accessToken,
          token_type_hint:"access_token",client_id:value.clientId});
        await request(fetchImpl,REVOKE,"POST",form.toString(),
          "application/x-www-form-urlencoded");
        remotelyRevoked=true;
      }catch{/* Local disconnect still succeeds; report remote revocation outcome. */}
    }
    return {connected:false,localSessionCleared:true,remotelyRevoked};
  }
  async function clearOnPermissionChange(browserApi){
    if(!await permitted(browserApi))
      await browserApi.storage.session.remove([TOKEN,PENDING]);
  }
  const api=Object.freeze({AUTH,RESOURCE,HOSTS,DATA_TYPES,TOKEN,PENDING,
    METADATA,REGISTER,AUTHORIZE,EXCHANGE,REVOKE,
    status,connect,disconnect,accessToken,clearOnPermissionChange,
    callbackCode,tokenResult,authorizationUrl,checkMetadata,checkRegistration});
  root.WorkspaceMasterOAuth=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(globalThis);
