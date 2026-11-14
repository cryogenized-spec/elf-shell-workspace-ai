/* Firefox MV3 background event-page controller: local tab operations only. */
"use strict";
const { DEFAULT_RESOURCES, normalizeResource, matchesTab } = globalThis.WorkspaceUtils;
const STORAGE_KEY = "elfshell.workspace.resources.v1";
const PROFILES_KEY = "elfshell.workspace.profiles.v1";
const GROUP_TITLE = "ELF//SHELL · GOOGLE WORKSPACE";
const MAX_PROFILES = 10;
const MAX_RESOURCES = 80;
const REGISTRY_KEY = "elfshell.workspace.tabRegistry.v1";
const PERSONA_KEY = "elfshell.workspace.persona.v1";
const PERSONA = globalThis.WorkspacePersonaUtils;
let activeOneShot=null;
function cancelOneShot(){
  if(!activeOneShot)return false;
  activeOneShot.abort();
  return true;
}
// Clearing a credential or revoking browser consent must stop an in-flight
// Anthropic/Gemini request; the encrypted/provider account data stay untouched.
browser.storage?.onChanged?.addListener((changes,area)=>{
  if(area==="session" && Object.hasOwn(changes,"elfshell.byok.apiKey.v1") &&
     !changes["elfshell.byok.apiKey.v1"].newValue)cancelOneShot();
});
browser.permissions?.onRemoved?.addListener(()=>{cancelOneShot();});

async function readPersona() {
  const saved=(await browser.storage.local.get(PERSONA_KEY))[PERSONA_KEY];
  return PERSONA.normalize(saved);
}
let ephemeralRegistry = Object.create(null);
// Firefox can initially report a newly opened Google tab as about:blank.
// Keep a session-scoped mapping from saved resource IDs to actual Firefox tab IDs.
async function readRegistry() {
  if (!browser.storage.session) return {...ephemeralRegistry};
  try {
    const stored=(await browser.storage.session.get(REGISTRY_KEY))[REGISTRY_KEY];
    return stored && typeof stored==="object" && !Array.isArray(stored)
      ? {...stored} : {...ephemeralRegistry};
  } catch {
    return {...ephemeralRegistry};
  }
}
async function saveRegistry(entries) {
  ephemeralRegistry={...entries};
  if (browser.storage.session) {
    try {await browser.storage.session.set({[REGISTRY_KEY]:entries});}
    catch(error){console.warn("Session tab index unavailable",error);}
  }
}
function isTrackedTab(resource, tab) {
  if(!tab || tab.incognito || !Number.isInteger(tab.id)) return false;
  if(matchesTab(resource,tab)) return true;
  if(tab.url==="about:blank" || !tab.url) return true; // pre-navigation tab
  try {
    const url=new URL(tab.url);
    return url.protocol==="https:" && (url.hostname==="accounts.google.com" || url.hostname==="workspace.google.com");
  } catch {return false;}
}
function findTab(resource, tabs, registry) {
  const existing=registry[resource.key];
  const tracked=tabs.find(tab=>tab.id===existing);
  if(isTrackedTab(resource,tracked)) return tracked;
  return tabs.find(tab=>!tab.incognito && matchesTab(resource,tab)) || null;
}
let operation = Promise.resolve();

