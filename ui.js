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
const GOOGLE_HOST_PERMISSIONS={
  oauth:"https://oauth2.googleapis.com/*",
  calendar:"https://www.googleapis.com/*",
  tasks:"https://tasks.googleapis.com/*",
  docs:"https://docs.googleapis.com/*",
  sheets:"https://sheets.googleapis.com/*"
};
let googleCurrentScopes=[GOOGLE_CALENDAR_SCOPE];
function googleHostsForScopes(scopes) {
  const hosts=[GOOGLE_HOST_PERMISSIONS.oauth];
  if(scopes.includes(GOOGLE_CALENDAR_SCOPE))hosts.push(GOOGLE_HOST_PERMISSIONS.calendar);
  if(scopes.includes(GOOGLE_TASKS_SCOPE))hosts.push(GOOGLE_HOST_PERMISSIONS.tasks);
  if(scopes.includes(GOOGLE_DOCS_SCOPE))hosts.push(GOOGLE_HOST_PERMISSIONS.docs);
  if(scopes.includes(GOOGLE_SHEETS_SCOPE))hosts.push(GOOGLE_HOST_PERMISSIONS.sheets);
  return hosts;
}
let googlePreparedUrl=null;
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
  googleCurrentScopes=[...auth.config.scopes];
  googlePreparedUrl=auth.prepared?.url || null;
  document.querySelector("#google-prepare").disabled=!auth.permissionsGranted || !auth.config.clientId;
  document.querySelector("#google-connect").disabled=!googlePreparedUrl;
  document.querySelector("#google-read").disabled=!auth.connected;
  document.querySelector("#google-disconnect").disabled=!auth.connected;
  googleMessage(auth.connected
    ? "Connected until "+new Date(auth.expiresAt).toLocaleTimeString()+
       " · Granted: "+auth.grantedScopes.map(scope=>
         scope===GOOGLE_DOCS_SCOPE?"Docs":scope===GOOGLE_SHEETS_SCOPE?"Sheets":
         scope===GOOGLE_TASKS_SCOPE?"Tasks":"Calendar").join(", ")
    : auth.prepared
      ? "Authorization prepared. Select Connect Google to open Firefox's sign-in."
      : auth.permissionsGranted
        ? "Google not connected. Save your OAuth client and prepare sign-in."
        : "Google not connected. API host permission must be granted explicitly.");
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
if(googleForm) {
  googleForm.addEventListener("submit",async event=>{
    event.preventDefault();
    const save=googleForm.querySelector('button[type="submit"]');save.disabled=true;
    const scopes=[];
    if(googleForm.querySelector("#google-scope-calendar").checked)scopes.push(GOOGLE_CALENDAR_SCOPE);
    if(googleForm.querySelector("#google-scope-tasks").checked)scopes.push(GOOGLE_TASKS_SCOPE);
    if(googleForm.querySelector("#google-scope-docs").checked)scopes.push(GOOGLE_DOCS_SCOPE);
    if(googleForm.querySelector("#google-scope-sheets").checked)scopes.push(GOOGLE_SHEETS_SCOPE);
    try {
      const r=await request({type:"GOOGLE_AUTH_CONFIG",
        clientId:googleForm.querySelector("#google-client-id").value,scopes});
      showGoogleState(r.auth);
      googleMessage("Configuration saved. Grant browser permission, then prepare sign-in.");
    }catch(error){googleMessage(error.message,true);}
    finally{save.disabled=false;}
  });
  document.querySelector("#google-grant").addEventListener("click",async()=>{
    // Permission must originate from this direct click, before async work.
    let grant;
    try {grant=browser.permissions.request({origins:googleHostsForScopes(googleCurrentScopes)});}
    catch(error){googleMessage("Firefox could not request API host permission.",true);return;}
    googleMessage("Choose Allow or Deny in Firefox's permission dialog…");
    try{
      if(!await grant){googleMessage("Google API permission declined. Nothing was connected.",true);return;}
      await refreshGoogle();
    }catch(error){googleMessage("Permission request failed: "+error.message,true);}
  });
  document.querySelector("#google-prepare").addEventListener("click",async()=>{
    try{
      const r=await request({type:"GOOGLE_AUTH_PREPARE"});
      showGoogleState(r.auth);
    }catch(error){googleMessage(error.message,true);}
  });
  document.querySelector("#google-connect").addEventListener("click",async()=>{
    const url=googlePreparedUrl;
    if(!url){googleMessage("Prepare sign-in first.",true);return;}
    let login;
    try {
      // User gesture must directly call Firefox's identity API.
      login=browser.identity.launchWebAuthFlow({interactive:true,url});
    }catch(error){googleMessage("Firefox sign-in could not open.",true);return;}
    googlePreparedUrl=null;
    document.querySelector("#google-connect").disabled=true;
    googleMessage("Waiting for Google's authorization response…");
    try {
      const callback=await login;
      const r=await request({type:"GOOGLE_AUTH_COMPLETE",callbackUrl:callback});
      showGoogleState(r.auth);
    }catch(error){
      googleMessage("Google sign-in did not complete: "+error.message,true);
      await refreshGoogle();
    }
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
refreshGoogle();
refresh();