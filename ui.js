/* Shared user interface for Workspace Hub and native Firefox sidebar. */
"use strict";
const list = document.querySelector("#resource-list");
const status = document.querySelector("#status");
function announce(text, error=false) {
  status.textContent=text;
  status.classList.toggle("error",error);
}
async function request(payload) {
  const result = await browser.runtime.sendMessage(payload);
  if (!result || !result.ok) throw new Error(result?.error || "Extension unavailable");
  return result;
}
function node(tag,className,text) {
  const el=document.createElement(tag);
  if(className) el.className=className;
  if(text!==undefined) el.textContent=text;
  return el;
}
function makeResourceCard(item) {
  const row=node("article","resource-row");
  const body=node("div","resource-main");
  const name=node("strong","",item.name);
  const url=node("small","",item.url);
  body.append(name,url);
  const actions=node("div","resource-actions");
  const open=node("button","mini","↗ Open");
  open.type="button";
  open.title="Switch to existing tab or open this resource";
  open.addEventListener("click",async()=>{
    open.disabled=true;
    try {
      const response=await request({type:"OPEN_RESOURCE",key:item.key});
      announce(response.result.reused?"Switched to existing tab.":"Opened resource in Firefox.");
    } catch(error){announce(error.message,true);}
    finally{open.disabled=false;}
  });
  actions.append(open);
  if(document.body.dataset.view==="hub" && /^file:(document|spreadsheets):/.test(item.key)) {
    const preview=node("button","mini","Read preview");
    preview.type="button";
    preview.title="Read only the selected saved file, after Google consent";
    preview.addEventListener("click",async()=>{
      preview.disabled=true;
      const destination=document.querySelector("#google-file-results");
      if(destination)destination.replaceChildren();
      googleMessage("Reading only the selected saved Google file…");
      try {
        const range=document.querySelector("#google-sheet-range")?.value || "A1:Z50";
        const response=await request({type:"GOOGLE_READ_FILE",key:item.key,range});
        renderFilePreview(response.result);
        googleMessage("File preview prepared locally. No AI provider received the file.");
      }catch(error){googleMessage(error.message,true);}
      finally{preview.disabled=false;}
    });
    actions.append(preview);
  }
  if(document.body.dataset.view==="hub") {
    const remove=node("button","mini danger","×");
    remove.type="button";remove.title="Remove from workspace list (does not close tabs)";
    remove.setAttribute("aria-label","Remove "+item.name);
    remove.addEventListener("click",async()=>{
      remove.disabled=true;
      try{
        const result=await request({type:"REMOVE_RESOURCE",key:item.key});
        await refresh();announce("Removed from your Workspace profile. Open tabs were not closed.");
      }catch(error){announce(error.message,true);}finally{remove.disabled=false;}
    });
    actions.append(remove);
  }
  row.append(body,actions);
  return row;
}
function render(items) {
  list.replaceChildren();
  items.forEach(item=>list.append(makeResourceCard(item)));
  if (!items.length) list.append(node("p","quiet","No Google resources saved in this profile."));
  const count=document.querySelector("#count");
  if(count) count.textContent=String(items.length).padStart(2,"0");
}
function renderProfiles(profiles,activeProfileId) {
  const select=document.querySelector("#profile-select");
  if(!select) return;
  select.replaceChildren();
  profiles.forEach(profile=>{
    const option=node("option","",profile.name+" · "+profile.count);
    option.value=profile.id;
    select.append(option);
  });
  select.value=activeProfileId;
  const remove=document.querySelector("#profile-delete");
  if(remove) remove.disabled=activeProfileId==="default"||profiles.length===1;
}
function renderPersona(persona) {
  const mode=document.querySelector("#persona-mode");
  const custom=document.querySelector("#persona-custom");
  const label=document.querySelector("#persona-current-mode");
  if(mode && custom) {
    mode.value=persona.mode;
    custom.value=persona.customPrompt;
    custom.disabled=persona.mode!=="custom";
  }
  if(label) label.textContent=persona.mode==="ayarime"
    ? "Ayarime — Original" : persona.mode==="professional" ? "Professional — Neutral" : "Custom personality";
}
async function refresh(){
  try {
    const result=await request({type:"GET_STATE"});
    render(result.resources);
    renderProfiles(result.profiles,result.activeProfileId);
    const preference=await request({type:"GET_PERSONA"});
    renderPersona(preference.persona);
  } catch(error) {announce(error.message,true);}
}
document.querySelector("#launch").addEventListener("click",async(event)=>{
  const button=event.currentTarget;button.disabled=true;announce("Preparing Workspace tabs…");
  try {
    const response=await request({type:"OPEN_WORKSPACE"});
    const r=response.result;
    announce("Workspace ready · "+r.opened+" opened · "+r.reused+" reused"+
      (r.outsideWindow.length?" · "+r.outsideWindow.length+" kept in other windows":""));
  }catch(error){announce(error.message,true);}
  finally{button.disabled=false;}
});
const form=document.querySelector("#resource-form");
if(form) form.addEventListener("submit",async(event)=>{
  event.preventDefault();
  const button=form.querySelector("button");
  button.disabled=true;
  try{
    const result=await request({type:"SAVE_RESOURCE",name:form.querySelector("#name").value,url:form.querySelector("#url").value});
    await refresh();form.reset();announce("Google resource saved. It will open or be reused at next launch.");
  }catch(error){announce(error.message,true);}
  finally{button.disabled=false;}
});