function serialise(action) {
  const next = operation.then(action, action);
  operation = next.catch(() => {});
  return next;
}
function cleanResources(items) {
  const result = [], seen = new Set();
  for (const item of (Array.isArray(items) ? items : []).slice(0,MAX_RESOURCES)) {
    try {
      const valid = normalizeResource(item.name,item.url);
      if (!seen.has(valid.key)) {result.push(valid);seen.add(valid.key);}
    } catch { /* Corrupt settings must never become arbitrary URLs. */ }
  }
  return result;
}
function profileName(raw) {
  const name = String(raw || "").replace(/[\x00-\x1f\x7f]/g,"").trim().replace(/\s+/g," ");
  if (name.length < 1 || name.length > 45) throw new Error("Profile name must contain 1–45 characters");
  return name;
}
async function readProfiles() {
  const saved = await browser.storage.local.get([PROFILES_KEY,STORAGE_KEY]);
  const state = saved[PROFILES_KEY];
  if (state && state.version===1 && Array.isArray(state.profiles) &&
      state.profiles.length>=1 && state.profiles.length<=MAX_PROFILES &&
      state.profiles.some(p=>p.id===state.activeId) &&
      Number.isSafeInteger(state.nextId) && state.nextId>=1)
    return state;
  const legacy = saved[STORAGE_KEY];
  const initial = Array.isArray(legacy) ? legacy : DEFAULT_RESOURCES;
  const migrated = {version:1,activeId:"default",nextId:1,profiles:[
    {id:"default",name:"Google Workspace",resources:cleanResources(initial)}
  ]};
  await browser.storage.local.set({[PROFILES_KEY]:migrated});
  return migrated;
}
function activeProfile(state) {
  const profile = state.profiles.find(item=>item.id===state.activeId);
  if (!profile) throw new Error("Active Workspace profile is unavailable");
  return profile;
}
async function snapshot(state) {
  const value = state || await readProfiles();
  return {
    resources:cleanResources(activeProfile(value).resources),
    activeProfileId:value.activeId,
    profiles:value.profiles.map(item=>({id:item.id,name:item.name,count:item.resources.length})),
    features:{googleApi:false,byok:false,morningCoffee:false,bridge:true}
  };
}
async function resources() {
  const state = await readProfiles();
  return cleanResources(activeProfile(state).resources);
}
async function saveResources(items) {
  const state=await readProfiles();
  activeProfile(state).resources=cleanResources(items);
  await browser.storage.local.set({[PROFILES_KEY]:state});
}
function groupTitle(profile) {
  return profile.id==="default" ? GROUP_TITLE : "ELF//SHELL · " + profile.name.toUpperCase();
}
async function currentWindow() {
  const win = await browser.windows.getLastFocused({windowTypes:["normal"]});
  if (!win || typeof win.id !== "number") throw new Error("No normal Firefox window is available");
  return win;
}
async function ensureHub(windowId) {
  const hubUrl = browser.runtime.getURL("hub.html");
  const all = await browser.tabs.query({});
  let hub = all.find(tab => (tab.url || "").split("#")[0] === hubUrl && !tab.incognito);
  if (!hub) {
    hub = await browser.tabs.create({windowId, url:hubUrl, active:false, pinned:true});
  } else if (!hub.pinned) {
    hub = await browser.tabs.update(hub.id, {pinned:true});
  }
  return hub;
}
async function focusAssistant() {
  // Focus the existing pinned Hub without restoring Google tabs or using an AI key.
  const win = await currentWindow();
  const hub = await ensureHub(win.id);
  const url = browser.runtime.getURL("hub.html") + "#assistant";
  await browser.tabs.update(hub.id, {url,active:true,loadReplace:true});
  await browser.windows.update(hub.windowId, {focused:true});
  return {focused:true,hubTabId:hub.id,view:"assistant"};
}
async function ensureGroup(windowId, ids, title=GROUP_TITLE) {
  const unique = [...new Set(ids)].filter(id=>Number.isInteger(id));
  if (!unique.length) return null;
  const groups = await browser.tabGroups.query({windowId});
  const existing = groups.find(group=>group.title===title);
  const groupId = existing
    ? await browser.tabs.group({tabIds:unique,groupId:existing.id})
    : await browser.tabs.group({tabIds:unique,createProperties:{windowId}});
  await browser.tabGroups.update(groupId,{title,color:"purple",collapsed:false});
  return groupId;
}
async function launchWorkspace() {
  const state = await readProfiles(), profile = activeProfile(state);
  const selection = cleanResources(profile.resources);
  const win = await currentWindow();
  const hub = await ensureHub(win.id);
  const targetWindowId = hub.windowId;
  const all = await browser.tabs.query({});
  const registry = await readRegistry();
  const childIds = [], outsideWindow = [], outsideProfile = [];
  const title = groupTitle(profile);
  const existingGroups = await browser.tabGroups.query({windowId:targetWindowId});
  const ownGroup = existingGroups.find(group=>group.title===title);
  let opened=0,reused=0;
  for (const item of selection) {
    let tab = findTab(item,all.filter(candidate=>candidate.id!==hub.id),registry);
    if (!tab) {
      tab=await browser.tabs.create({windowId:targetWindowId,url:item.url,active:false});
      all.push(tab);opened++;
    } else reused++;
    registry[item.key]=tab.id;
    if (tab.windowId!==targetWindowId || tab.pinned) {
      outsideWindow.push(item.name);
    } else if (Number.isInteger(tab.groupId) && tab.groupId>=0 &&
               (!ownGroup || tab.groupId!==ownGroup.id)) {
      // A Firefox tab belongs to one group. Never steal a tab from a different profile.
      outsideProfile.push(item.name);
    } else childIds.push(tab.id);
  }
  await saveRegistry(registry);
  const groupId = await ensureGroup(targetWindowId,childIds,title);
  await browser.tabs.update(hub.id,{active:true});
  await browser.windows.update(hub.windowId,{focused:true});
  return {opened,reused,groupId,hubTabId:hub.id,outsideWindow,outsideProfile,
    resources:selection.length,profileName:profile.name};
}
async function activateResource(key) {
  const allResources = await resources();
  const wanted = allResources.find(item => item.key === key);
  if (!wanted) throw new Error("This resource is no longer in your workspace");
  const tabs = await browser.tabs.query({});
  const registry = await readRegistry();
  let tab = findTab(wanted,tabs,registry);
  let reused = true;
  if (!tab) {
    const hub = tabs.find(item => item.url === browser.runtime.getURL("hub.html"));
    const win = hub ? {id:hub.windowId} : await currentWindow();
    tab = await browser.tabs.create({windowId:win.id,url:wanted.url,active:true});
    const state=await readProfiles();
    await ensureGroup(win.id,[tab.id],groupTitle(activeProfile(state)));
    reused = false;
  } else {
    await browser.tabs.update(tab.id,{active:true});
  }
  registry[wanted.key]=tab.id;
  await saveRegistry(registry);
  await browser.windows.update(tab.windowId,{focused:true});
  return {reused,tabId:tab.id};
}
async function openBriefingSource(kind,rawUrl) {
  const url=globalThis.WorkspaceMorningCoffee.safeSourceLink(rawUrl,kind);
  if(!url)throw Error("Unsupported Calendar/Tasks source link");
  const tabs=await browser.tabs.query({});
  const found=tabs.find(tab=>!tab.incognito && tab.url===url);
  if(found) {
    await browser.tabs.update(found.id,{active:true});
    await browser.windows.update(found.windowId,{focused:true});
    return {reused:true};
  }
  const win=await currentWindow();
  await browser.tabs.create({windowId:win.id,url,active:true});
  return {reused:false};
}
async function handle(message) {
  try {
    if (!message || typeof message !== "object" || typeof message.type !== "string") {
      throw new Error("Malformed request");
    }
    switch (message.type) {
      case "UPDATE_STATUS":
      case "UPDATE_CONFIG":
      case "UPDATE_CHECK":
      case "UPDATE_IGNORE":
        return await serialise(()=>globalThis.WorkspaceReleaseChecker.handle(browser,fetch,message));
      case "GET_STATE":
        return {ok:true,...await serialise(()=>snapshot())};
      case "AI_OFFER_STATUS":
      case "AI_OFFER_SET_ENROLLMENT":
        return await serialise(()=>globalThis.WorkspaceOpenAIComplimentary.handle(browser,message));
      case "AI_CONTEXT_PREVIEW":
        // Display-only metadata, computed locally from current provider/model.
        return await serialise(()=>globalThis.WorkspaceConversationContext.preview(browser,message));
      case "AI_CONVERSATION_LIST":
      case "AI_CONVERSATION_APPEND":
      case "AI_CONVERSATION_CLEAR":
        // Same-extension only; session transcript is never exposed through the external bridge.
        return await serialise(()=>globalThis.WorkspaceConversationTranscript.handle(browser,message));
      case "AI_CANCEL_REQUEST":
        // Never serialise cancellation behind an in-flight network call.
        return {ok:true,cancelled:cancelOneShot()};
      case "AI_SEND_PROMPT": {
        if(activeOneShot)return {ok:false,error:"An AI request is already active"};
        const controller=new AbortController();
        activeOneShot=controller;
        try{
          // Do not block Forget Key or later cancellation behind the request.
          return await globalThis.WorkspaceBYOKSession.handle(
            browser,fetch,readPersona,message,controller.signal);
        }finally{
          if(activeOneShot===controller)activeOneShot=null;
        }
      }
      case "AI_CLEAR_SESSION_KEY":
        cancelOneShot();
        return await globalThis.WorkspaceBYOKSession.handle(
          browser,fetch,readPersona,message);
      case "AI_STATUS":
      case "AI_SAVE_SETTINGS":
      case "AI_SET_SESSION_KEY":
      case "AI_CHECK_MODEL":
        // This is unavailable to the external core bridge. Explicit only.
        return await serialise(()=>globalThis.WorkspaceBYOKSession.handle(
          browser,fetch,readPersona,message));
      case "MASTER_STATUS":
        // Read only local session metadata. Opening Hub never contacts Worker.
        return {ok:true,master:await globalThis.WorkspaceMasterOAuth.status(browser)};
      case "MASTER_CONNECT":
        // Browser interactive OAuth must never be queued behind an unrelated
        // task or run without the user's separate Firefox permission grant.
        return {ok:true,master:await globalThis.WorkspaceMasterOAuth.connect(
          browser,fetch,crypto)};
      case "MASTER_DISCONNECT":
        return {ok:true,master:await globalThis.WorkspaceMasterOAuth.disconnect(
          browser,fetch)};
      case "MASTER_PROBE": {
        // Explicit Hub button: fetches the read-only operation catalogue
        // without reading Gmail, Tasks, Drive or any Google account data.
        const resource=globalThis.WorkspaceGoogleMasterRead.RESOURCE;
        const client=globalThis.WorkspaceGoogleMasterRead.create({
          resourceUrl:resource,
          hasHostPermission:async()=>globalThis.WorkspaceMasterOAuth.status(browser)
            .then(x=>x.permissionsGranted),
          getAccessToken:()=>globalThis.WorkspaceMasterOAuth.accessToken(browser),
          approveRead:async()=>true,
          fetchImpl:fetch
        });
        const capabilities=await client.capabilities();
        return {ok:true,count:capabilities.length,
          operations:capabilities.map(x=>x.name)};
      }
      case "GOOGLE_AUTH_STATUS":
      case "GOOGLE_AUTH_CONFIG":
      case "GOOGLE_AUTH_SECRET_SET":
      case "GOOGLE_AUTH_SECRET_CLEAR":
      case "GOOGLE_AUTH_PREPARE":
      case "GOOGLE_AUTH_CANCEL":
      case "GOOGLE_AUTH_COMPLETE":
      case "GOOGLE_AUTH_DISCONNECT":
      case "GOOGLE_TEST_ACCESS":
      case "GOOGLE_READ_METADATA":
      case "GOOGLE_READ_OVERVIEW":
      case "GOOGLE_READ_FILE":
      case "MORNING_COFFEE_PREPARE":
        // Only same-extension callers enter this switch; the external ELF//SHELL
        // bridge deliberately cannot invoke Google authorization or data reads.
        return await serialise(async()=>{
          const safe=message.type==="GOOGLE_READ_FILE"
            ? {...message,resource:(await resources()).find(item=>item.key===message.key)}
            : message;
          return globalThis.WorkspaceGoogleSession.handle(safe,browser,fetch,crypto);
        });
      case "GET_PERSONA":
        return {ok:true,persona:await serialise(readPersona)};
      case "SET_PERSONA":
        return {ok:true,persona:await serialise(async()=>{
          const persona=PERSONA.validate({mode:message.mode,customPrompt:message.customPrompt});
          await browser.storage.local.set({[PERSONA_KEY]:persona});
          return persona;
        })};
      case "RESET_PERSONA":
        return {ok:true,persona:await serialise(async()=>{
          const persona={...PERSONA.DEFAULT};
          await browser.storage.local.set({[PERSONA_KEY]:persona});
          return persona;
        })};
      case "CREATE_PROFILE":
        return {ok:true,...await serialise(async()=>{
          const state=await readProfiles(),name=profileName(message.name);
          if (state.profiles.length>=MAX_PROFILES) throw new Error("Maximum 10 Workspace profiles");
          if (state.profiles.some(p=>p.name.toLowerCase()===name.toLowerCase()))
            throw new Error("A Workspace profile with that name already exists");
          const profile={id:"workspace-"+state.nextId++,name,resources:[]};
          state.profiles.push(profile);state.activeId=profile.id;
          await browser.storage.local.set({[PROFILES_KEY]:state});
          return snapshot(state);
        })};
      case "SELECT_PROFILE":
        return {ok:true,...await serialise(async()=>{
          const state=await readProfiles();
          if (!state.profiles.some(p=>p.id===message.id)) throw new Error("Profile not found");
          state.activeId=message.id;
          await browser.storage.local.set({[PROFILES_KEY]:state});
          return snapshot(state);
        })};
      case "RENAME_PROFILE":
        return {ok:true,...await serialise(async()=>{
          const state=await readProfiles(),name=profileName(message.name);
          if (state.profiles.some(p=>p.id!==state.activeId && p.name.toLowerCase()===name.toLowerCase()))
            throw new Error("A Workspace profile with that name already exists");
          activeProfile(state).name=name;
          await browser.storage.local.set({[PROFILES_KEY]:state});
          return snapshot(state);
        })};
      case "DELETE_PROFILE":
        return {ok:true,...await serialise(async()=>{
          const state=await readProfiles();
          if (state.profiles.length===1) throw new Error("At least one Workspace profile is required");
          if (message.id==="default") throw new Error("Default profile cannot be deleted");
          const next=state.profiles.filter(item=>item.id!==message.id);
          if (next.length===state.profiles.length) throw new Error("Profile not found");
          state.profiles=next;
          if (state.activeId===message.id) state.activeId=state.profiles[0].id;
          await browser.storage.local.set({[PROFILES_KEY]:state});
          // Never close tabs or delete Google documents when deleting a saved profile.
          return snapshot(state);
        })};
      case "OPEN_WORKSPACE":
        return {ok:true,result:await serialise(launchWorkspace)};
      case "OPEN_RESOURCE":
        return {ok:true,result:await serialise(() => activateResource(message.key))};
      case "OPEN_BRIEFING_SOURCE":
        return {ok:true,result:await serialise(() => openBriefingSource(message.source,message.url))};
      case "SAVE_RESOURCE":
        return {ok:true,resources:await serialise(async () => {
          const item = normalizeResource(message.name,message.url);
          const current = await resources();
          if (current.some(existing => existing.key === item.key)) throw new Error("This Google resource is already saved");
          if (current.length >= MAX_RESOURCES) throw new Error("Maximum 80 saved resources");
          current.push(item);
          await saveResources(current);
          return current;
        })};
      case "REMOVE_RESOURCE":
        return {ok:true,resources:await serialise(async () => {
          const current = await resources();
          const next = current.filter(item => item.key !== message.key);
          if (next.length === current.length) throw new Error("Resource not found");
          await saveResources(next);
          return next;
        })};
      default:
        throw new Error("Unknown command");
    }
  } catch (error) {
    return {ok:false,error:error instanceof Error ? error.message : "Operation failed"};
  }
}
browser.permissions?.onRemoved?.addListener(()=>{
  // Revocation of the MCP Worker host or data-sharing categories discards
  // MCP OAuth credentials without making a network request.
  globalThis.WorkspaceMasterOAuth.clearOnPermissionChange(browser)
    .catch(()=>console.warn("MCP session permission cleanup unavailable"));
});
browser.runtime.onMessage.addListener((message,sender) => {
  if (sender.id !== browser.runtime.id) return {ok:false,error:"Unauthorized sender"};
  return handle(message);
});
// Versioned, tightly scoped communication with the independently installed ELF//SHELL core.
const CORE_EXTENSION_ID = "elf-shell-ayarime@local.theme";
const BRIDGE_KIND = "elfshell.workspace.bridge";
const BRIDGE_PROTOCOL_VERSION = 1;

