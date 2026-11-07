/* Explicit opt-in Google OAuth and read-only account session. No refresh tokens persisted. */
(function(root){
  "use strict";
  const OAUTH=root.WorkspaceGoogleOAuth, READ=root.WorkspaceGoogleRead;
  const CONFIG_KEY="elfshell.google.oauthConfig.v1";
  const PENDING_KEY="elfshell.google.pending.v1";
  const TOKEN_KEY="elfshell.google.sessionToken.v1";
  const DATA_TYPES=Object.freeze(["authenticationInfo","websiteContent"]);
  const HOSTS=Object.freeze([
    "https://oauth2.googleapis.com/*",
    "https://www.googleapis.com/*",
    "https://tasks.googleapis.com/*",
    "https://docs.googleapis.com/*",
    "https://sheets.googleapis.com/*"
  ]);
  function requiredHosts(scopes) {
    const requested=OAUTH.scopes(scopes);
    const result=[HOSTS[0]];
    if(requested.includes(OAUTH.CALENDAR_READ))result.push(HOSTS[1]);
    if(requested.includes(OAUTH.TASKS_READ))result.push(HOSTS[2]);
    if(requested.includes(OAUTH.DOCS_READ))result.push(HOSTS[3]);
    if(requested.includes(OAUTH.SHEETS_READ))result.push(HOSTS[4]);
    return result;
  }
  const configDefault=()=>({clientId:"",scopes:[OAUTH.CALENDAR_READ]});
  async function config(browserApi) {
    const raw=(await browserApi.storage.local.get(CONFIG_KEY))[CONFIG_KEY];
    if(!raw || !raw.clientId) return configDefault();
    try{return {clientId:OAUTH.clientId(raw.clientId),scopes:OAUTH.scopes(raw.scopes)};}
    catch{return configDefault();}
  }
  async function permitted(browserApi,requested) {
    const selected=requested || (await config(browserApi)).scopes;
    return Boolean(await browserApi.permissions.contains({origins:requiredHosts(selected),data_collection:[...DATA_TYPES]}));
  }
  function safePending(value,now) {
    return value && typeof value==="object" &&
      Number.isFinite(value.createdAt) && now>=value.createdAt &&
      now-value.createdAt<300000 && typeof value.url==="string" &&
      value.url.startsWith(OAUTH.AUTH_ORIGIN+"/o/oauth2/v2/auth?") ? value : null;
  }
  async function status(browserApi,now=Date.now()) {
    const cfg=await config(browserApi);
    const data=await browserApi.storage.session.get([PENDING_KEY,TOKEN_KEY]);
    const token=data[TOKEN_KEY];
    const valid=token && Number.isFinite(token.expiresAt) && token.expiresAt>now;
    const pending=safePending(data[PENDING_KEY],now);
    return {
      config:cfg,
      permissionsGranted:await permitted(browserApi),
      connected:Boolean(valid),
      expiresAt:valid?token.expiresAt:null,
      grantedScopes:valid?token.scopes:[],
      prepared:pending?{url:pending.url,expiresAt:pending.createdAt+300000}:null
    };
  }
  async function setConfig(browserApi,message) {
    const next={clientId:OAUTH.clientId(message.clientId),scopes:OAUTH.scopes(message.scopes)};
    const current=await config(browserApi);
    await browserApi.storage.local.set({[CONFIG_KEY]:next});
    if(current.clientId!==next.clientId || current.scopes.join(" ")!==next.scopes.join(" "))
      await browserApi.storage.session.remove([PENDING_KEY,TOKEN_KEY]);
    return status(browserApi);
  }
  async function prepare(browserApi,cryptoApi) {
    if(!await permitted(browserApi)) throw new Error("Grant Google's three API host permissions first");
    const cfg=await config(browserApi);
    if(!cfg.clientId) throw new Error("Configure your Google OAuth Desktop client ID before connecting");
    if(!browserApi.identity?.getRedirectURL)
      throw new Error("Firefox identity API is unavailable");
    const result=await OAUTH.prepare({
      client:cfg.clientId,selected:cfg.scopes,
      identityRedirect:browserApi.identity.getRedirectURL(),cryptoApi
    });
    await browserApi.storage.session.set({[PENDING_KEY]:{...result,createdAt:Date.now()}});
    return status(browserApi);
  }
  async function complete(browserApi,fetchImpl,message) {
    const stored=(await browserApi.storage.session.get(PENDING_KEY))[PENDING_KEY];
    const code=OAUTH.validateCallback(message.callbackUrl,stored);
    // Authorization codes are single-use. Drop the verifier/state before exchange.
    await browserApi.storage.session.remove(PENDING_KEY);
    const form=new URLSearchParams({
      client_id:stored.clientId,code,code_verifier:stored.verifier,
      redirect_uri:stored.redirectUri,grant_type:"authorization_code"
    });
    const reply=await fetchImpl(OAUTH.TOKEN_URL,{
      method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:form.toString(),redirect:"error",cache:"no-store",credentials:"omit"
    });
    if(!reply?.ok) throw new Error("Google rejected the OAuth code exchange (HTTP "+(reply?.status||"unknown")+")");
    const response=await reply.json();
    const token=OAUTH.validateToken(response,stored.scopes);
    // Any refresh_token from Google is deliberately dropped; never persist it.
    await browserApi.storage.session.set({[TOKEN_KEY]:token});
    return status(browserApi);
  }
  async function disconnect(browserApi,fetchImpl) {
    const existing=(await browserApi.storage.session.get(TOKEN_KEY))[TOKEN_KEY];
    // Always remove local credentials even if remote revocation fails.
    await browserApi.storage.session.remove([PENDING_KEY,TOKEN_KEY]);
    let revoked=false;
    if(existing?.accessToken && await permitted(browserApi)){
      try{
        const resp=await fetchImpl(OAUTH.REVOKE_URL,{
          method:"POST",
          headers:{"Content-Type":"application/x-www-form-urlencoded"},
          body:new URLSearchParams({token:existing.accessToken}).toString(),
          redirect:"error",cache:"no-store",credentials:"omit"
        });
        revoked=Boolean(resp.ok);
      }catch{/* Local disconnect still completes; UI discloses revocation uncertainty. */}
    }
    return {disconnected:true,serverRevoked:revoked,hadToken:Boolean(existing?.accessToken)};
  }
  async function overview(browserApi,fetchImpl,now=Date.now()) {
    if(!await permitted(browserApi)) throw new Error("Google API host permissions are not granted");
    const token=(await browserApi.storage.session.get(TOKEN_KEY))[TOKEN_KEY];
    if(!token || !Number.isFinite(token.expiresAt) || token.expiresAt<=now)
      throw new Error("Google session has expired. Connect again");
    const output={calendar:null,tasks:null,errors:[]};
    if(token.scopes.includes(OAUTH.CALENDAR_READ)) {
      try{output.calendar=await READ.todayCalendar(token,fetchImpl,now);}
      catch(e){output.errors.push({service:"Calendar",message:e.message});}
    }
    if(token.scopes.includes(OAUTH.TASKS_READ)) {
      try{output.tasks=await READ.currentTasks(token,fetchImpl,now);}
      catch(e){output.errors.push({service:"Tasks",message:e.message});}
    }
    return output;
  }
  async function readSaved(browserApi,fetchImpl,message,now=Date.now()) {
    const resource=message.resource;
    const files=root.WorkspaceGoogleFiles;
    const selection=files.validatedResource(resource);
    const needed=selection.kind==="docs"?OAUTH.DOCS_READ:OAUTH.SHEETS_READ;
    if(!await permitted(browserApi,[needed])) throw Error("Grant the matching Google file API host permission");
    const token=(await browserApi.storage.session.get(TOKEN_KEY))[TOKEN_KEY];
    if(selection.kind==="docs")return files.readDoc(resource,token,fetchImpl,now);
    return files.readSheet(resource,message.range,token,fetchImpl,now);
  }
  async function morningCoffee(browserApi,fetchImpl,selection,now=Date.now()){
    if(!selection||typeof selection!=="object"||Array.isArray(selection)||
       (selection.calendar!==true && selection.tasks!==true) ||
       ![undefined,true,false].includes(selection.calendar) ||
       ![undefined,true,false].includes(selection.tasks))
      throw Error("Select Calendar and/or Tasks to prepare your briefing");
    const token=(await browserApi.storage.session.get(TOKEN_KEY))[TOKEN_KEY];
    if(!token||!Array.isArray(token.scopes)||!Number.isFinite(token.expiresAt)||
       token.expiresAt<=now)
      throw Error("Google session has expired. Connect an authorized account first");
    const snapshot={calendar:null,tasks:null,errors:[]};
    const chosen=[
      {include:selection.calendar,scope:OAUTH.CALENDAR_READ,label:"Calendar",read:READ.todayCalendar},
      {include:selection.tasks,scope:OAUTH.TASKS_READ,label:"Tasks",read:READ.currentTasks}
    ];
    for(const source of chosen){
      if(source.include!==true)continue;
      if(!token.scopes.includes(source.scope)){
        snapshot.errors.push({service:source.label,message:"This source has not been authorized"});
        continue;
      }
      if(!await permitted(browserApi,[source.scope])){
        snapshot.errors.push({service:source.label,message:"Firefox permission for this source is missing"});
        continue;
      }
      try{snapshot[source.label.toLowerCase()]=await source.read(token,fetchImpl,now);}
      catch(error){snapshot.errors.push({service:source.label,message:String(error?.message||"Google source unavailable").slice(0,160)});}
    }
    return root.WorkspaceMorningCoffee.compile(snapshot,now);
  }
  async function handle(message,browserApi,fetchImpl,cryptoApi) {
    switch(message.type) {
      case "GOOGLE_AUTH_STATUS":return {ok:true,auth:await status(browserApi)};
      case "GOOGLE_AUTH_CONFIG":return {ok:true,auth:await setConfig(browserApi,message)};
      case "GOOGLE_AUTH_PREPARE":return {ok:true,auth:await prepare(browserApi,cryptoApi)};
      case "GOOGLE_AUTH_COMPLETE":return {ok:true,auth:await complete(browserApi,fetchImpl,message)};
      case "GOOGLE_AUTH_DISCONNECT":return {ok:true,result:await disconnect(browserApi,fetchImpl)};
      case "GOOGLE_READ_OVERVIEW":return {ok:true,result:await overview(browserApi,fetchImpl)};
      case "GOOGLE_READ_FILE":return {ok:true,result:await readSaved(browserApi,fetchImpl,message)};
      case "MORNING_COFFEE_PREPARE":return {ok:true,result:await morningCoffee(
        browserApi,fetchImpl,message.sources)};
      default:throw new Error("Unknown Google connector request");
    }
  }
  root.WorkspaceGoogleSession={HOSTS,requiredHosts,CONFIG_KEY,PENDING_KEY,TOKEN_KEY,handle,
    status,prepare,complete,disconnect,overview,morningCoffee,DATA_TYPES};
  if(typeof module!=="undefined"&&module.exports) module.exports=root.WorkspaceGoogleSession;
})(globalThis);