const profileSelect=document.querySelector("#profile-select");
if(profileSelect) profileSelect.addEventListener("change",async event=>{
  const select=event.currentTarget;select.disabled=true;
  try {
    const result=await request({type:"SELECT_PROFILE",id:select.value});
    render(result.resources);renderProfiles(result.profiles,result.activeProfileId);
    announce("Workspace profile selected. Existing tabs are unchanged.");
  }catch(error){announce(error.message,true);await refresh();}
  finally{select.disabled=false;}
});
const profileForm=document.querySelector("#profile-form");
if(profileForm) {
  const input=profileForm.querySelector("#profile-name");
  profileForm.addEventListener("submit",async event=>{
    event.preventDefault();
    const create=profileForm.querySelector("#profile-create");create.disabled=true;
    try {
      const result=await request({type:"CREATE_PROFILE",name:input.value});
      render(result.resources);renderProfiles(result.profiles,result.activeProfileId);
      input.value="";announce("New empty Workspace profile created and selected.");
    }catch(error){announce(error.message,true);}
    finally{create.disabled=false;}
  });
  profileForm.querySelector("#profile-rename").addEventListener("click",async()=>{
    const button=profileForm.querySelector("#profile-rename");button.disabled=true;
    try{
      const result=await request({type:"RENAME_PROFILE",name:input.value});
      render(result.resources);renderProfiles(result.profiles,result.activeProfileId);
      input.value="";announce("Workspace profile renamed. Open tabs remain unchanged.");
    }catch(error){announce(error.message,true);}finally{button.disabled=false;}
  });
  profileForm.querySelector("#profile-delete").addEventListener("click",async()=>{
    const id=profileSelect.value;
    const label=profileSelect.selectedOptions[0]?.textContent || "this Workspace";
    if(!window.confirm("Delete saved profile "+label+"? Open Firefox tabs will not be closed.")) return;
    const button=profileForm.querySelector("#profile-delete");button.disabled=true;
    try {
      const result=await request({type:"DELETE_PROFILE",id});
      render(result.resources);renderProfiles(result.profiles,result.activeProfileId);
      announce("Saved Workspace profile deleted. All open Firefox tabs were preserved.");
    }catch(error){announce(error.message,true);}finally{await refresh();}
  });
}
const personaForm=document.querySelector("#persona-form");
if(personaForm) {
  const mode=personaForm.querySelector("#persona-mode");
  const custom=personaForm.querySelector("#persona-custom");
  mode.addEventListener("change",()=>{custom.disabled=mode.value!=="custom";});
  personaForm.addEventListener("submit",async event=>{
    event.preventDefault();
    const save=personaForm.querySelector('button[type="submit"]');save.disabled=true;
    try {
      const response=await request({type:"SET_PERSONA",mode:mode.value,customPrompt:custom.value});
      renderPersona(response.persona);
      announce("Ayarime personality saved locally. AI service integration is not enabled yet.");
    }catch(error){announce(error.message,true);}
    finally{save.disabled=false;}
  });
  personaForm.querySelector("#persona-reset").addEventListener("click",async()=>{
    try {
      const response=await request({type:"RESET_PERSONA"});
      renderPersona(response.persona);
      announce("Default Ayarime personality restored.");
    }catch(error){announce(error.message,true);}
  });
}
const GOOGLE_CALENDAR_SCOPE="https://www.googleapis.com/auth/calendar.events.readonly";
const GOOGLE_TASKS_SCOPE="https://www.googleapis.com/auth/tasks.readonly";
const GOOGLE_DOCS_SCOPE="https://www.googleapis.com/auth/documents.readonly";
const GOOGLE_SHEETS_SCOPE="https://www.googleapis.com/auth/spreadsheets.readonly";
const GOOGLE_DRIVE_SCOPE="https://www.googleapis.com/auth/drive.metadata.readonly";
const GOOGLE_GMAIL_SCOPE="https://www.googleapis.com/auth/gmail.metadata";
const GOOGLE_HOST_PERMISSIONS={
  oauth:"https://oauth2.googleapis.com/*",
  calendar:"https://www.googleapis.com/*",
  tasks:"https://tasks.googleapis.com/*",
  docs:"https://docs.googleapis.com/*",
  sheets:"https://sheets.googleapis.com/*",
  gmail:"https://gmail.googleapis.com/*"
};
let googleCurrentScopes=[GOOGLE_CALENDAR_SCOPE];
function googleHostsForScopes(scopes) {
  const hosts=[GOOGLE_HOST_PERMISSIONS.oauth];
  if(scopes.includes(GOOGLE_CALENDAR_SCOPE))hosts.push(GOOGLE_HOST_PERMISSIONS.calendar);
  if(scopes.includes(GOOGLE_TASKS_SCOPE))hosts.push(GOOGLE_HOST_PERMISSIONS.tasks);
  if(scopes.includes(GOOGLE_DOCS_SCOPE))hosts.push(GOOGLE_HOST_PERMISSIONS.docs);
  if(scopes.includes(GOOGLE_SHEETS_SCOPE))hosts.push(GOOGLE_HOST_PERMISSIONS.sheets);
  if(scopes.includes(GOOGLE_DRIVE_SCOPE))hosts.push(GOOGLE_HOST_PERMISSIONS.calendar);
  if(scopes.includes(GOOGLE_GMAIL_SCOPE))hosts.push(GOOGLE_HOST_PERMISSIONS.gmail);
  return [...new Set(hosts)];
}
function googleConsentTypes(scopes){
  return scopes.includes(GOOGLE_GMAIL_SCOPE)
    ?["authenticationInfo","websiteContent","personalCommunications"]
    :["authenticationInfo","websiteContent"];
}
let googlePreparedUrl=null;
let googleSignInSerial=0;
let googleLoginActive=false;
const googleForm=document.querySelector("#google-config-form");
function googleMessage(value,error=false) {
  const target=document.querySelector("#google-auth-status");
  if(!target)return;
  target.textContent=value;
  target.classList.toggle("error",error);
}
function showGoogleState(auth) {
  if(!googleForm) return;
  const field=googleForm.querySelector("#google-client-id");
  field.value=auth.config.clientId;
  googleForm.querySelector("#google-scope-calendar").checked=auth.config.scopes.includes(GOOGLE_CALENDAR_SCOPE);
  googleForm.querySelector("#google-scope-tasks").checked=auth.config.scopes.includes(GOOGLE_TASKS_SCOPE);
  googleForm.querySelector("#google-scope-docs").checked=auth.config.scopes.includes(GOOGLE_DOCS_SCOPE);
  googleForm.querySelector("#google-scope-sheets").checked=auth.config.scopes.includes(GOOGLE_SHEETS_SCOPE);
  googleForm.querySelector("#google-scope-drive").checked=auth.config.scopes.includes(GOOGLE_DRIVE_SCOPE);
  googleForm.querySelector("#google-scope-gmail").checked=auth.config.scopes.includes(GOOGLE_GMAIL_SCOPE);
  googleCurrentScopes=[...auth.config.scopes];
  googlePreparedUrl=auth.prepared?.url || null;
  document.querySelector("#google-prepare").disabled=!auth.permissionsGranted || !auth.config.clientId || !auth.hasDesktopSecret;
  const secretStatus=document.querySelector("#google-secret-status");
  if(secretStatus)secretStatus.textContent=auth.hasDesktopSecret
    ? "Desktop client secret available for this Firefox session. Value is never displayed."
    : "No Desktop OAuth client secret stored. Paste it below and click Use secret for this session.";
  const clearSecret=document.querySelector("#google-secret-clear");
  if(clearSecret)clearSecret.disabled=!auth.hasDesktopSecret;
  document.querySelector("#google-connect").disabled=!googlePreparedUrl||googleLoginActive;
  document.querySelector("#google-reset").disabled=!auth.prepared&&!googleLoginActive;
  document.querySelector("#google-read").disabled=!auth.connected;
  document.querySelector("#google-check").disabled=!auth.connected;
  document.querySelector("#google-disconnect").disabled=!auth.connected;
  document.querySelector("#google-drive-read").disabled=
    !auth.connected||!auth.grantedScopes.includes(GOOGLE_DRIVE_SCOPE);
  document.querySelector("#google-gmail-read").disabled=
    !auth.connected||!auth.grantedScopes.includes(GOOGLE_GMAIL_SCOPE);
  googleMessage(auth.connected
    ? "Connected until "+new Date(auth.expiresAt).toLocaleTimeString()+
       " · Granted: "+auth.grantedScopes.map(scope=>
         scope===GOOGLE_DOCS_SCOPE?"Docs":scope===GOOGLE_SHEETS_SCOPE?"Sheets":
         scope===GOOGLE_TASKS_SCOPE?"Tasks":
         scope===GOOGLE_DRIVE_SCOPE?"Drive metadata":
         scope===GOOGLE_GMAIL_SCOPE?"Gmail headers":"Calendar").join(", ")
    : auth.prepared
      ? "Authorization prepared. Select Connect Google to open Firefox's sign-in."
      : auth.permissionsGranted
        ? auth.hasDesktopSecret
          ? "Google not connected. Prepare sign-in using the saved Desktop OAuth client."
          : "Google not connected. Enter your Desktop OAuth client secret in the session-only field, then prepare sign-in."
        : "Google not connected. API host permission must be granted explicitly.");
}
function explainGoogleLoginFailure(error,stage){
  // Provider/browser exception strings can contain callback URLs with one-time
  // authorization codes. Never echo arbitrary errors, query strings or tokens.
  const raw=String(error?.message||"").toLowerCase();
  if(stage==="redirect"){
    if(/cancel|closed|denied|declined/.test(raw))
      return "Google sign-in was closed or cancelled. Prepare sign-in to retry.";
    return "Firefox did not complete the Google return redirect. "+
      "If Google opens inside Multi-Account Containers, temporarily disable "+
      "automatic Google container assignment and retry. No token was stored.";
  }
  const status=/oauth code exchange \(http (\d{3})(?:, category: ([a-z-]+))?\)/.exec(raw);
  if(status){
    if(status[2]==="missing-client-secret")
      return "Google received the authorization code but says the Desktop client secret is missing. Enter it in Ayarime's session-only field and retry with a fresh sign-in.";
    if(status[2]==="invalid-client")
      return "Google rejected the Desktop OAuth client credentials (HTTP "+status[1]+"). Check that the client ID and session-only secret belong to the SAME Google Cloud Desktop client.";
    if(status[2]==="invalid-grant")
      return "Google rejected the one-time code or PKCE verifier (HTTP "+status[1]+"). Close the old window, prepare a new sign-in, and do not reuse an earlier authorization code.";
    if(status[1]==="400")return "Google returned to Firefox, but rejected the "+
      "one-time code exchange (HTTP 400). The code may have expired or the "+
      "Desktop OAuth client/redirect may not match. Prepare sign-in again.";
    return "Google returned to Firefox, but token exchange failed (HTTP "+
      status[1]+"). Check the new Desktop OAuth client and permissions.";
  }
  if(raw.includes("expired"))
    return "Google returned too late and the sign-in challenge expired. "+
      "Prepare sign-in again and complete consent promptly.";
  if(raw.includes("state validation"))
    return "Google returned with an invalid sign-in state; nothing was connected. "+
      "Prepare a fresh sign-in and do not reuse an earlier Google window.";
  if(raw.includes("callback destination"))
    return "Google returned to an unexpected callback URL. Verify Desktop OAuth "+
      "client type and Firefox redirect configuration.";
  if(raw.includes("invalid access token")||raw.includes("read-only permissions"))
    return "Google returned a token response, but requested permissions "+
      "could not be confirmed. Try Calendar/Tasks read-only scopes only.";
  if(raw.includes("revoked")||raw.includes("permission"))
    return "Firefox Google API/data-sharing permission is missing or was revoked. "+
      "Allow the requested permissions, then prepare sign-in again.";
  return "Google returned to Firefox, but its authorization could not be "+
    "completed. Check the Firefox add-on's debugging console; never share "+
    "authorization codes or token values.";
}
async function refreshGoogle() {
  if(!googleForm)return;
  try {
    const result=await request({type:"GOOGLE_AUTH_STATUS"});
    showGoogleState(result.auth);
  }catch(error){googleMessage(error.message,true);}
}
function renderFilePreview(preview) {
  const host=document.querySelector("#google-file-results");
  if(!host)return;
  host.replaceChildren();
  const article=node("article","");
  article.append(node("h3","",preview.title||"Google file"));
  article.append(node("p","",preview.kind==="docs"
    ? "Google Docs · text preview capped at 12,000 characters"
    : "Google Sheets · tab "+preview.sheet+" · "+preview.range+" · max 100 rows × 26 columns"));
  if(preview.kind==="docs") {
    article.append(node("div","google-preview-text",preview.text||"(No readable text in this preview)"));
  }else if(preview.kind==="sheets") {
    const table=node("table","google-preview-table");
    const body=node("tbody","");
    for(const row of preview.rows||[]){
      const tr=node("tr","");
      for(const value of row)tr.append(node("td","",String(value)));
      body.append(tr);
    }
    table.append(body);
    article.append(table);
  }
  if(preview.truncated) article.append(node("p","", "This is a truncated preview, not the entire file."));
  host.append(article);
}
function renderGoogleResults(data) {
  const host=document.querySelector("#google-results");
  if(!host)return;
  host.replaceChildren();
  function section(title,items,description) {
    const article=node("article","");
    article.append(node("h3","",title),node("p","",description));
    if(items.length) {
      const ul=node("ul","");
      items.forEach(item=>ul.append(node("li","",item)));
      article.append(ul);
    }
    host.append(article);
  }
  if(data.calendar) {
    section("Calendar — Today's events",
      data.calendar.events.map(e=>e.title+" · "+(e.start||"No start time")),
      (data.calendar.limited?"First 30 only. ":"")+
      (data.calendar.events.length+" event(s) returned; read only."));
  }
  if(data.tasks) {
    const items=data.tasks.lists.flatMap(list=>
      list.tasks.map(task=>list.list+": "+task.title+(task.due?" · due "+task.due:"")));
    section("Google Tasks — Incomplete",
      items,
      (data.tasks.limited?"Partial list: results truncated. ":"")+
      (items.length+" incomplete task(s) from up to five lists; read only."));
  }
  (data.errors||[]).forEach(error=>
    section(error.service+" unavailable",[],String(error.message||"Unable to read")));
  if(!data.calendar && !data.tasks && !(data.errors||[]).length)
    section("No readable sources",[],"Reconnect with Calendar or Tasks permissions.");
}
function renderWorkspaceMetadata(data){
  const host=document.querySelector("#google-metadata-results");
  if(!host)return;
  host.replaceChildren();
  const title=node("h3","",data.kind==="drive"?"Recent Drive files":"Gmail inbox headers");
  host.append(title,node("p","quiet",data.note||"Bounded metadata preview"));
  const items=data.kind==="drive"?data.files:data.messages;
  for(const item of items||[]){
    const article=node("div","google-metadata-entry");
    if(data.kind==="drive"){
      const label=node("strong","",item.name||"Untitled file");
      article.append(label);
      article.append(node("small","",[
        item.mimeType||"Unknown format",item.modified||"Unknown modification date"
      ].join(" · ")));
      if(item.link){
        try{
          const url=new URL(item.link);
          if(url.protocol==="https:" &&
             ["drive.google.com","docs.google.com","sheets.google.com"].includes(url.hostname) &&
             !url.username&&!url.password){
            const a=node("a","","Open original file");
            a.href=url.href;a.target="_blank";a.rel="noopener noreferrer";
            article.append(a);
          }
        }catch{/* Ignore invalid provider source URLs. */}
      }
    }else{
      article.append(node("strong","",item.subject||"(No subject)"));
      article.append(node("small","","From: "+(item.from||"Unknown")+" · "+
        (item.date||"Unknown date")+(item.unread?" · Unread":"")));
    }
    host.append(article);
  }
  if(!items?.length)host.append(node("p","quiet","No matching metadata returned."));
  if(data.limited)host.append(node("p","quiet","Additional records exist. This preview is intentionally limited."));
}
async function loadWorkspaceMetadata(source){
  const button=document.querySelector(source==="drive"?"#google-drive-read":"#google-gmail-read");
  const status=document.querySelector("#google-metadata-status");
  const host=document.querySelector("#google-metadata-results");
  button.disabled=true;
  status.textContent="Fetching user-selected "+(source==="drive"?"Drive file metadata":"Gmail inbox headers")+"…";
  host.replaceChildren();
  try{
    const response=await request({type:"GOOGLE_READ_METADATA",source});
    renderWorkspaceMetadata(response.result);
    status.textContent=(source==="drive"?"Drive":"Gmail")+
      " metadata retrieved read-only. No content was stored or sent to an AI provider.";
  }catch(error){
    // API adapter returns fixed, sanitized errors; never display raw provider bodies.
    status.textContent=error?.message||"Google metadata request failed";
  }finally{
    await refreshGoogle();
  }
}
if(googleForm) {
  googleForm.addEventListener("submit",async event=>{
    event.preventDefault();
    const save=googleForm.querySelector('button[type="submit"]');save.disabled=true;
    const scopes=[];
    if(googleForm.querySelector("#google-scope-calendar").checked)scopes.push(GOOGLE_CALENDAR_SCOPE);
    if(googleForm.querySelector("#google-scope-tasks").checked)scopes.push(GOOGLE_TASKS_SCOPE);
    if(googleForm.querySelector("#google-scope-docs").checked)scopes.push(GOOGLE_DOCS_SCOPE);
    if(googleForm.querySelector("#google-scope-sheets").checked)scopes.push(GOOGLE_SHEETS_SCOPE);
    if(googleForm.querySelector("#google-scope-drive").checked)scopes.push(GOOGLE_DRIVE_SCOPE);
    if(googleForm.querySelector("#google-scope-gmail").checked)scopes.push(GOOGLE_GMAIL_SCOPE);
    try {
      const r=await request({type:"GOOGLE_AUTH_CONFIG",
        clientId:googleForm.querySelector("#google-client-id").value,scopes});
      showGoogleState(r.auth);
      googleMessage("Configuration saved. Grant browser permission, then prepare sign-in.");
    }catch(error){googleMessage(error.message,true);}
    finally{save.disabled=false;}
  });
  document.querySelector("#google-drive-read").addEventListener("click",()=>{
    loadWorkspaceMetadata("drive");
  });
  document.querySelector("#google-gmail-read").addEventListener("click",()=>{
    loadWorkspaceMetadata("gmail");
  });
  document.querySelector("#google-grant").addEventListener("click",async()=>{
    // Permission must originate from this direct click, before async work.
    let grant;
    try {grant=browser.permissions.request({origins:googleHostsForScopes(googleCurrentScopes),data_collection:googleConsentTypes(googleCurrentScopes)});}
    catch(error){googleMessage("Firefox could not request API host permission.",true);return;}
    googleMessage("Choose Allow or Deny in Firefox's permission dialog…");
    try{
      if(!await grant){googleMessage("Google connection or data-sharing permission declined. Nothing was connected.",true);return;}
      await refreshGoogle();
    }catch(error){googleMessage("Permission request failed: "+error.message,true);}
  });
  document.querySelector("#google-secret-save").addEventListener("click",async()=>{
    const input=document.querySelector("#google-client-secret");
    const secret=input.value;
    input.value=""; // Do not retain in the live DOM or in saved form values.
    if(!secret){googleMessage("Enter the Desktop OAuth client secret in the session-only field.",true);return;}
    const button=document.querySelector("#google-secret-save");
    button.disabled=true;
    try{
      const response=await request({type:"GOOGLE_AUTH_SECRET_SET",secret});
      showGoogleState(response.auth);
      googleMessage("Desktop OAuth client secret stored for this Firefox session only. Prepare sign-in again.");
    }catch{
      googleMessage("Unable to use Desktop client secret. Check that it belongs to the selected Google Cloud Desktop client. The value was not saved.",true);
    }finally{button.disabled=false;}
  });
  document.querySelector("#google-secret-clear").addEventListener("click",async()=>{
    const button=document.querySelector("#google-secret-clear");
    button.disabled=true;
    document.querySelector("#google-client-secret").value="";
    try{
      const result=await request({type:"GOOGLE_AUTH_SECRET_CLEAR"});
      showGoogleState(result.auth);
      googleMessage("Desktop client secret and any pending sign-in cleared from this Firefox session.");
    }catch{
      googleMessage("Could not clear the session credential. Close the test browser profile before proceeding.",true);
    }finally{await refreshGoogle();}
  });
  document.querySelector("#google-prepare").addEventListener("click",async()=>{
    try{
      const r=await request({type:"GOOGLE_AUTH_PREPARE"});
      showGoogleState(r.auth);
    }catch(error){googleMessage(error.message,true);}
  });
  document.querySelector("#google-connect").addEventListener("click",async()=>{
    if(googleLoginActive)return;
    const url=googlePreparedUrl;
    if(!url){googleMessage("Prepare sign-in first.",true);return;}
    const connect=document.querySelector("#google-connect");
    let login;
    try{
      // No async gap before launching: Firefox requires a direct user gesture.
      login=globalThis.WorkspaceGoogleLogin.launch(browser,url);
    }catch(error){
      googleMessage(globalThis.WorkspaceGoogleLogin.safeStartFailure(error),true);
      return;
    }
    const attempt=++googleSignInSerial;
    googleLoginActive=true;
    googlePreparedUrl=null;
    connect.disabled=true;
    document.querySelector("#google-reset").disabled=false;
    let stage="redirect";
    const slowNotice=setTimeout(()=>{
      if(attempt===googleSignInSerial&&stage==="redirect")googleMessage(
        "Still waiting for Firefox to capture Google's return redirect. "+
        "If Google keeps loading after Continue, use Reset sign-in, close the "+
        "Google window, and check if Google is assigned to a Firefox Container. "+
        "Nothing is connected yet.",true);
    },30000);
    googleMessage("Google sign-in opened. Waiting for Firefox to capture the authorization redirect…");
    try{
      const callback=await login;
      // Reset invalidates the one-time challenge. Never reuse a late callback.
      if(attempt!==googleSignInSerial)return;
      stage="exchange";
      clearTimeout(slowNotice);
      document.querySelector("#google-reset").disabled=true;
      googleMessage("Firefox captured Google's return. Exchanging the one-time code securely…");
      const result=await request({type:"GOOGLE_AUTH_COMPLETE",callbackUrl:callback});
      if(attempt!==googleSignInSerial)return;
      showGoogleState(result.auth);
      if(!result.auth.connected)googleMessage(
        "Google returned, but no authorized session could be confirmed.",true);
    }catch(error){
      if(attempt!==googleSignInSerial)return;
      // Clear a failed one-time challenge. Never allow accidental re-use.
      const explanation=explainGoogleLoginFailure(error,stage);
      try{await request({type:"GOOGLE_AUTH_CANCEL"});}catch{/* best effort */}
      // Refresh before showing the failure; the old order erased useful errors.
      await refreshGoogle();
      googleMessage(explanation,true);
    }finally{
      clearTimeout(slowNotice);
      if(attempt===googleSignInSerial){
        googleLoginActive=false;
        connect.disabled=!googlePreparedUrl;
        document.querySelector("#google-reset").disabled=!googlePreparedUrl;
      }
    }
  });
  document.querySelector("#google-reset").addEventListener("click",async()=>{
    ++googleSignInSerial;
    googleLoginActive=false;
    googlePreparedUrl=null;
    const reset=document.querySelector("#google-reset");
    reset.disabled=true;
    try{
      const result=await request({type:"GOOGLE_AUTH_CANCEL"});
      showGoogleState(result.auth);
      googleMessage("Pending sign-in reset. Close the old Google sign-in window, "+
        "then choose Prepare sign-in for a fresh attempt. No account access "+
        "was granted by this reset.");
    }catch{
      googleMessage("Could not reset the pending sign-in. Reload the Hub "+
        "and prepare a new authorization attempt.",true);
    }finally{reset.disabled=!googleLoginActive&&!googlePreparedUrl;}
  });
  document.querySelector("#google-disconnect").addEventListener("click",async()=>{
    const button=document.querySelector("#google-disconnect");button.disabled=true;
    try {
      const result=await request({type:"GOOGLE_AUTH_DISCONNECT"});
      document.querySelector("#google-results").replaceChildren();
      await refreshGoogle();
      googleMessage(result.result.serverRevoked
        ? "Disconnected. Google confirmed access-token revocation."
        : "Disconnected locally. Remote revocation was not confirmed; review Google account permissions.");
    }catch(error){googleMessage(error.message,true);}
    finally{await refreshGoogle();}
  });
  document.querySelector("#google-check").addEventListener("click",async()=>{
    const button=document.querySelector("#google-check");
    const output=document.querySelector("#google-check-result");
    const sources={
      calendar:document.querySelector("#google-scope-calendar").checked,
      tasks:document.querySelector("#google-scope-tasks").checked
    };
    if(!sources.calendar&&!sources.tasks){
      output.textContent="Select Calendar and/or Tasks to verify. Docs/Sheets are not probed here.";
      return;
    }
    button.disabled=true;
    output.textContent="Checking minimal Google API access. No item contents are displayed…";
    try {
      const response=await request({type:"GOOGLE_TEST_ACCESS",sources});
      const data=response.result;
      output.textContent=data.sources.map(item=>
        (item.ok?"PASS":"FAILED")+" · "+item.source+": "+item.message).join("\n")+
        "\n"+data.note;
    }catch(error){output.textContent="Connection check could not run: "+error.message;}
    finally{await refreshGoogle();}
  });
  document.querySelector("#google-read").addEventListener("click",async()=>{
    const button=document.querySelector("#google-read");button.disabled=true;
    googleMessage("Reading authorized Calendar / Tasks information directly from Google…");
    try {
      const result=await request({type:"GOOGLE_READ_OVERVIEW"});
      renderGoogleResults(result.result);
      googleMessage("Read-only snapshot prepared. No AI service received this data.");
    }catch(error){googleMessage(error.message,true);}
    finally{await refreshGoogle();}
  });
}
const AI_HOSTS={
  openai:"https://api.openai.com/*",
  anthropic:"https://api.anthropic.com/*",
  gemini:"https://generativelanguage.googleapis.com/*"
};
const AI_DEFAULTS={openai:"gpt-5.4-mini",anthropic:"claude-sonnet-4-5",gemini:"gemini-3.8-flash"};
const AI_OFFER=globalThis.WorkspaceOpenAIComplimentary;
const aiOfferSelector=document.querySelector("#ai-model-choice");
function populateOpenAIModels(){
  if(!aiOfferSelector||!AI_OFFER)return;
  aiOfferSelector.replaceChildren(new Option("Custom / existing model ID",""));
  const datalist=document.querySelector("#openai-model-presets");
  if(datalist)datalist.replaceChildren();
  for(const [group,models] of Object.entries(AI_OFFER.GROUPS)){
    const label=group==="standard"?"250,000 shared daily tokens · eligible list"
      :group==="small"?"2,500,000 shared daily tokens · eligible list"
      :"Other OpenAI models · outside these screenshot groups";
    const groupEl=document.createElement("optgroup");groupEl.label=label;
    for(const item of models){
      const suffix=item.status==="shut-down"?" · retired / unavailable"
        :item.status==="deprecated"?" · deprecated / check access":"";
      const option=new Option(item.id+suffix,item.id);
      option.disabled=item.status==="shut-down";
      groupEl.append(option);
      if(datalist){
        const suggestion=document.createElement("option");
        suggestion.value=item.id;suggestion.label=label+suffix;
        datalist.append(suggestion);
      }
    }
    aiOfferSelector.append(groupEl);
  }
}
function renderModelOffer(provider,modelId){
  const isOpenAI=provider==="openai";
  const catalog=document.querySelector("#ai-offer-selector");
  const panel=document.querySelector("#ai-offer-panel");
  if(catalog)catalog.hidden=!isOpenAI;
  if(panel)panel.hidden=!isOpenAI;
  const item=isOpenAI?AI_OFFER.lookup(modelId):null;
  if(aiOfferSelector)aiOfferSelector.value=item&&item.status!=="shut-down"?modelId:"";
  const note=document.querySelector("#ai-model-offer-note");
  if(!note)return;
  if(!isOpenAI)return;
  if(!item){
    note.textContent="Custom model. No complimentary group confirmed; check its pricing in OpenAI.";
  }else if(item.status==="shut-down"){
    note.textContent=item.id+" · listed in your historical offer, but the API model has been shut down. Choose a supported alternative.";
  }else{
    const quota=item.group==="standard"?"250,000":
      item.group==="small"?"2,500,000":null;
    note.textContent=item.id+(quota
      ?" · in the "+quota+"-token daily group shown in your offer."
      :" · outside the two screenshot offer groups; standard billing may apply.")+
      (item.status==="deprecated"?" Deprecated model: verify availability before a paid request.":"");
  }
  const effort=document.querySelector("#ai-effort");
  if(effort && item?.nonReasoning)effort.value="none";
  else if(effort&&item?.group!=="other"&&effort.value==="max")
    effort.value="high";
}
function showOpenAIOffer(status){
  if(!status||!document.querySelector("#ai-offer-panel"))return;
  const enrolled=document.querySelector("#ai-offer-enrolled");
  enrolled.checked=status.enrollmentSelfReported;
  document.querySelector("#ai-offer-enrollment-status").textContent=status.enrollmentSelfReported
    ?"Enrollment self-reported. This app cannot verify the organization/project setting or account-wide free usage."
    :"Enrollment NOT confirmed here. Your screenshot shows eligibility only, so requests may be billed.";
  for(const group of ["standard","small"]){
    const max=status.limits[group],observed=status.observedTokens[group];
    const meter=document.querySelector("#ai-offer-"+group+"-meter");
    if(!meter)continue;
    meter.max=max;meter.value=Math.min(observed,max);
    document.querySelector("#ai-offer-"+group+"-count").textContent=
      observed.toLocaleString()+" tokens observed in this extension today · NOT remaining free tokens";
  }
  document.querySelector("#ai-offer-day").textContent=
    "UTC date: "+status.date+" · counters reset at 00:00 UTC. Other API clients are not counted.";
}
async function refreshOpenAIOffer(){
  if(!aiOfferSelector)return;
  try{
    const response=await request({type:"AI_OFFER_STATUS"});
    showOpenAIOffer(response.offer);
  }catch(error){
    const status=document.querySelector("#ai-offer-enrollment-status");
    if(status)status.textContent="Local offer status unavailable: "+error.message;
  }
}
populateOpenAIModels();
const aiForm=document.querySelector("#ai-settings-form");
let aiSavedProvider="openai";
function aiMessage(message,error=false){
  const target=document.querySelector("#ai-status");
  if(!target)return;
  target.textContent=message;
  target.classList.toggle("error",error);
}
function showAIState(ai){
  if(!aiForm)return;
  const provider=aiForm.querySelector("#ai-provider"),model=aiForm.querySelector("#ai-model");
  provider.value=ai.provider;model.value=ai.model;
  aiSavedProvider=ai.provider;
  if(ai.provider==="openai")model.setAttribute("list","openai-model-presets");
  else model.removeAttribute("list");
  document.querySelector("#ai-stream-options").hidden=ai.provider!=="openai";
  renderModelOffer(ai.provider,ai.model);
  document.querySelector("#ai-send").disabled=
    !ai.hasSessionKey||!ai.hostGranted||globalThis.WorkspaceTraceUI.isRunning();
  document.querySelector("#ai-check-model").disabled=!ai.hasSessionKey||!ai.hostGranted;
  document.querySelector("#ai-clear-key").disabled=!ai.hasSessionKey;
  void globalThis.WorkspaceConversationUI?.refreshPreview();
  aiMessage(ai.hasSessionKey
    ? "Session key ready · "+ai.provider+" / "+ai.model+" · manual prompts only"
    : ai.hostGranted
      ? "Provider network permission granted. Enter a session key to begin."
      : "Provider not connected. Save settings and allow this provider's API host.");
}
async function refreshAI(){
  if(!aiForm)return;
  try{const status=await request({type:"AI_STATUS"});showAIState(status.ai);}
  catch(error){aiMessage(error.message,true);}
}
if(aiForm){
  const provider=aiForm.querySelector("#ai-provider"),model=aiForm.querySelector("#ai-model");
  provider.addEventListener("change",()=>{
    model.value=AI_DEFAULTS[provider.value];
    renderModelOffer(provider.value,model.value);
  });
  model.addEventListener("input",()=>renderModelOffer(provider.value,model.value));
  aiOfferSelector.addEventListener("change",()=>{
    if(aiOfferSelector.value){
      model.value=aiOfferSelector.value;
      renderModelOffer(provider.value,model.value);
    }
  });
  document.querySelector("#ai-offer-enrolled").addEventListener("change",async event=>{
    const field=event.currentTarget;
    field.disabled=true;
    try{
      const result=await request({type:"AI_OFFER_SET_ENROLLMENT",enrolled:field.checked});
      showOpenAIOffer(result.offer);
    }catch(error){
      const note=document.querySelector("#ai-offer-enrollment-status");
      note.textContent="Could not save local acknowledgment: "+error.message;
      await refreshOpenAIOffer();
    }finally{field.disabled=false;}
  });
  aiForm.addEventListener("submit",async event=>{
    event.preventDefault();
    if(globalThis.WorkspaceTraceUI.isRunning()){
      aiMessage("Stop the active OpenAI stream before changing provider or model.",true);
      return;
    }
    const button=aiForm.querySelector('button[type="submit"]');button.disabled=true;
    try {
      const response=await request({type:"AI_SAVE_SETTINGS",
        provider:provider.value,model:model.value.trim()});
      showAIState(response.ai);
      aiMessage("Provider/model saved. Enable its host and enter your session API key.");
    }catch(error){aiMessage(error.message,true);}
    finally{button.disabled=false;}
  });
  document.querySelector("#ai-grant").addEventListener("click",async()=>{
    // Direct Firefox user-gesture, without an intervening await.
    const host=AI_HOSTS[aiSavedProvider];
    if(!host)return;
    let grant;
    try{grant=browser.permissions.request({origins:[host],data_collection:["authenticationInfo","personalCommunications","websiteContent","personallyIdentifyingInfo"]});}
    catch{aiMessage("Firefox rejected the provider permission request.",true);return;}
    aiMessage("Review Firefox's provider connection permission prompt…");
    try{
      if(!await grant){aiMessage("AI provider connection or data-sharing permission declined.",true);return;}
      await refreshAI();
    }catch(error){aiMessage("Permission request failed: "+error.message,true);}
  });
  document.querySelector("#ai-set-key").addEventListener("click",async()=>{
    const field=document.querySelector("#ai-key");
    const button=document.querySelector("#ai-set-key");button.disabled=true;
    try{
      const result=await request({type:"AI_SET_SESSION_KEY",key:field.value});
      field.value="";showAIState(result.ai);
      aiMessage("Key held for this Firefox session only. It has not been saved as a permanent preference.");
    }catch(error){aiMessage(error.message,true);}
    finally{button.disabled=false;}
  });
  document.querySelector("#ai-clear-key").addEventListener("click",async()=>{
    try{
      const result=await request({type:"AI_CLEAR_SESSION_KEY"});
      document.querySelector("#ai-key").value="";
      showAIState(result.ai);aiMessage("Session key cleared.");
    }catch(error){aiMessage(error.message,true);}
  });
  document.querySelector("#ai-check-model").addEventListener("click",async()=>{
    const button=document.querySelector("#ai-check-model");
    const output=document.querySelector("#ai-check-result");
    button.disabled=true;
    output.textContent="Checking the saved model ID through provider metadata; no inference request…";
    try {
      const {result}=await request({type:"AI_CHECK_MODEL"});
      output.textContent=(result.ok?"PASS":"FAILED")+" · "+result.provider+" / "+result.model+
        ": "+result.message+(result.lifecycle?" · lifecycle: "+result.lifecycle:"")+
        (result.generationSupported===false?" · generateContent not supported":"");
    }catch(error){output.textContent="Model check unavailable: "+error.message;}
    finally{await refreshAI();}
  });
  document.querySelector("#ai-cancel").addEventListener("click",async()=>{
    if(globalThis.WorkspaceTraceUI.isRunning()){
      globalThis.WorkspaceTraceUI.cancel();
      return;
    }
    const stop=document.querySelector("#ai-cancel");
    stop.disabled=true;
    try{
      const reply=await request({type:"AI_CANCEL_REQUEST"});
      aiMessage(reply.cancelled?"Stopping the active provider request…":"No request is running.");
    }catch{aiMessage("Could not stop the provider request.",true);}
  });
  document.querySelector("#ai-send").addEventListener("click",async()=>{
    const button=document.querySelector("#ai-send");
    const prompt=document.querySelector("#ai-prompt").value;
    let context;
    try {context=globalThis.WorkspaceConversationUI.contextOptions();}
    catch(error){aiMessage(error.message,true);return;}
    if(aiSavedProvider==="openai"){
      const launched=globalThis.WorkspaceTraceUI.start({
        text:prompt,effort:document.querySelector("#ai-effort").value,
        maxOutputTokens:Number(document.querySelector("#ai-output-budget").value),
        webSearch:document.querySelector("#ai-web-search").checked,
        ...context
      },async()=>{
        await Promise.all([refreshAI(),refreshOpenAIOffer()]);
      });
      if(!launched)aiMessage("An OpenAI stream is already active.",true);
      else globalThis.WorkspaceConversationUI.resetContext();
      return;
    }
    const output=document.querySelector("#ai-output");output.replaceChildren();
    const stop=document.querySelector("#ai-cancel");
    stop.hidden=false;stop.disabled=false;stop.textContent="Stop request";
    button.disabled=true;aiMessage("Sending your explicit text prompt to the selected provider…");
    globalThis.WorkspaceConversationUI.resetContext();
    try{
      const result=await request({type:"AI_SEND_PROMPT",text:prompt,...context});
      output.textContent=result.result.text;
      if(result.result.truncated)output.append(node("p","quiet","Output preview truncated."));
      const archived=await globalThis.WorkspaceConversationUI.record({
        prompt,answer:result.result.text,provider:result.result.provider,model:result.result.model,
        truncated:result.result.truncated===true
      });
      if(archived){
        output.replaceChildren();
        const field=document.querySelector("#ai-prompt");
        if(field.value===prompt)field.value="";
      }
      aiMessage("Response received · "+result.result.provider+" / "+result.result.model+
        " · "+result.result.contextTurns+" previous exchange(s) used · no Google data fetched.");
    }catch(error){aiMessage(error.message,true);}
    finally{
      stop.hidden=true;stop.disabled=false;stop.textContent="Stop OpenAI generation";
      await refreshAI();
    }
  });
}
function coffeeStatus(message,isError=false){
  const el=document.querySelector("#coffee-status");
  if(!el)return;
  el.textContent=message;
  el.classList.toggle("error",isError);
}
function renderCoffee(data) {
  const host=document.querySelector("#coffee-results");
  if(!host)return;
  host.replaceChildren();
  const summary=node("article","");
  summary.append(node("h3","","Ayarime / Today's Briefing"));
  summary.append(node("p","",
    data.localDate+" · "+data.counts.events+" calendar event(s) · "+
    data.counts.tasks+" incomplete task(s) · "+
    data.counts.highlighted+" items flagged for review"));
  summary.append(node("small","",data.sources.length
    ? "Sources consulted: "+data.sources.join(", ")+"."
    : "No authorized source could be read."));
  if(data.partial) summary.append(node("p","","Partial coverage: some data was unavailable or truncated."));
  host.append(summary);
  const priorities=node("article","");
  priorities.append(node("h3","","Items to review"));
  if(!data.attention.length)priorities.append(node("p","",
    "No items returned from the sources that could be read. This is not a complete account-wide check."));
  for(const item of data.attention) {
    const entry=node("div","coffee-entry");
    entry.append(node("h4","",item.title));
    entry.append(node("p","",item.type==="calendar"
      ? "Calendar · "+item.attention+(item.when?" · "+item.when:"")
      : "Tasks"+(item.list?" / "+item.list:"")+" · "+item.attention));
    if(item.sourceUrl) {
      const open=node("button","mini coffee-link","↗ Open source");
      open.type="button";
      open.addEventListener("click",async()=>{
        open.disabled=true;
        try{await request({type:"OPEN_BRIEFING_SOURCE",url:item.sourceUrl,source:item.type});}
        catch(error){coffeeStatus(error.message,true);}
        finally{open.disabled=false;}
      });
      entry.append(open);
    }
    priorities.append(entry);
  }
  host.append(priorities);
  if(data.connections.length) {
    const linked=node("article","");
    linked.append(node("h3","","Cross-references"));
    for(const connection of data.connections) {
      const entry=node("div","coffee-entry");
      entry.append(node("h4","","Shared Google file reference"));
      entry.append(node("p","",connection.titles.join(" + ")));
      entry.append(node("small","",connection.explanation));
      linked.append(entry);
    }
    host.append(linked);
  }
  if(data.errors.length) {
    const warnings=node("article","");
    warnings.append(node("h3","","Unavailable sources"));
    for(const issue of data.errors)
      warnings.append(node("p","",issue.service+": "+issue.message));
    host.append(warnings);
  }
  const caveats=node("article","");
  caveats.append(node("h3","","Coverage and interpretation"));
  for(const notice of data.notices)caveats.append(node("p","",notice));
  host.append(caveats);
}
const coffeeButton=document.querySelector("#coffee-run");
if(coffeeButton)coffeeButton.addEventListener("click",async()=>{
  const sources={
    calendar:document.querySelector("#coffee-calendar").checked,
    tasks:document.querySelector("#coffee-tasks").checked
  };
  if(!sources.calendar&&!sources.tasks){
    coffeeStatus("Select Calendar and/or Tasks before preparing a briefing.",true);
    return;
  }
  coffeeButton.disabled=true;
  const host=document.querySelector("#coffee-results");
  host.replaceChildren();
  coffeeStatus("Reading only the selected authorized Google sources…");
  try {
    const response=await request({type:"MORNING_COFFEE_PREPARE",sources});
    renderCoffee(response.result);
    coffeeStatus(response.result.partial
      ? "Morning Coffee prepared with incomplete coverage; see warnings below."
      : "Morning Coffee prepared locally. No AI provider or Gmail data was involved.");
  }catch(error){coffeeStatus(error.message,true);}
  finally{coffeeButton.disabled=false;}
});
let updaterState=null;
const updateToggle=document.querySelector("#update-toggle");
function updateMessage(value,failed=false){
  const el=document.querySelector("#update-status");
  if(!el)return;
  el.textContent=value;
  el.classList.toggle("error",failed);
}
function renderUpdater(state){
  if(!updateToggle)return;
  updaterState=state;
  document.querySelector("#update-channel").value=state.channel;
  updateToggle.textContent=state.enabled
    ? "Turn off daily release alerts" : "Enable daily release alerts";
  const check=document.querySelector("#update-check");
  check.disabled=!state.permissionGranted;
  const pane=document.querySelector("#update-available");
  const dismiss=document.querySelector("#update-dismiss");
  const available=state.notice && state.latest;
  pane.hidden=!available;
  dismiss.hidden=!available;
  if(available){
    document.querySelector("#update-title").textContent=
      "Workspace AI "+state.latest.version+" is published (installed: "+state.current+")";
    document.querySelector("#update-notes").textContent=
      (state.latest.title?state.latest.title+" · ":"")+
      (state.latest.notes||"Read the official GitHub release notes before installing.");
    // The background accepts only links within this exact trusted repository.
    document.querySelector("#update-release-link").href=state.latest.url;
  }
  const latest=state.latest?.version;
  if(state.error)updateMessage("Installed "+state.current+" · "+state.error,true);
  else if(state.notice)updateMessage("New published release "+latest+
    " · Notification only; Firefox manages signed installation.");
  else if(state.available)updateMessage("Release "+latest+" dismissed · Installed "+state.current);
  else if(state.checkedAt)updateMessage("Installed "+state.current+
    " · No newer published GitHub Release in this channel.");
  else updateMessage("Installed "+state.current+
    " · "+(state.enabled?"Daily release checks enabled.":"Daily release checks off."));
}
async function refreshUpdater(){
  if(!updateToggle)return;
  try {
    const result=await request({type:"UPDATE_STATUS"});
    renderUpdater(result.update);
  }catch(error){updateMessage(error.message,true);}
}
if(updateToggle){
  updateToggle.addEventListener("click",async()=>{
    if(!updaterState)return;
    const enable=!updaterState.enabled;
    if(enable && !updaterState.permissionGranted){
      let consent;
      try{
        // The Firefox permission request must happen directly from the click.
        consent=browser.permissions.request({origins:["https://api.github.com/*"]});
      }catch(error){updateMessage("Firefox could not request release metadata permission.",true);return;}
      updateMessage("Review Firefox's one-time GitHub release permission prompt…");
      try{
        if(!await consent){updateMessage("Release alerts were not enabled.",true);return;}
      }catch(error){updateMessage("Permission request failed: "+error.message,true);return;}
    }
    updateToggle.disabled=true;
    try{
      const channel=document.querySelector("#update-channel").value;
      const result=await request({type:"UPDATE_CONFIG",enabled:enable,channel});
      renderUpdater(result.update);
      if(enable){
        const fresh=await request({type:"UPDATE_CHECK"});
        renderUpdater(fresh.update);
      }
    }catch(error){updateMessage(error.message,true);}
    finally{updateToggle.disabled=false;}
  });
  document.querySelector("#update-check").addEventListener("click",async event=>{
    const button=event.currentTarget;button.disabled=true;
    updateMessage("Checking lightweight GitHub release metadata…");
    try{
      const result=await request({type:"UPDATE_CHECK"});
      renderUpdater(result.update);
    }catch(error){updateMessage(error.message,true);}
    finally{button.disabled=false;}
  });
  document.querySelector("#update-channel").addEventListener("change",async event=>{
    if(!updaterState)return;
    const choice=event.currentTarget.value;
    try{
      const result=await request({type:"UPDATE_CONFIG",
        enabled:updaterState.enabled,channel:choice});
      renderUpdater(result.update);
    }catch(error){updateMessage(error.message,true);await refreshUpdater();}
  });
  document.querySelector("#update-dismiss").addEventListener("click",async()=>{
    if(!updaterState?.latest)return;
    try{
      const result=await request({type:"UPDATE_IGNORE",version:updaterState.latest.version});
      renderUpdater(result.update);
    }catch(error){updateMessage(error.message,true);}
  });
}
refreshUpdater();
refreshAI();
refreshOpenAIOffer();
refreshGoogle();
refresh();
// Dedicated, local assistant focus route used by the Ayarime Station bridge.
// The fragment never contains user text, API keys or Google account data.
function focusAssistantFromRoute() {
  if (document.body.dataset.view!=="hub" || location.hash!=="#assistant") return;
  const prompt=document.getElementById("ai-prompt");
  if (!prompt) return;
  // The console has provider settings above the composer; bring the actual
  // input into view, with the latest local exchange immediately above it.
  document.getElementById("ai-conversation-list")?.scrollTo({top:document.getElementById("ai-conversation-list").scrollHeight});
  prompt.scrollIntoView({block:"center"});
  prompt.focus({preventScroll:true});
  // Clear the route so a later handoff can focus the same existing Hub again.
  history.replaceState(null,"",location.pathname+location.search);
}
window.addEventListener("hashchange",focusAssistantFromRoute);
document.addEventListener("DOMContentLoaded",focusAssistantFromRoute);

/* Firefox only permits opening native sidebars from direct user gestures.
   This handler is on the companion's own page; no async work runs first. */
const openAssistantSidebar=document.getElementById("ai-open-sidebar");
if(openAssistantSidebar)openAssistantSidebar.addEventListener("click",()=>{
  const message=document.getElementById("ai-sidebar-status");
  if(!browser.sidebarAction?.open) {
    if(message)message.textContent="Sidebar not available in this Firefox build.";
    return;
  }
  try {
    browser.sidebarAction.open().then(
      ()=>{if(message)message.textContent="Ayarime sidebar opened.";},
      ()=>{if(message)message.textContent="Could not open sidebar. Use the Workspace AI toolbar button.";}
    );
  }catch{
    if(message)message.textContent="Could not open sidebar. Use the Workspace AI toolbar button.";
  }
});