async function handleCoreMessage(message, sender) {
  // Manifest restrictions are defense in depth; do not rely on them alone.
  if (!sender || sender.id !== CORE_EXTENSION_ID) {
    return {ok:false, error:"Unauthorized extension sender"};
  }
  if (!message || typeof message !== "object" ||
      message.kind !== BRIDGE_KIND || message.version !== BRIDGE_PROTOCOL_VERSION ||
      typeof message.command !== "string") {
    return {ok:false, error:"Unsupported or malformed bridge protocol"};
  }
  switch (message.command) {
    case "HELLO":
      return {
        ok:true,
        kind:BRIDGE_KIND,
        version:BRIDGE_PROTOCOL_VERSION,
        companionId:browser.runtime.id,
        capabilities:["OPEN_WORKSPACE","OPEN_ASSISTANT","LIST_RESOURCES","OPEN_RESOURCE"],
        dataAccess:"browser-tabs-only"
      };
    case "LIST_RESOURCES":
      return {ok:true, resources:(await resources()).map(item => ({name:item.name,key:item.key}))};
    case "OPEN_WORKSPACE":
      return handle({type:"OPEN_WORKSPACE"});
    case "OPEN_ASSISTANT":
      return {ok:true,result:await serialise(focusAssistant)};
    case "OPEN_RESOURCE":
      if (typeof message.key !== "string" || message.key.length > 250) {
        return {ok:false,error:"Invalid resource identifier"};
      }
      return handle({type:"OPEN_RESOURCE", key:message.key});
    default:
      return {ok:false,error:"Unknown bridge command"};
  }
}
browser.runtime.onMessageExternal.addListener((message, sender) =>
  handleCoreMessage(message, sender).catch(() => ({ok:false,error:"Bridge request failed"}))
);

