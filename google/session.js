/* Explicit opt-in Google OAuth and read-only account session. No refresh tokens persisted. */
(function(root){
  "use strict";
  const OAUTH=root.WorkspaceGoogleOAuth, READ=root.WorkspaceGoogleRead;
  const CONFIG_KEY="elfshell.google.oauthConfig.v1";
  const PENDING_KEY="elfshell.google.pending.v1";
  const TOKEN_KEY="elfshell.google.sessionToken.v1";
  const SECRET_KEY="elfshell.google.desktopClientSecret.v1";
  const DATA_TYPES=Object.freeze(["authenticationInfo","websiteContent"]);
  function validDesktopSecret(raw) {
    const secret=typeof raw==="string"?raw.trim():"";
    // OAuth Desktop client credentials are public-client identifiers, but still
    // must never be printed, exported, saved in code or forwarded to AI.
    if(secret.length<8 || secret.length>512 ||
       !/^[A-Za-z0-9._~-]+$/.test(secret))
      throw Error("Enter the Desktop OAuth client secret from your Google Cloud client, locally");
    return secret;
  }
  async function sessionSecret(browserApi) {
    const secret=(await browserApi.storage.session.get(SECRET_KEY))[SECRET_KEY];
    return typeof secret==="string"?secret:"";
  }
  async function setDesktopSecret(browserApi,message) {
    const cfg=await config(browserApi);
    if(!cfg.clientId)throw Error("Save your Google Desktop OAuth client ID before setting its secret");
    const secret=validDesktopSecret(message.secret);
    // Store only in ephemeral Firefox session storage; never local/Sync.
    await browserApi.storage.session.set({[SECRET_KEY]:secret});
    return status(browserApi);
  }
  async function clearDesktopSecret(browserApi) {
    await browserApi.storage.session.remove([SECRET_KEY,PENDING_KEY]);
    return status(browserApi);
  }
  const HOSTS=Object.freeze([
    "https://oauth2.googleapis.com/*",
    "https://www.googleapis.com/*",
    "https://tasks.googleapis.com/*",
    "https://docs.googleapis.com/*",
    "https://sheets.googleapis.com/*",
    "https://gmail.googleapis.com/*"
  ]);
  function requiredHosts(scopes) {
    const requested=OAUTH.scopes(scopes);
    const result=[HOSTS[0]];
    if(requested.includes(OAUTH.CALENDAR_READ))result.push(HOSTS[1]);
    if(requested.includes(OAUTH.TASKS_READ))result.push(HOSTS[2]);
    if(requested.includes(OAUTH.DOCS_READ))result.push(HOSTS[3]);
    if(requested.includes(OAUTH.SHEETS_READ))result.push(HOSTS[4]);
    if(requested.includes(OAUTH.DRIVE_METADATA_READ))result.push(HOSTS[1]);
    if(requested.includes(OAUTH.GMAIL_METADATA_READ))result.push(HOSTS[5]);
    return [...new Set(result)];
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
    const types=selected.includes(OAUTH.GMAIL_METADATA_READ)
      ?[...DATA_TYPES,"personalCommunications"]:[...DATA_TYPES];
    return Boolean(await browserApi.permissions.contains({
      origins:requiredHosts(selected),data_collection:types
    }));
  }
  function safePending(value,now) {
    return value && typeof value==="object" &&
      Number.isFinite(value.createdAt) && now>=value.createdAt &&
      now-value.createdAt<300000 && typeof value.url==="string" &&
      value.url.startsWith(OAUTH.AUTH_ORIGIN+"/o/oauth2/v2/auth?") ? value : null;
  }
  async function status(browserApi,now=Date.now()) {
    const cfg=await config(browserApi);
    const data=await browserApi.storage.session.get([PENDING_KEY,TOKEN_KEY,SECRET_KEY]);
    const token=data[TOKEN_KEY];
    const valid=token && Number.isFinite(token.expiresAt) && token.expiresAt>now;
    const pending=safePending(data[PENDING_KEY],now);
    return {
      config:cfg,
      permissionsGranted:await permitted(browserApi),
      connected:Boolean(valid),
      hasDesktopSecret:Boolean(data[SECRET_KEY]),
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
    // Never pair credentials from one Google client with a different client ID.
    if(current.clientId!==next.clientId)
      await browserApi.storage.session.remove(SECRET_KEY);
    return status(browserApi);
  }
  async function prepare(browserApi,cryptoApi) {
    if(!await permitted(browserApi)) throw new Error("Grant Google's three API host permissions first");
    const cfg=await config(browserApi);
    if(!cfg.clientId) throw new Error("Configure your Google OAuth Desktop client ID before connecting");
    if(!await sessionSecret(browserApi))
      throw new Error("Enter your Google Desktop OAuth client secret for this Firefox session before preparing sign-in");
    if(!browserApi.identity?.getRedirectURL)
      throw new Error("Firefox identity API is unavailable");
    const result=await OAUTH.prepare({
      client:cfg.clientId,selected:cfg.scopes,
      identityRedirect:browserApi.identity.getRedirectURL(),cryptoApi
    });
    await browserApi.storage.session.set({[PENDING_KEY]:{...result,createdAt:Date.now()}});
    return status(browserApi);
  }
  async function cancelPending(browserApi) {
    // Resets only the one-time PKCE challenge; does not alter an existing token.
    // Any delayed callback from an abandoned Google popup will fail validation.
    await browserApi.storage.session.remove(PENDING_KEY);
    return status(browserApi);
  }
  async function complete(browserApi,fetchImpl,message) {
    if(!await permitted(browserApi)) throw Error("Google connection or data-sharing consent was revoked before token exchange");
    const stored=(await browserApi.storage.session.get(PENDING_KEY))[PENDING_KEY];
    const code=OAUTH.validateCallback(message.callbackUrl,stored);
    const clientSecret=await sessionSecret(browserApi);
    if(!clientSecret)throw Error("Google Desktop OAuth client secret is missing; re-enter it locally and prepare sign-in again");
    // Authorization codes are single-use. Drop the verifier/state before exchange.
    await browserApi.storage.session.remove(PENDING_KEY);
    const form=new URLSearchParams({
      client_id:stored.clientId,client_secret:clientSecret,code,code_verifier:stored.verifier,
      redirect_uri:stored.redirectUri,grant_type:"authorization_code"
    });
    const reply=await fetchImpl(OAUTH.TOKEN_URL,{
      method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:form.toString(),redirect:"error",cache:"no-store",credentials:"omit"
    });
    if(!reply?.ok) {
      let category="unknown";
      // Read only a small, fixed provider error classification. Never return
      // Google response bodies, authorization codes or token details to the UI.
      if([400,401,403].includes(reply?.status)){
        try{
          const raw=await reply.json();
          const error=raw&&typeof raw.error==="string"?raw.error:"";
          const description=raw&&typeof raw.error_description==="string"
            ?raw.error_description.toLowerCase():"";
          if(description.includes("client_secret")&&description.includes("missing"))
            category="missing-client-secret";
          else if(error==="invalid_client")category="invalid-client";
          else if(error==="invalid_grant")category="invalid-grant";
          else if(error==="unauthorized_client")category="unauthorized-client";
        }catch{/* Keep the error classification generic, never expose raw data. */}
      }
      throw Error("Google rejected the OAuth code exchange (HTTP "+
        (reply?.status||"unknown")+", category: "+category+")");
    }
    const response=await reply.json();
    const token=OAUTH.validateToken(response,stored.scopes);
    // Any refresh_token from Google is deliberately dropped; never persist it.
    await browserApi.storage.session.set({[TOKEN_KEY]:token});
    return status(browserApi);
  }
  async function disconnect(browserApi,fetchImpl) {
    const existing=(await browserApi.storage.session.get(TOKEN_KEY))[TOKEN_KEY];
    // Always remove local credentials, including the supplied Desktop client secret.
    await browserApi.storage.session.remove([PENDING_KEY,TOKEN_KEY,SECRET_KEY]);
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
  async function readMetadata(browserApi,fetchImpl,source,now=Date.now()){
    const items={
      drive:{scope:OAUTH.DRIVE_METADATA_READ,read:root.WorkspaceGoogleCatalog.recentDrive},
      gmail:{scope:OAUTH.GMAIL_METADATA_READ,read:root.WorkspaceGoogleCatalog.inboxGmail}
    };
    if(!Object.hasOwn(items,source))throw Error("Select Drive or Gmail metadata");
    const item=items[source];
    if(!await permitted(browserApi,[item.scope]))
      throw Error("Grant Firefox host and data-sharing permission for "+source+" first");
    const token=(await browserApi.storage.session.get(TOKEN_KEY))[TOKEN_KEY];
    if(!token||!Number.isFinite(token.expiresAt)||token.expiresAt<=now||
       !Array.isArray(token.scopes)||!token.scopes.includes(item.scope))
      throw Error("This Google session lacks the chosen "+source+" metadata scope. Reauthorize explicitly.");
    return item.read(token,fetchImpl,now);
  }
  async function checkGoogle(browserApi,fetchImpl,sources){
    const token=(await browserApi.storage.session.get(TOKEN_KEY))[TOKEN_KEY];
    return root.WorkspaceConnectionDiagnostics.googleProbe({
      sources,token,fetchImpl,
      permitted:scopes=>permitted(browserApi,scopes)
    });
  }
  async function handle(message,browserApi,fetchImpl,cryptoApi) {
    switch(message.type) {
      case "GOOGLE_AUTH_STATUS":return {ok:true,auth:await status(browserApi)};
      case "GOOGLE_AUTH_CONFIG":return {ok:true,auth:await setConfig(browserApi,message)};
      case "GOOGLE_AUTH_PREPARE":return {ok:true,auth:await prepare(browserApi,cryptoApi)};
      case "GOOGLE_AUTH_SECRET_SET":return {ok:true,auth:await setDesktopSecret(browserApi,message)};
      case "GOOGLE_AUTH_SECRET_CLEAR":return {ok:true,auth:await clearDesktopSecret(browserApi)};
      case "GOOGLE_AUTH_CANCEL":return {ok:true,auth:await cancelPending(browserApi)};
      case "GOOGLE_AUTH_COMPLETE":return {ok:true,auth:await complete(browserApi,fetchImpl,message)};
      case "GOOGLE_AUTH_DISCONNECT":return {ok:true,result:await disconnect(browserApi,fetchImpl)};
      case "GOOGLE_TEST_ACCESS":return {ok:true,result:await checkGoogle(browserApi,fetchImpl,message.sources)};
      case "GOOGLE_READ_OVERVIEW":return {ok:true,result:await overview(browserApi,fetchImpl)};
      case "GOOGLE_READ_METADATA":return {ok:true,result:await readMetadata(
        browserApi,fetchImpl,message.source)};
      case "GOOGLE_READ_FILE":return {ok:true,result:await readSaved(browserApi,fetchImpl,message)};
      case "MORNING_COFFEE_PREPARE":return {ok:true,result:await morningCoffee(
        browserApi,fetchImpl,message.sources)};
      default:throw new Error("Unknown Google connector request");
    }
  }
  root.WorkspaceGoogleSession={HOSTS,requiredHosts,CONFIG_KEY,PENDING_KEY,TOKEN_KEY,handle,
    status,prepare,complete,disconnect,overview,morningCoffee,readMetadata,
    DATA_TYPES,SECRET_KEY,validDesktopSecret};
  if(typeof module!=="undefined"&&module.exports) module.exports=root.WorkspaceGoogleSession;
})(globalThis);