// Metadata checks are opt-in. Do not register runtime.onUpdateAvailable:
// doing so would defer Firefox's normal signed add-on update installation.
if(browser.alarms?.onAlarm?.addListener){
  browser.alarms.onAlarm.addListener(alarm=>{
    if(alarm.name!==globalThis.WorkspaceReleaseChecker.ALARM)return;
    globalThis.WorkspaceReleaseChecker.status(browser).then(state=>{
      if(state.enabled && state.permissionGranted)
        return globalThis.WorkspaceReleaseChecker.check(browser,fetch);
    }).catch(()=>{});
  });
}
if(browser.runtime.onStartup?.addListener){
  browser.runtime.onStartup.addListener(()=>{
    globalThis.WorkspaceReleaseChecker.syncAlarm(browser).then(()=>
      globalThis.WorkspaceReleaseChecker.badge(browser)).catch(()=>{});
  });
}
if(browser.runtime.onInstalled?.addListener){
  browser.runtime.onInstalled.addListener(()=>{
    globalThis.WorkspaceReleaseChecker.syncAlarm(browser).then(()=>
      globalThis.WorkspaceReleaseChecker.badge(browser)).catch(()=>{});
  });
}
// Dedicated same-extension Port for live OpenAI SSE; legacy one-shot providers are unchanged.
// A Port is used rather than sendMessage because stream deltas arrive over time.
if(browser.runtime.onConnect?.addListener){
  browser.runtime.onConnect.addListener(port=>{
    if(!port||port.name!=="elfshell.openai.trace.v1"||port.sender?.id!==browser.runtime.id){
      try{port?.disconnect();}catch{}
      return;
    }
    let begun=false,finished=false,closed=false,controller=null;
    const send=event=>{
      if(closed||finished)return;
      if(event.kind==="terminal")finished=true;
      try{port.postMessage(event);}catch{closed=true;controller?.abort();}
    };
    port.onMessage.addListener(message=>{
      if(message?.type==="cancel"){
        if(controller&&!finished)controller.abort();
        return;
      }
      if(begun||message?.type!=="start"){
        if(!begun)send({kind:"terminal",status:"failed",message:"Unexpected stream command"});
        return;
      }
      begun=true;
      controller=new AbortController();
      globalThis.WorkspaceOpenAIStream.run({
        browserApi:browser,fetchImpl:fetch,personaLoader:readPersona,
        message,signal:controller.signal,emit:send
      }).catch(error=>{
        // No provider error bodies or secrets enter user-facing diagnostics.
        const cancelled=controller.signal.aborted;
        send({kind:"terminal",status:cancelled?"cancelled":"failed",
          message:cancelled?"Request cancelled":String(error?.message||"OpenAI request failed").slice(0,170)});
      });
    });
    port.onDisconnect.addListener(()=>{closed=true;controller?.abort();});
  });
}
browser.action.onClicked.addListener(() => {
  // This must be called immediately within the user gesture, before awaiting anything.
  if (browser.sidebarAction && browser.sidebarAction.open) {
    browser.sidebarAction.open().catch(() => {});
  }
  serialise(launchWorkspace).catch(error => console.error("Workspace initialization failed:",error));
});