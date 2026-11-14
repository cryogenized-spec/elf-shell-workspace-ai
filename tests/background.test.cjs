const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const cryptoApi = require("node:crypto").webcrypto;
const {TextEncoder}=require("node:util");

function createHarness(seed={},options={}) {
  const tabs = [], groups = [], settings = {...seed}, sessionSettings={}, scheduledAlarms={}, badgeState={text:""};
  let tabId = 1, groupId = 1, onMessage = null, onExternal = null, onConnect = null;
  const browser = {
    runtime: {
      id: "workspace-ai@elf-shell.local",
      getURL: name => "moz-extension://fixture/" + name,
      getManifest: () => ({version:"0.14.0"}),
      onMessage: { addListener: callback => { onMessage = callback; } },
      onMessageExternal: { addListener: callback => { onExternal = callback; } },
      onConnect: {addListener: callback => { onConnect = callback; }}
    },
    storage: {
      local: {
        get: async key => Array.isArray(key)
          ? Object.fromEntries(key.map(item=>[item,settings[item]]))
          : ({[key]:settings[key]}),
        set: async values => {Object.assign(settings,values);}
      },
      session: {
        get: async key => Array.isArray(key)
          ? Object.fromEntries(key.map(item=>[item,sessionSettings[item]]))
          : ({[key]:sessionSettings[key]}),
        set: async values => {Object.assign(sessionSettings,values);},
        remove: async keys => {for(const item of (Array.isArray(keys)?keys:[keys]))delete sessionSettings[item];}
      }
    },
    permissions: {
      contains: async ({origins=[],data_collection=[]}) => {
        const isRelease=origins.some(x=>x.includes("api.github.com"));
        const isAi=origins.some(x=>/api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com/.test(x));
        const granted=isRelease ? options.releasePermission : isAi ? options.aiPermission : options.googlePermission;
        const consent=isAi ? (options.aiDataConsent ?? options.aiPermission)
          : (options.googleDataConsent ?? options.googlePermission);
        return Boolean(granted) && (!data_collection.length || Boolean(consent));
      }
    },
    identity: {
      getRedirectURL: () => "https://devredirect.extensions.allizom.org/"
    },
    tabs: {
      query: async () => tabs.map(tab => ({ ...tab })),
      create: async data => {
        const tab = {id: tabId++, windowId: data.windowId || 1,
          url: options.pendingNavigation && data.url.startsWith("https://") ? "about:blank" : data.url,
          active: !!data.active, pinned: !!data.pinned};
        tabs.push(tab); return {...tab};
      },
      update: async (id, patch) => {
        const tab = tabs.find(tab => tab.id === id);
        if (!tab) throw new Error("Tab not found");
        Object.assign(tab, patch); return {...tab};
      },
      group: async ({tabIds, groupId: existing, createProperties}) => {
        let group = groups.find(group => group.id === existing);
        if (!group) {group = {id: groupId++, windowId: createProperties.windowId}; groups.push(group);}
        for (const id of tabIds) {
          const tab = tabs.find(tab => tab.id === id);
          if (!tab || tab.windowId !== group.windowId) throw new Error("Tab group must stay in one window");
          tab.groupId = group.id; tab.pinned = false;
        }
        return group.id;
      }
    },
    tabGroups: {
      query: async ({windowId}) => groups.filter(group => group.windowId === windowId).map(group => ({...group})),
      update: async (id, patch) => Object.assign(groups.find(group => group.id === id), patch)
    },
    windows: {
      getLastFocused: async () => ({id:1}),
      update: async () => ({})
    },
    alarms: {
      create: async (name,rule)=>{scheduledAlarms[name]=rule;},
      clear: async name=>{delete scheduledAlarms[name];return true;},
      onAlarm:{addListener:()=>{}}
    },
    action: { onClicked: {addListener:()=>{}},
      setBadgeText: async ({text})=>{badgeState.text=text;},
      setBadgeBackgroundColor: async ()=>{}
    }
  };
  const fetchCalls=[];
  const mockFetch=async (url,init) => {
    fetchCalls.push({url,init});
    if(typeof options.mockFetch==="function")return options.mockFetch(url,init);
    throw new Error("No Google network request expected in this test");
  };
  const context = vm.createContext({
    browser,URL,URLSearchParams,console,fetch:mockFetch,crypto:cryptoApi,TextEncoder,TextDecoder,btoa,AbortController,Uint8Array,setTimeout,clearTimeout
  });
  for (const file of ["shared/workspace.js","shared/persona.js",
    "google/oauth.js","google/read.js","google/files.js","google/catalog.js","briefing/engine.js","google/session.js","google/master-read-client.js","google/master-oauth.js",
    "ai/providers.js","ai/openai-complimentary.js","diagnostics/connection.js","ai/session.js","ai/openai-stream.js","updater/release.js","updater/checker.js","background.js"]) {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname,"..",file),"utf8"),context,{filename:file});
  }
  return {
    tabs, groups, settings, sessionSettings, scheduledAlarms, badgeState, fetchCalls,
    port: (name="elfshell.openai.trace.v1",sender={id:browser.runtime.id}) => {
      const sent=[];
      let incoming=null,disconnect=null,closed=false;
      const port={
        name,sender,
        onMessage:{addListener:fn=>{incoming=fn;}},
        onDisconnect:{addListener:fn=>{disconnect=fn;}},
        postMessage:msg=>{if(!closed)sent.push(msg);},
        disconnect:()=>{closed=true;disconnect?.();}
      };
      onConnect(port);
      return {sent,send:message=>incoming?.(message),get closed(){return closed;},
        disconnect:()=>port.disconnect()};
    },
    dispatch: async (message, sender={id:browser.runtime.id}) => onMessage(message,sender),
    external: async (message, sender={id:"elf-shell-ayarime@local.theme"}) => onExternal(message,sender)
  };
}
test("repeated Workspace launch reuses tabs and pins only the master", async()=>{
  const h = createHarness();
  const first=await h.dispatch({type:"OPEN_WORKSPACE"});
  assert.equal(first.ok,true); assert.equal(first.result.opened,6);
  assert.equal(h.tabs.filter(tab=>tab.pinned).length,1);
  assert.equal(h.groups.length,1);
  assert.equal(h.groups[0].title,"ELF//SHELL · GOOGLE WORKSPACE");
  const second=await h.dispatch({type:"OPEN_WORKSPACE"});
  assert.equal(second.ok,true); assert.equal(second.result.opened,0);
  assert.equal(second.result.reused,6);
  assert.equal(h.tabs.length,7);
});
test("saved spreadsheet ID is reused and activated, without duplicating", async()=>{
  const h=createHarness();
  const url="https://docs.google.com/spreadsheets/d/WORKSHOP123456/edit";
  const saved=await h.dispatch({type:"SAVE_RESOURCE",name:"Workshop Stock Register",url});
  assert.equal(saved.ok,true);
  const result=await h.dispatch({type:"OPEN_RESOURCE",key:saved.resources.at(-1).key});
  assert.equal(result.ok,true);assert.equal(result.result.reused,false);
  const repeat=await h.dispatch({type:"OPEN_RESOURCE",key:saved.resources.at(-1).key});
  assert.equal(repeat.ok,true);assert.equal(repeat.result.reused,true);
  assert.equal(h.tabs.length,1);
});
test("malformed and external messages fail closed",async()=>{
  const h=createHarness();
  const malformed=await h.dispatch({type:"SAVE_RESOURCE",name:"Bad",url:"https://example.com/"});
  assert.equal(malformed.ok,false);
  const external=await h.dispatch({type:"OPEN_WORKSPACE"},{id:"untrusted@extension"});
  assert.equal(external.ok,false);
  assert.equal(h.tabs.length,0);
});
test("tabs from another browser window are not moved or duplicated",async()=>{
  const h=createHarness();
  await h.dispatch({type:"OPEN_WORKSPACE"});
  const gmail=h.tabs.find(tab=>tab.url.includes("mail.google.com"));
  gmail.windowId=2;
  const second=await h.dispatch({type:"OPEN_WORKSPACE"});
  assert.equal(second.ok,true);
  assert.equal(second.result.opened,0);
  assert.equal(second.result.outsideWindow.includes("Gmail"),true);
  assert.equal(gmail.windowId,2);
});

test("versioned external bridge answers handshake without exposing account data",async()=>{
  const h=createHarness();
  const hello=await h.external({kind:"elfshell.workspace.bridge",version:1,command:"HELLO"});
  assert.equal(hello.ok,true);
  assert.equal(hello.version,1);
  assert.equal(hello.dataAccess,"browser-tabs-only");
  assert.equal(hello.capabilities.includes("OPEN_WORKSPACE"),true);
  assert.equal(h.tabs.length,0);
});
test("bridge rejects untrusted extension IDs and unsupported versions",async()=>{
  const h=createHarness();
  const request={kind:"elfshell.workspace.bridge",version:1,command:"OPEN_WORKSPACE"};
  assert.equal((await h.external(request,{id:"untrusted@example.org"})).ok,false);
  assert.equal((await h.external({...request,version:99})).ok,false);
  assert.equal((await h.external({...request,command:"SEND_EMAIL"})).ok,false);
  assert.equal(h.tabs.length,0);
});
test("trusted ELF//SHELL command restores tabs without duplicate writes",async()=>{
  const h=createHarness();
  const msg={kind:"elfshell.workspace.bridge",version:1,command:"OPEN_WORKSPACE"};
  const one=await h.external(msg);
  assert.equal(one.ok,true);assert.equal(one.result.opened,6);
  const two=await h.external(msg);
  assert.equal(two.ok,true);assert.equal(two.result.opened,0);
  const list=await h.external({...msg,command:"LIST_RESOURCES"});
  assert.equal(list.ok,true);assert.equal(list.resources.length,6);
  assert.equal(list.resources[0].url,undefined);
  assert.equal(h.tabs.length,7);
});

test("new named profile is independent of default workspace and produces a separate group",async()=>{
  const h=createHarness();
  const base=await h.dispatch({type:"OPEN_WORKSPACE"});
  assert.equal(base.ok,true);assert.equal(base.result.opened,6);
  const created=await h.dispatch({type:"CREATE_PROFILE",name:"Workshop"});
  assert.equal(created.ok,true);assert.equal(created.resources.length,0);
  assert.equal(created.profiles.length,2);
  const id=created.activeProfileId;
  const doc=await h.dispatch({type:"SAVE_RESOURCE",name:"Workshop Stock Register",url:"https://docs.google.com/spreadsheets/d/WORKSHOP123456/edit"});
  assert.equal(doc.ok,true);
  const launched=await h.dispatch({type:"OPEN_WORKSPACE"});
  assert.equal(launched.ok,true);assert.equal(launched.result.opened,1);
  assert.equal(launched.result.profileName,"Workshop");
  assert.equal(h.groups.length,2);
  assert.equal(h.groups[1].title,"ELF//SHELL · WORKSHOP");
  const previous=await h.dispatch({type:"SELECT_PROFILE",id:"default"});
  assert.equal(previous.ok,true);assert.equal(previous.resources.length,6);
  const restored=await h.dispatch({type:"SELECT_PROFILE",id});
  assert.equal(restored.ok,true);assert.equal(restored.resources.length,1);
});
test("profiles do not steal tabs already grouped under another profile",async()=>{
  const h=createHarness();
  await h.dispatch({type:"OPEN_WORKSPACE"});
  const original=h.tabs.find(t=>t.url.includes("mail.google.com"));
  const previousGroup=original.groupId;
  await h.dispatch({type:"CREATE_PROFILE",name:"Personal"});
  await h.dispatch({type:"SAVE_RESOURCE",name:"Gmail",url:"https://mail.google.com/mail/u/0/#inbox"});
  const launched=await h.dispatch({type:"OPEN_WORKSPACE"});
  assert.equal(launched.ok,true);
  assert.equal(launched.result.opened,0);
  assert.equal(launched.result.outsideProfile.includes("Gmail"),true);
  assert.equal(original.groupId,previousGroup);
  assert.equal(h.groups.length,1);
});
test("renaming and deleting a profile preserves all open Firefox tabs",async()=>{
  const h=createHarness();
  const a=await h.dispatch({type:"CREATE_PROFILE",name:"Research"});
  assert.equal(a.ok,true);
  const id=a.activeProfileId;
  await h.dispatch({type:"SAVE_RESOURCE",name:"Document",url:"https://docs.google.com/document/d/RESEARCH12345/edit"});
  await h.dispatch({type:"OPEN_WORKSPACE"});
  const before=h.tabs.length;
  const renamed=await h.dispatch({type:"RENAME_PROFILE",name:"Research Archive"});
  assert.equal(renamed.ok,true);
  assert.equal(renamed.profiles.find(p=>p.id===id).name,"Research Archive");
  const removed=await h.dispatch({type:"DELETE_PROFILE",id});
  assert.equal(removed.ok,true);
  assert.equal(removed.activeProfileId,"default");
  assert.equal(removed.profiles.length,1);
  assert.equal(h.tabs.length,before);
  assert.equal((await h.dispatch({type:"DELETE_PROFILE",id:"default"})).ok,false);
});
test("legacy single-profile resource list migrates without losing saved links",async()=>{
  const legacy=[{name:"Legacy Register",url:"https://docs.google.com/spreadsheets/d/LEGACY123456/edit"}];
  const h=createHarness({"elfshell.workspace.resources.v1":legacy});
  const state=await h.dispatch({type:"GET_STATE"});
  assert.equal(state.ok,true);
  assert.equal(state.profiles.length,1);
  assert.equal(state.resources.length,1);
  assert.equal(state.resources[0].name,"Legacy Register");
  assert.equal(h.settings["elfshell.workspace.profiles.v1"].version,1);
  const second=await h.dispatch({type:"GET_STATE"});
  assert.equal(second.resources.length,1);
});
test("profile creation validates names and enforces a maximum of 10",async()=>{
  const h=createHarness();
  assert.equal((await h.dispatch({type:"CREATE_PROFILE",name:"\n\r"})).ok,false);
  assert.equal((await h.dispatch({type:"CREATE_PROFILE",name:"A"})).ok,true);
  assert.equal((await h.dispatch({type:"CREATE_PROFILE",name:"a"})).ok,false);
  for(let i=2;i<=9;i++){
    assert.equal((await h.dispatch({type:"CREATE_PROFILE",name:"Workspace "+i})).ok,true);
  }
  const state=await h.dispatch({type:"GET_STATE"});
  assert.equal(state.profiles.length,10);
  assert.equal((await h.dispatch({type:"CREATE_PROFILE",name:"Extra"})).ok,false);
});

test("pending about:blank Google navigation is reused with zero duplicate tabs",async()=>{
  const h=createHarness({}, {pendingNavigation:true});
  const first=await h.dispatch({type:"OPEN_WORKSPACE"});
  assert.equal(first.ok,true);assert.equal(first.result.opened,6);
  assert(h.tabs.filter(t=>t.url==="about:blank").length===6);
  const second=await h.dispatch({type:"OPEN_WORKSPACE"});
  assert.equal(second.ok,true);
  assert.equal(second.result.opened,0);
  assert.equal(second.result.reused,6);
  assert.equal(h.tabs.length,7);
  const registry=h.sessionSettings["elfshell.workspace.tabRegistry.v1"];
  assert(registry && Object.keys(registry).length===6);
});
test("tracked Google login redirect is reused without opening a duplicate",async()=>{
  const h=createHarness();
  await h.dispatch({type:"OPEN_WORKSPACE"});
  const gmail=h.tabs.find(t=>t.url.includes("mail.google.com"));
  gmail.url="https://accounts.google.com/v3/signin/identifier";
  const again=await h.dispatch({type:"OPEN_WORKSPACE"});
  assert.equal(again.ok,true);
  assert.equal(again.result.opened,0);
  assert.equal(h.tabs.length,7);
});
test("manually navigated unrelated tab is not incorrectly reused",async()=>{
  const h=createHarness();
  await h.dispatch({type:"OPEN_WORKSPACE"});
  const gmail=h.tabs.find(t=>t.url.includes("mail.google.com"));
  gmail.url="https://example.com/";
  const next=await h.dispatch({type:"OPEN_WORKSPACE"});
  assert.equal(next.ok,true);
  assert.equal(next.result.opened,1);
  assert.equal(h.tabs.length,8);
});

test("tracked Gmail and Calendar marketing redirects do not spawn duplicate tabs",async()=>{
  const h=createHarness();
  const initial=await h.dispatch({type:"OPEN_WORKSPACE"});
  assert.equal(initial.ok,true);
  const gmail=h.tabs.find(t=>t.url.includes("mail.google.com"));
  const calendar=h.tabs.find(t=>t.url.includes("calendar.google.com"));
  gmail.url="https://workspace.google.com/intl/en-US/gmail/#inbox";
  calendar.url="https://workspace.google.com/intl/en-US/products/calendar/";
  const repeat=await h.dispatch({type:"OPEN_WORKSPACE"});
  assert.equal(repeat.ok,true);
  assert.equal(repeat.result.opened,0);
  assert.equal(repeat.result.reused,6);
  assert.equal(h.tabs.length,7);
});

test("Ayarime is the default personality and settings remain local",async()=>{
  const h=createHarness();
  const state=await h.dispatch({type:"GET_PERSONA"});
  assert.equal(state.ok,true);
  assert.equal(state.persona.mode,"ayarime");
  assert.equal(state.persona.customPrompt,"");
  assert.equal(h.tabs.length,0);
});
test("professional and custom personas can be stored and reset",async()=>{
  const h=createHarness();
  const neutral=await h.dispatch({type:"SET_PERSONA",mode:"professional",customPrompt:""});
  assert.equal(neutral.ok,true);
  assert.equal((await h.dispatch({type:"GET_PERSONA"})).persona.mode,"professional");
  const custom=await h.dispatch({type:"SET_PERSONA",mode:"custom",customPrompt:"Speak in my usual concise technical style."});
  assert.equal(custom.ok,true);
  assert.equal(custom.persona.customPrompt,"Speak in my usual concise technical style.");
  assert.deepEqual(Object.keys(h.settings["elfshell.workspace.persona.v1"]).sort(),["customPrompt","mode"]);
  const reset=await h.dispatch({type:"RESET_PERSONA"});
  assert.equal(reset.ok,true);
  assert.equal(reset.persona.mode,"ayarime");
  assert.equal(reset.persona.customPrompt,"");
});
test("invalid modes and oversized instructions are rejected without changing settings",async()=>{
  const h=createHarness();
  assert.equal((await h.dispatch({type:"SET_PERSONA",mode:"unrestricted",customPrompt:""})).ok,false);
  assert.equal((await h.dispatch({type:"SET_PERSONA",mode:"custom",customPrompt:" " })).ok,false);
  assert.equal((await h.dispatch({type:"SET_PERSONA",mode:"custom",customPrompt:"X".repeat(6001)})).ok,false);
  assert.equal((await h.dispatch({type:"GET_PERSONA"})).persona.mode,"ayarime");
});
test("external ELF//SHELL bridge cannot modify personality",async()=>{
  const h=createHarness();
  const request={kind:"elfshell.workspace.bridge",version:1,command:"SET_PERSONA",mode:"custom",customPrompt:"Override"};
  const response=await h.external(request);
  assert.equal(response.ok,false);
  assert.equal(h.settings["elfshell.workspace.persona.v1"],undefined);
});

test("Google connector begins disconnected, with zero network activity",async()=>{
  const h=createHarness();
  const auth=await h.dispatch({type:"GOOGLE_AUTH_STATUS"});
  assert.equal(auth.ok,true);
  assert.equal(auth.auth.connected,false);
  assert.equal(auth.auth.permissionsGranted,false);
  assert.equal(auth.auth.config.clientId,"");
  assert.equal(h.fetchCalls.length,0);
  assert.equal((await h.dispatch({type:"GOOGLE_AUTH_PREPARE"})).ok,false);
  assert.equal((await h.dispatch({type:"GOOGLE_READ_OVERVIEW"})).ok,false);
  assert.equal(h.fetchCalls.length,0);
});
test("Google OAuth consent flow uses only session tokens and supports local disconnect",async()=>{
  const client="123456789-abcdefabcdef.apps.googleusercontent.com";
  const cal="https://www.googleapis.com/auth/calendar.events.readonly";
  const task="https://www.googleapis.com/auth/tasks.readonly";
  const h=createHarness({},{
    googlePermission:true,
    mockFetch:async(url,init)=>{
      if(url==="https://oauth2.googleapis.com/token") {
        assert.equal(init.method,"POST");
        assert(init.body.includes("code_verifier="));
        assert.equal(new URLSearchParams(init.body).get("client_secret"),
          "GOCSPX-fixture-only-123456789");
        return {ok:true,status:200,json:async()=>({
          access_token:"access_mock_valid_token",token_type:"Bearer",expires_in:3600,
          scope:cal+" "+task,refresh_token:"SECRET_REFRESH_TOKEN_NEVER_STORED"
        })};
      }
      if(url==="https://oauth2.googleapis.com/revoke")
        return {ok:true,status:200};
      if(url.includes("/calendar/v3/"))
        return {ok:true,status:200,json:async()=>({items:[{id:"evt",summary:"Supplier meeting",
          start:{dateTime:"2026-11-07T14:00:00+02:00"}}]})};
      if(url.includes("/users/@me/lists"))
        return {ok:true,status:200,json:async()=>({items:[{id:"list1",title:"Today"}]})};
      if(url.includes("/lists/list1/tasks"))
        return {ok:true,status:200,json:async()=>({items:[{id:"tsk",title:"Check inventory"}]})};
      throw Error("Unexpected Google endpoint "+url);
    }
  });
  const set=await h.dispatch({type:"GOOGLE_AUTH_CONFIG",clientId:client,scopes:[cal,task]});
  assert.equal(set.ok,true);
  assert.equal(set.auth.connected,false);
  assert.equal(set.auth.config.clientId,client);
  const savedSecret=await h.dispatch({type:"GOOGLE_AUTH_SECRET_SET",
    secret:"GOCSPX-fixture-only-123456789"});
  assert.equal(savedSecret.ok,true,savedSecret.error);
  assert.equal(savedSecret.auth.hasDesktopSecret,true);
  assert(!JSON.stringify(savedSecret).includes("GOCSPX-fixture-only-123456789"));
  const prepare=await h.dispatch({type:"GOOGLE_AUTH_PREPARE"});
  assert.equal(prepare.ok,true,prepare.error);
  const auth=new URL(prepare.auth.prepared.url);
  assert.equal(auth.hostname,"accounts.google.com");
  assert.equal(auth.searchParams.get("code_challenge_method"),"S256");
  assert.equal(h.fetchCalls.length,0,"Preparing must not contact Google");
  const state=auth.searchParams.get("state");
  const callback="http://127.0.0.1/mozoauth2/devredirect?state="+state+"&code=mock_authorization_code";
  assert.equal((await h.dispatch({type:"GOOGLE_AUTH_COMPLETE",callbackUrl:callback.replace(state,"WRONG")})).ok,false);
  assert.equal(h.fetchCalls.length,0,"Wrong state must never reach token endpoint");
  const connected=await h.dispatch({type:"GOOGLE_AUTH_COMPLETE",callbackUrl:callback});
  assert.equal(connected.ok,true,connected.error);
  assert.equal(connected.auth.connected,true);
  assert.deepEqual([...connected.auth.grantedScopes].sort(),[cal,task].sort());
  assert.equal(JSON.stringify(connected).includes("access_mock_valid_token"),false);
  assert.equal(JSON.stringify(h.settings).includes("access_mock_valid_token"),false);
  assert.equal(JSON.stringify(h.sessionSettings).includes("SECRET_REFRESH_TOKEN_NEVER_STORED"),false);
  const read=await h.dispatch({type:"GOOGLE_READ_OVERVIEW"});
  assert.equal(read.ok,true,read.error);
  assert.equal(read.result.calendar.events[0].title,"Supplier meeting");
  assert.equal(read.result.tasks.lists[0].tasks[0].title,"Check inventory");
  assert(h.fetchCalls.filter(x=>x.init.method==="GET").length===3);
  const done=await h.dispatch({type:"GOOGLE_AUTH_DISCONNECT"});
  assert.equal(done.ok,true);
  assert.equal(done.result.serverRevoked,true);
  assert.equal((await h.dispatch({type:"GOOGLE_AUTH_STATUS"})).auth.connected,false);
  assert.equal(h.sessionSettings["elfshell.google.sessionToken.v1"],undefined);
  assert.equal(h.sessionSettings["elfshell.google.desktopClientSecret.v1"],undefined);
});
test("stuck Google OAuth can be reset without token exchange or lost existing access",async()=>{
  const calendar="https://www.googleapis.com/auth/calendar.events.readonly";
  const client="123456789-abcdefabcdef.apps.googleusercontent.com";
  const h=createHarness({}, {googlePermission:true,mockFetch:async()=>{
    throw Error("No Google network call allowed for OAuth reset");
  }});
  await h.dispatch({type:"GOOGLE_AUTH_CONFIG",clientId:client,scopes:[calendar]});
  await h.dispatch({type:"GOOGLE_AUTH_SECRET_SET",
    secret:"GOCSPX-fixture-reset-123456789"});
  const prep=await h.dispatch({type:"GOOGLE_AUTH_PREPARE"});
  assert.equal(prep.ok,true,prep.error);
  const pending=h.sessionSettings["elfshell.google.pending.v1"];
  assert(pending&&pending.state);
  const stale="http://127.0.0.1/mozoauth2/devredirect?state="+
    encodeURIComponent(pending.state)+"&code=OLD_SINGLE_USE_AUTHORIZATION_CODE";
  // An already connected session must survive an unrelated, stuck reauthorization.
  const token={accessToken:"TEST_EXISTING_ACCESS_TOKEN",expiresAt:Date.now()+100000,
    scopes:[calendar]};
  h.sessionSettings["elfshell.google.sessionToken.v1"]=token;
  const reset=await h.dispatch({type:"GOOGLE_AUTH_CANCEL"});
  assert.equal(reset.ok,true,reset.error);
  assert.equal(reset.auth.prepared,null);
  assert.equal(reset.auth.connected,true);
  assert.equal(h.sessionSettings["elfshell.google.pending.v1"],undefined);
  assert.equal(h.sessionSettings["elfshell.google.sessionToken.v1"],token);
  assert.equal(h.fetchCalls.length,0);
  const late=await h.dispatch({type:"GOOGLE_AUTH_COMPLETE",callbackUrl:stale});
  assert.equal(late.ok,false);
  assert.equal(h.fetchCalls.length,0);
  assert.equal(h.sessionSettings["elfshell.google.sessionToken.v1"],token);
  // A fresh prepare gets a new challenge without requiring another Cloud project.
  const next=await h.dispatch({type:"GOOGLE_AUTH_PREPARE"});
  assert.equal(next.ok,true);
  assert.notEqual(h.sessionSettings["elfshell.google.pending.v1"].state,pending.state);
});
test("core bridge cannot reset or complete Google OAuth",async()=>{
  const h=createHarness();
  const reset=await h.external({kind:"elfshell.workspace.bridge",version:1,
    command:"GOOGLE_AUTH_CANCEL"});
  assert.equal(reset.ok,false);
  const complete=await h.external({kind:"elfshell.workspace.bridge",version:1,
    command:"GOOGLE_AUTH_COMPLETE",callbackUrl:"http://127.0.0.1/mozoauth2/test?code=SENSITIVE"});
  assert.equal(complete.ok,false);
});
test("external ELF//SHELL core cannot read Google account information",async()=>{
  const h=createHarness({}, {googlePermission:true});
  const request={kind:"elfshell.workspace.bridge",version:1,command:"GOOGLE_READ_OVERVIEW"};
  assert.equal((await h.external(request)).ok,false);
  assert.equal(h.fetchCalls.length,0);
});

test("saved Docs and Sheets previews require correct scope and read-only permission",async()=>{
  const docUrl="https://docs.google.com/document/d/DOC9876543210/edit";
  const fileUrl="https://docs.google.com/spreadsheets/d/SHEET9876543210/edit#gid=42";
  const h=createHarness({}, {googlePermission:true,mockFetch:async(url,opts)=>{
    assert.equal(opts.method,"GET");
    if(url.includes("docs.googleapis.com")) return {ok:true,status:200,json:async()=>({
      title:"Supplier Notes",tabs:[{documentTab:{body:{content:[{
        paragraph:{elements:[{textRun:{content:"Follow up with supplier."}}]}
      }]}}}]})};
    if(url.includes("sheets.googleapis.com") && url.includes("/values/"))
      return {ok:true,status:200,json:async()=>({values:[["Product","Qty"],["P-50","8"]]})};
    if(url.includes("sheets.googleapis.com"))return {ok:true,status:200,json:async()=>({
      properties:{title:"Stock"},sheets:[{properties:{sheetId:42,title:"Main"}}]})};
    throw Error("Unexpected network call");
  }});
  const doc=await h.dispatch({type:"SAVE_RESOURCE",name:"Supplier Notes",url:docUrl});
  const sheet=await h.dispatch({type:"SAVE_RESOURCE",name:"Stock Register",url:fileUrl});
  assert.equal(doc.ok,true);assert.equal(sheet.ok,true);
  const id="file:document:DOC9876543210",sid="file:spreadsheets:SHEET9876543210";
  const noToken=await h.dispatch({type:"GOOGLE_READ_FILE",key:id});
  assert.equal(noToken.ok,false);assert.equal(h.fetchCalls.length,0);
  h.sessionSettings["elfshell.google.sessionToken.v1"]={
    accessToken:"test_access_token",expiresAt:Date.now()+300000,
    scopes:["https://www.googleapis.com/auth/documents.readonly",
            "https://www.googleapis.com/auth/spreadsheets.readonly"]
  };
  const docRead=await h.dispatch({type:"GOOGLE_READ_FILE",key:id});
  assert.equal(docRead.ok,true,docRead.error);
  assert.equal(docRead.result.title,"Supplier Notes");
  assert(docRead.result.text.includes("Follow up"));
  const sheetRead=await h.dispatch({type:"GOOGLE_READ_FILE",key:sid,range:"A1:B2"});
  assert.equal(sheetRead.ok,true,sheetRead.error);
  assert.equal(sheetRead.result.sheet,"Main");
  assert.equal(sheetRead.result.rows[1][1],"8");
  assert.equal(h.fetchCalls.length,3);
  const notSaved=await h.dispatch({type:"GOOGLE_READ_FILE",key:"file:document:UNSAVED123456"});
  assert.equal(notSaved.ok,false);
  assert.equal(h.fetchCalls.length,3);
  const invalidRange=await h.dispatch({type:"GOOGLE_READ_FILE",key:sid,range:"A1:ZZ9999"});
  assert.equal(invalidRange.ok,false);
  assert.equal(h.fetchCalls.length,3);
  const outside=await h.external({kind:"elfshell.workspace.bridge",version:1,command:"GOOGLE_READ_FILE",key:id});
  assert.equal(outside.ok,false);assert.equal(h.fetchCalls.length,3);
});
test("Google file scopes are optional and rejected if API origin was not approved",async()=>{
  const h=createHarness({}, {googlePermission:false});
  const client="123456789-abcdefabcdef.apps.googleusercontent.com";
  const scope="https://www.googleapis.com/auth/documents.readonly";
  const saved=await h.dispatch({type:"GOOGLE_AUTH_CONFIG",clientId:client,scopes:[scope]});
  assert.equal(saved.ok,true,saved.error);
  assert.equal(saved.auth.permissionsGranted,false);
  assert.equal((await h.dispatch({type:"GOOGLE_AUTH_PREPARE"})).ok,false);
  await h.dispatch({type:"SAVE_RESOURCE",name:"Document",url:"https://docs.google.com/document/d/DOC9876543210/edit"});
  h.sessionSettings["elfshell.google.sessionToken.v1"]={accessToken:"test",expiresAt:Date.now()+300000,scopes:[scope]};
  assert.equal((await h.dispatch({type:"GOOGLE_READ_FILE",key:"file:document:DOC9876543210"})).ok,false);
  assert.equal(h.fetchCalls.length,0);
});

test("BYOK requires explicit host consent and a session key",async()=>{
  const h=createHarness();
  const state=await h.dispatch({type:"AI_STATUS"});
  assert.equal(state.ok,true);
  assert.equal(state.ai.provider,"openai");
  assert.equal(state.ai.hasSessionKey,false);
  assert.equal(state.ai.hostGranted,false);
  assert.equal(state.ai.googleDataIncluded,false);
  assert.equal((await h.dispatch({type:"AI_SEND_PROMPT",text:"Hello"})).ok,false);
  assert.equal((await h.dispatch({type:"AI_SET_SESSION_KEY",key:"sk-TEST123456"})).ok,false);
  assert.equal(h.fetchCalls.length,0);
});
test("BYOK sends only the submitted text and persona, with key in session only",async()=>{
  const h=createHarness({}, {aiPermission:true,mockFetch:async(url,opts)=>{
    assert.equal(url,"https://api.openai.com/v1/responses");
    assert.equal(opts.method,"POST");
    assert.equal(opts.credentials,"omit");
    const body=JSON.parse(opts.body);
    assert.equal(body.input,"Ayarime, hello");
    assert.equal(body.store,false);
    assert.equal(body.tools,undefined);
    assert(body.instructions.includes("Ayarime"));
    return {ok:true,status:200,json:async()=>({output:[{content:[{type:"output_text",text:"Ready to assist."}]}]})};
  }});
  const save=await h.dispatch({type:"AI_SET_SESSION_KEY",key:"sk-TEST123456"});
  assert.equal(save.ok,true,save.error);
  assert.equal(save.ai.hasSessionKey,true);
  assert.equal(JSON.stringify(save).includes("sk-TEST"),false);
  assert.equal(JSON.stringify(h.settings).includes("sk-TEST"),false);
  assert.equal(h.sessionSettings["elfshell.byok.apiKey.v1"].key,"sk-TEST123456");
  const output=await h.dispatch({type:"AI_SEND_PROMPT",text:"Ayarime, hello"});
  assert.equal(output.ok,true,output.error);
  assert.equal(output.result.text,"Ready to assist.");
  assert.equal(h.fetchCalls.length,1);
  const removed=await h.dispatch({type:"AI_CLEAR_SESSION_KEY"});
  assert.equal(removed.ok,true);
  assert.equal(h.sessionSettings["elfshell.byok.apiKey.v1"],undefined);
});
test("switching BYOK provider removes old key and external core cannot invoke models",async()=>{
  const h=createHarness({}, {aiPermission:true});
  await h.dispatch({type:"AI_SET_SESSION_KEY",key:"sk-TEST123456"});
  const changed=await h.dispatch({type:"AI_SAVE_SETTINGS",provider:"gemini",model:"gemini-3.8-flash"});
  assert.equal(changed.ok,true);
  assert.equal(changed.ai.hasSessionKey,false);
  assert.equal(h.sessionSettings["elfshell.byok.apiKey.v1"],undefined);
  const external=await h.external({kind:"elfshell.workspace.bridge",version:1,command:"AI_SEND_PROMPT",text:"secret"});
  assert.equal(external.ok,false);
  assert.equal(h.fetchCalls.length,0);
});

test("Morning Coffee never reads sources until explicitly requested",async()=>{
  const h=createHarness({}, {googlePermission:true,mockFetch:async()=>{throw Error("No implicit requests permitted");}});
  await h.dispatch({type:"GET_STATE"});
  await h.dispatch({type:"GOOGLE_AUTH_STATUS"});
  await h.dispatch({type:"AI_STATUS"});
  assert.equal(h.fetchCalls.length,0);
  assert.equal((await h.dispatch({type:"MORNING_COFFEE_PREPARE",sources:{}})).ok,false);
  assert.equal((await h.dispatch({type:"MORNING_COFFEE_PREPARE",sources:{calendar:true}})).ok,false);
  assert.equal(h.fetchCalls.length,0);
});
test("Morning Coffee reads only Calendar when explicitly selected, no AI calls",async()=>{
  const calendar="https://www.googleapis.com/auth/calendar.events.readonly";
  const tasks="https://www.googleapis.com/auth/tasks.readonly";
  const h=createHarness({}, {googlePermission:true,mockFetch:async(url,init)=>{
    assert(url.includes("/calendar/v3/calendars/primary/events"),"Wrong endpoint "+url);
    assert.equal(init.method,"GET");
    return {ok:true,status:200,json:async()=>({items:[
      {id:"evt1",summary:"Supplier coordination",description:
       "Reference https://docs.google.com/document/d/DOC123456789/edit",
       htmlLink:"https://www.google.com/calendar/event?eid=test",
       start:{dateTime:"2026-11-07T10:00:00+02:00"},status:"confirmed"}
    ]})};
  }});
  h.sessionSettings["elfshell.google.sessionToken.v1"]={
    accessToken:"session_test_token",expiresAt:Date.now()+300000,scopes:[calendar,tasks]
  };
  const r=await h.dispatch({type:"MORNING_COFFEE_PREPARE",sources:{calendar:true,tasks:false}});
  assert.equal(r.ok,true,r.error);
  assert.equal(h.fetchCalls.length,1);
  assert.equal(r.result.sources.length,1);
  assert.equal(r.result.sources[0],"Calendar");
  assert.equal(r.result.attention[0].sourceUrl,"https://www.google.com/calendar/event?eid=test");
  assert.equal(r.result.aiUsed,false);
  assert.equal(r.result.gmailIncluded,false);
  assert(!JSON.stringify(r.result).includes("session_test_token"));
  assert(!JSON.stringify(h.settings).includes("Supplier coordination"));
  assert(!JSON.stringify(h.sessionSettings).includes("Supplier coordination"));
});
test("Morning Coffee gracefully identifies missing Tasks scope without fetching",async()=>{
  const calendar="https://www.googleapis.com/auth/calendar.events.readonly";
  const h=createHarness({}, {googlePermission:true,mockFetch:async()=>{throw Error("No calls permitted");}});
  h.sessionSettings["elfshell.google.sessionToken.v1"]={
    accessToken:"session_test_token",expiresAt:Date.now()+300000,scopes:[calendar]
  };
  const result=await h.dispatch({type:"MORNING_COFFEE_PREPARE",sources:{calendar:false,tasks:true}});
  assert.equal(result.ok,true,result.error);
  assert.equal(result.result.partial,true);
  assert.equal(result.result.sources.length,0);
  assert.equal(result.result.errors[0].service,"Tasks");
  assert.equal(h.fetchCalls.length,0);
});
test("external ELF//SHELL bridge cannot prepare Morning Coffee or open arbitrary evidence links",async()=>{
  const h=createHarness();
  const envelope={kind:"elfshell.workspace.bridge",version:1};
  assert.equal((await h.external({...envelope,command:"MORNING_COFFEE_PREPARE",
    sources:{calendar:true,tasks:true}})).ok,false);
  assert.equal((await h.external({...envelope,command:"OPEN_BRIEFING_SOURCE",
    source:"calendar",url:"https://www.google.com/calendar/event?eid=1"})).ok,false);
  assert.equal(h.fetchCalls.length,0);
  assert.equal(h.tabs.length,0);
});
test("same-extension source navigation reuses safe Calendar URL and blocks hostile links",async()=>{
  const h=createHarness();
  const url="https://www.google.com/calendar/event?eid=sample";
  const first=await h.dispatch({type:"OPEN_BRIEFING_SOURCE",source:"calendar",url});
  assert.equal(first.ok,true,first.error);
  assert.equal(first.result.reused,false);
  const second=await h.dispatch({type:"OPEN_BRIEFING_SOURCE",source:"calendar",url});
  assert.equal(second.ok,true);assert.equal(second.result.reused,true);
  assert.equal(h.tabs.length,1);
  const evil=await h.dispatch({type:"OPEN_BRIEFING_SOURCE",source:"calendar",
    url:"https://www.google.com.evil.invalid/calendar/event?eid=hack"});
  assert.equal(evil.ok,false);
  assert.equal(h.tabs.length,1);
});

test("release alerts default off and do not call GitHub without opt-in",async()=>{
  const h=createHarness();
  const status=await h.dispatch({type:"UPDATE_STATUS"});
  assert.equal(status.ok,true,status.error);
  assert.equal(status.update.current,"0.14.0");
  assert.equal(status.update.enabled,false);
  assert.equal(status.update.permissionGranted,false);
  assert.equal(status.update.notice,false);
  assert.equal(h.fetchCalls.length,0);
  assert.equal(Object.keys(h.scheduledAlarms).length,0);
  assert.equal((await h.dispatch({type:"UPDATE_CONFIG",enabled:true,channel:"stable"})).ok,false);
  assert.equal((await h.dispatch({type:"UPDATE_CHECK"})).ok,false);
  assert.equal(h.fetchCalls.length,0);
});
test("opt-in release feed shows a badge but never downloads or installs an extension",async()=>{
  const U=require("../updater/release.js");
  const h=createHarness({}, {releasePermission:true,mockFetch:async(url,options)=>{
    assert.equal(url,U.API_URL);assert.equal(options.method,"GET");
    assert.equal(options.credentials,"omit");
    assert.equal(options.redirect,"error");
    return {ok:true,status:200,json:async()=>[{
      tag_name:"v0.14.1",html_url:U.RELEASE_PREFIX+"v0.14.1",
      draft:false,prerelease:false,name:"Small fixes",body:"Better performance"
    }]};
  }});
  const configured=await h.dispatch({type:"UPDATE_CONFIG",enabled:true,channel:"stable"});
  assert.equal(configured.ok,true,configured.error);
  assert.equal(configured.update.enabled,true);
  assert.equal(Object.values(h.scheduledAlarms)[0].periodInMinutes,1440);
  assert.equal(h.fetchCalls.length,0);
  const checked=await h.dispatch({type:"UPDATE_CHECK"});
  assert.equal(checked.ok,true,checked.error);
  assert.equal(checked.update.notice,true);
  assert.equal(checked.update.latest.version,"v0.14.1");
  assert.equal(h.badgeState.text,"1");
  assert.equal(h.fetchCalls.length,1);
  assert(h.fetchCalls[0].url.includes("/releases?per_page=10"));
  const ignored=await h.dispatch({type:"UPDATE_IGNORE",version:"v0.14.1"});
  assert.equal(ignored.ok,true);
  assert.equal(ignored.update.notice,false);
  assert.equal(h.badgeState.text,"");
  const disabled=await h.dispatch({type:"UPDATE_CONFIG",enabled:false,channel:"stable"});
  assert.equal(disabled.ok,true);
  assert.equal(Object.keys(h.scheduledAlarms).length,0);
});
test("release checks accept preview channel but external core cannot check or configure updates",async()=>{
  const U=require("../updater/release.js");
  const h=createHarness({}, {releasePermission:true,mockFetch:async()=>({
    ok:true,status:200,json:async()=>[
      {tag_name:"v0.14.2-beta.1",html_url:U.RELEASE_PREFIX+"v0.14.2-beta.1",
        draft:false,prerelease:true,name:"Preview",body:"Improvements"}
    ]})});
  await h.dispatch({type:"UPDATE_CONFIG",enabled:true,channel:"stable"});
  const stable=await h.dispatch({type:"UPDATE_CHECK"});
  assert.equal(stable.update.notice,false);
  await h.dispatch({type:"UPDATE_CONFIG",enabled:true,channel:"preview"});
  const preview=await h.dispatch({type:"UPDATE_CHECK"});
  assert.equal(preview.update.latest.version,"v0.14.2-beta.1");
  assert.equal(preview.update.notice,true);
  const external=await h.external({kind:"elfshell.workspace.bridge",version:1,command:"UPDATE_CHECK"});
  assert.equal(external.ok,false);
});
test("private or unpublished releases return an honest status, never a phantom download",async()=>{
  const h=createHarness({}, {releasePermission:true,mockFetch:async()=>({ok:false,status:404})});
  await h.dispatch({type:"UPDATE_CONFIG",enabled:true,channel:"stable"});
  const result=await h.dispatch({type:"UPDATE_CHECK"});
  assert.equal(result.ok,true);
  assert.equal(result.update.available,false);
  assert.match(result.update.error,/No public GitHub release/);
});

test("Google account access is blocked if data-sharing consent is missing despite API host permission",async()=>{
  const h=createHarness({}, {googlePermission:true,googleDataConsent:false});
  const scope="https://www.googleapis.com/auth/calendar.events.readonly";
  const client="123456789-abcdefabcdef.apps.googleusercontent.com";
  const config=await h.dispatch({type:"GOOGLE_AUTH_CONFIG",clientId:client,scopes:[scope]});
  assert.equal(config.ok,true);
  assert.equal(config.auth.permissionsGranted,false);
  const refused=await h.dispatch({type:"GOOGLE_AUTH_PREPARE"});
  assert.equal(refused.ok,false);
  assert.equal(h.fetchCalls.length,0);
});
test("BYOK model calls are blocked when optional data permission is revoked",async()=>{
  const h=createHarness({}, {aiPermission:true,aiDataConsent:false});
  const s=await h.dispatch({type:"AI_STATUS"});
  assert.equal(s.ok,true);
  assert.equal(s.ai.hostGranted,false);
  assert.equal((await h.dispatch({type:"AI_SET_SESSION_KEY",key:"sk-TEST123456"})).ok,false);
  h.sessionSettings["elfshell.byok.apiKey.v1"]={provider:"openai",key:"sk-TEST123456"};
  assert.equal((await h.dispatch({type:"AI_SEND_PROMPT",text:"Hello"})).ok,false);
  assert.equal(h.fetchCalls.length,0);
});

test("AI_CHECK_MODEL refuses to use a key before provider and data consent",async()=>{
  const h=createHarness({}, {aiPermission:true,aiDataConsent:false});
  h.sessionSettings["elfshell.byok.apiKey.v1"]={provider:"openai",key:"sk_TEST_123456"};
  const result=await h.dispatch({type:"AI_CHECK_MODEL"});
  assert.equal(result.ok,false);
  assert.equal(h.fetchCalls.length,0);
});
test("AI_CHECK_MODEL uses a GET for exactly one chosen model and returns no key",async()=>{
  const h=createHarness({}, {aiPermission:true,mockFetch:async(url,init)=>{
    assert.equal(url,"https://api.openai.com/v1/models/gpt-5.4-mini");
    assert.equal(init.method,"GET");
    assert.equal(init.body,undefined);
    return {ok:true,status:200,json:async()=>({id:"gpt-5.4-mini",object:"model",
      extraSecret:"should-not-surface"})};
  }});
  h.sessionSettings["elfshell.byok.apiKey.v1"]={provider:"openai",key:"sk_TEST_123456"};
  const result=await h.dispatch({type:"AI_CHECK_MODEL"});
  assert.equal(result.ok,true,result.error);
  assert.equal(result.result.ok,true);
  assert.equal(result.result.modelId,"gpt-5.4-mini");
  assert.equal(h.fetchCalls.length,1);
  assert(!JSON.stringify(result).includes("sk_TEST_123456"));
  assert(!JSON.stringify(result).includes("should-not-surface"));
});
test("GOOGLE_TEST_ACCESS returns only read-only API status after explicit request",async()=>{
  const cal="https://www.googleapis.com/auth/calendar.events.readonly";
  const h=createHarness({}, {googlePermission:true,mockFetch:async(url,init)=>{
    assert(url.includes("/calendar/v3/calendars/primary/events"));
    assert.equal(init.method,"GET");
    return {ok:true,status:200,json:async()=>{throw Error("Account data should not be parsed");}};
  }});
  h.sessionSettings["elfshell.google.sessionToken.v1"]={
    accessToken:"GOOGLE_TEST_SECRET",expiresAt:Date.now()+300000,scopes:[cal]
  };
  const result=await h.dispatch({type:"GOOGLE_TEST_ACCESS",sources:{calendar:true,tasks:false}});
  assert.equal(result.ok,true,result.error);
  assert.equal(result.result.allPassed,true);
  assert.equal(h.fetchCalls.length,1);
  assert(!JSON.stringify(result).includes("GOOGLE_TEST_SECRET"));
  const outsider=await h.external({
    kind:"elfshell.workspace.bridge",version:1,command:"GOOGLE_TEST_ACCESS",
    sources:{calendar:true}
  });
  assert.equal(outsider.ok,false);
});

test("OpenAI Port is available only to this extension and denies unconsented requests",async()=>{
  const h=createHarness();
  const hostile=h.port("elfshell.openai.trace.v1",{id:"untrusted@extension"});
  assert.equal(hostile.closed,true);
  const p=h.port();
  p.send({type:"start",text:"Hello",effort:"medium",webSearch:false});
  for(let i=0;i<20&&!p.sent.length;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(p.sent.at(-1).kind,"terminal");
  assert.equal(p.sent.at(-1).status,"failed");
  assert.equal(h.fetchCalls.length,0);
});
test("OpenAI Port emits real summary and answer events, without secrets",async()=>{
  const h=createHarness({}, {aiPermission:true,mockFetch:async(url,init)=>{
    assert.equal(url,"https://api.openai.com/v1/responses");
    assert.equal(init.method,"POST");
    assert.equal(JSON.parse(init.body).stream,true);
    const data=[
      'data: {"type":"response.created"}\n\n',
      'data: {"type":"response.reasoning_summary_text.delta","item_id":"rs","summary_index":0,"delta":"Verified"}\n\n',
      'data: {"type":"response.output_text.delta","item_id":"msg","content_index":0,"delta":"Done"}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":4,"output_tokens":5}}}\n\n'
    ].join("");
    return {ok:true,status:200,body:new ReadableStream({
      start(ctrl){ctrl.enqueue(new TextEncoder().encode(data));ctrl.close();}
    })};
  }});
  h.sessionSettings["elfshell.byok.apiKey.v1"]={provider:"openai",key:"sk_TEST_SECRET_VALUE"};
  const p=h.port();
  p.send({type:"start",text:"Test",effort:"low",webSearch:false});
  for(let i=0;i<80&&!p.sent.some(x=>x.kind==="terminal");i++)
    await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(p.sent.at(-1).status,"completed",JSON.stringify(p.sent));
  assert(p.sent.some(x=>x.kind==="summary"));
  assert(p.sent.some(x=>x.kind==="answer"));
  assert(!JSON.stringify(p.sent).includes("sk_TEST_SECRET_VALUE"));
  assert.equal(h.fetchCalls.length,1);
});

test("offer reads never send network requests and enrollment remains self-reported",async()=>{
  const h=createHarness();
  const s=await h.dispatch({type:"AI_OFFER_STATUS"});
  assert.equal(s.ok,true);
  assert.equal(s.offer.verifiedByOpenAI,false);
  assert.equal(s.offer.enrollmentSelfReported,false);
  assert.equal(s.offer.limits.standard,250000);
  assert.equal(s.offer.limits.small,2500000);
  assert.equal(h.fetchCalls.length,0);
  const enabled=await h.dispatch({type:"AI_OFFER_SET_ENROLLMENT",enrolled:true});
  assert.equal(enabled.ok,true);
  assert.equal(enabled.offer.enrollmentSelfReported,true);
  assert.equal(enabled.offer.verifiedByOpenAI,false);
  assert(!JSON.stringify(h.settings).includes("sk-TEST"));
  const external=await h.external({
    kind:"elfshell.workspace.bridge",version:1,command:"AI_OFFER_STATUS"
  });
  assert.equal(external.ok,false);
});
test("OpenAI free-offer tracker accounts for completed response usage without logging content",async()=>{
  const h=createHarness({}, {aiPermission:true,mockFetch:async(url,options)=>{
    assert.equal(url,"https://api.openai.com/v1/responses");
    const content=[
      'data: {"type":"response.created"}\n\n',
      'data: {"type":"response.output_text.delta","item_id":"m","content_index":0,"delta":"Result"}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":12,"output_tokens":30}}}\n\n'
    ].join("");
    return {status:200,ok:true,body:new ReadableStream({
      start(ctrl){ctrl.enqueue(new TextEncoder().encode(content));ctrl.close();}
    })};
  }});
  h.sessionSettings["elfshell.byok.apiKey.v1"]={provider:"openai",key:"sk_TEST_SECRET"};
  const port=h.port();
  port.send({type:"start",text:"Hello",effort:"medium",webSearch:false});
  for(let i=0;i<80&&!port.sent.some(e=>e.kind==="terminal");i++)
    await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(port.sent.at(-1).status,"completed",JSON.stringify(port.sent));
  assert.equal(port.sent.at(-1).localUsage.observedTokens.small,42);
  const s=await h.dispatch({type:"AI_OFFER_STATUS"});
  assert.equal(s.offer.observedTokens.small,42);
  assert.equal(s.offer.enrollmentSelfReported,false);
  assert.equal(s.offer.verifiedByOpenAI,false);
  assert(!JSON.stringify(port.sent).includes("sk_TEST_SECRET"));
  assert(!JSON.stringify(h.settings).includes("Hello"));
});

test("Desktop OAuth secret remains session-only, rejects invalid fields and never surfaces in status",async()=>{
  const h=createHarness({}, {googlePermission:true});
  const client="123456789-abcdefabcdef.apps.googleusercontent.com";
  const calendar="https://www.googleapis.com/auth/calendar.events.readonly";
  await h.dispatch({type:"GOOGLE_AUTH_CONFIG",clientId:client,scopes:[calendar]});
  const missing=await h.dispatch({type:"GOOGLE_AUTH_PREPARE"});
  assert.equal(missing.ok,false);
  assert.match(missing.error,/Desktop OAuth client secret/);
  for(const invalid of ["short","a/b?c"," ".repeat(16)]){
    const res=await h.dispatch({type:"GOOGLE_AUTH_SECRET_SET",secret:invalid});
    assert.equal(res.ok,false);
  }
  const secret="GOCSPX-SYNTHETIC_SECRET_FOR_TESTS";
  const saved=await h.dispatch({type:"GOOGLE_AUTH_SECRET_SET",secret});
  assert.equal(saved.ok,true,saved.error);
  assert.equal(saved.auth.hasDesktopSecret,true);
  assert(!JSON.stringify(saved).includes(secret));
  assert(!JSON.stringify(h.settings).includes(secret));
  assert.equal(h.sessionSettings["elfshell.google.desktopClientSecret.v1"],secret);
  const status=await h.dispatch({type:"GOOGLE_AUTH_STATUS"});
  assert.equal(status.auth.hasDesktopSecret,true);
  assert(!JSON.stringify(status).includes(secret));
  const alt="123456789-xyzxyzxyz.apps.googleusercontent.com";
  const changed=await h.dispatch({type:"GOOGLE_AUTH_CONFIG",clientId:alt,scopes:[calendar]});
  assert.equal(changed.auth.hasDesktopSecret,false);
  assert.equal(h.sessionSettings["elfshell.google.desktopClientSecret.v1"],undefined);
  const external=await h.external({kind:"elfshell.workspace.bridge",version:1,
    command:"GOOGLE_AUTH_SECRET_SET",secret});
  assert.equal(external.ok,false);
  assert(!JSON.stringify(external).includes(secret));
});
test("Google token exchange reports only fixed error category, never raw provider descriptions",async()=>{
  const secret="GOCSPX-SYNTHETIC_ERROR_TEST_SECRET";
  const client="123456789-abcdefabcdef.apps.googleusercontent.com";
  const scope="https://www.googleapis.com/auth/calendar.events.readonly";
  const h=createHarness({}, {googlePermission:true,mockFetch:async(url,init)=>{
    assert.equal(url,"https://oauth2.googleapis.com/token");
    assert.equal(new URLSearchParams(init.body).get("client_secret"),secret);
    return {status:400,ok:false,json:async()=>({
      error:"invalid_request",
      error_description:"client_secret is missing; YOU_MUST_NOT_SHOW_THIS_RAW_TEXT"
    })};
  }});
  await h.dispatch({type:"GOOGLE_AUTH_CONFIG",clientId:client,scopes:[scope]});
  await h.dispatch({type:"GOOGLE_AUTH_SECRET_SET",secret});
  const pending=await h.dispatch({type:"GOOGLE_AUTH_PREPARE"});
  assert.equal(pending.ok,true,pending.error);
  const state=new URL(pending.auth.prepared.url).searchParams.get("state");
  const callback="http://127.0.0.1/mozoauth2/devredirect?state="+
    state+"&code=PRIVATE_ONE_TIME_CODE";
  const result=await h.dispatch({type:"GOOGLE_AUTH_COMPLETE",callbackUrl:callback});
  assert.equal(result.ok,false);
  assert.match(result.error,/missing-client-secret/);
  assert(!JSON.stringify(result).includes("PRIVATE_ONE_TIME_CODE"));
  assert(!JSON.stringify(result).includes(secret));
  assert(!JSON.stringify(result).includes("YOU_MUST_NOT_SHOW_THIS_RAW_TEXT"));
  assert.equal(h.sessionSettings["elfshell.google.pending.v1"],undefined);
});
test("clearing Desktop OAuth secret invalidates pending request but not existing access token",async()=>{
  const h=createHarness({},{googlePermission:true});
  const client="123456789-abcdefabcdef.apps.googleusercontent.com";
  const calendar="https://www.googleapis.com/auth/calendar.events.readonly";
  await h.dispatch({type:"GOOGLE_AUTH_CONFIG",clientId:client,scopes:[calendar]});
  await h.dispatch({type:"GOOGLE_AUTH_SECRET_SET",
    secret:"GOCSPX-SYNTHETIC_CLEAR_TEST_SECRET"});
  const prepared=await h.dispatch({type:"GOOGLE_AUTH_PREPARE"});
  assert.equal(prepared.ok,true);
  const token={accessToken:"SESSION_ACCESS_TOKEN",expiresAt:Date.now()+120000,scopes:[calendar]};
  h.sessionSettings["elfshell.google.sessionToken.v1"]=token;
  const cleared=await h.dispatch({type:"GOOGLE_AUTH_SECRET_CLEAR"});
  assert.equal(cleared.ok,true);
  assert.equal(cleared.auth.hasDesktopSecret,false);
  assert.equal(cleared.auth.prepared,null);
  assert.equal(cleared.auth.connected,true);
  assert.equal(h.sessionSettings["elfshell.google.sessionToken.v1"],token);
});

test("Gmail and Drive metadata are separate opt-in scopes; no fetch without both token and permission",async()=>{
  const drive="https://www.googleapis.com/auth/drive.metadata.readonly";
  const gmail="https://www.googleapis.com/auth/gmail.metadata";
  let calls=0;
  const h=createHarness({}, {googlePermission:true,mockFetch:async(url,options)=>{
    calls++;
    assert.equal(options.method,"GET");
    if(url.includes("/drive/v3/files"))
      return {ok:true,status:200,json:async()=>({files:[
        {id:"f_123",name:"Workshop list",mimeType:"application/vnd.google-apps.spreadsheet",
        modifiedTime:"2026-11-08T06:00:00Z",webViewLink:"https://docs.google.com/spreadsheets/d/f_123/edit"}
      ]})};
    if(url.includes("/messages?"))
      return {ok:true,status:200,json:async()=>({messages:[{id:"f11223344"}]})};
    if(url.includes("/messages/f11223344?"))
      return {ok:true,status:200,json:async()=>({labelIds:["INBOX","UNREAD"],payload:{
        headers:[{name:"From",value:"Supplier <supplier@example.com>"},
        {name:"Subject",value:"Inventory update"},{name:"Date",value:"Sun, 08 Nov 2026"}],
        body:{data:"NEVER_SEND_BODY"}
      }})};
    throw Error("Unexpected metadata endpoint");
  }});
  assert.equal((await h.dispatch({type:"GOOGLE_READ_METADATA",source:"drive"})).ok,false);
  assert.equal((await h.dispatch({type:"GOOGLE_READ_METADATA",source:"gmail"})).ok,false);
  assert.equal(calls,0);
  const calendar="https://www.googleapis.com/auth/calendar.events.readonly";
  h.sessionSettings["elfshell.google.sessionToken.v1"]={
    accessToken:"TEST_ONLY_TOKEN",expiresAt:Date.now()+100000,
    scopes:[calendar]
  };
  assert.equal((await h.dispatch({type:"GOOGLE_READ_METADATA",source:"gmail"})).ok,false);
  assert.equal(calls,0);
  h.sessionSettings["elfshell.google.sessionToken.v1"].scopes=[drive,gmail];
  const result=await h.dispatch({type:"GOOGLE_READ_METADATA",source:"drive"});
  assert.equal(result.ok,true,result.error);
  assert.equal(result.result.files[0].name,"Workshop list");
  const mail=await h.dispatch({type:"GOOGLE_READ_METADATA",source:"gmail"});
  assert.equal(mail.ok,true,mail.error);
  assert.equal(mail.result.messages[0].subject,"Inventory update");
  assert.equal(mail.result.messages[0].unread,true);
  assert(!JSON.stringify(mail).includes("NEVER_SEND_BODY"));
  assert(!JSON.stringify(result).includes("TEST_ONLY_TOKEN"));
  assert.equal(calls,3);
  for(const source of ["calendar","__proto__","gmail?x=evil"]){
    assert.equal((await h.dispatch({type:"GOOGLE_READ_METADATA",source})).ok,false);
  }
  assert.equal(calls,3);
  const external=await h.external({kind:"elfshell.workspace.bridge",
    version:1,command:"GOOGLE_READ_METADATA",source:"gmail"});
  assert.equal(external.ok,false);
});
test("Gmail metadata fails closed if Firefox permission/communications consent is absent",async()=>{
  const gmail="https://www.googleapis.com/auth/gmail.metadata";
  let calls=0;
  const h=createHarness({}, {googlePermission:true,googleDataConsent:false,
    mockFetch:async()=>{calls++;throw Error("No Gmail network allowed");}
  });
  h.sessionSettings["elfshell.google.sessionToken.v1"]={
    accessToken:"TEST_TOKEN",expiresAt:Date.now()+100000,scopes:[gmail]
  };
  const reply=await h.dispatch({type:"GOOGLE_READ_METADATA",source:"gmail"});
  assert.equal(reply.ok,false);
  assert.equal(calls,0);
});

test("Stage 5: non-stream cancellation is immediate, redacted, and cannot queue a second request",async()=>{
  let notified;
  const started=new Promise(resolve=>{notified=resolve;});
  const h=createHarness({}, {aiPermission:true,mockFetch:async(url,opts)=>{
    assert.equal(url,"https://api.anthropic.com/v1/messages");
    notified();
    return await new Promise((_resolve,reject)=>{
      opts.signal.addEventListener("abort",()=>reject(Error("PRIVATE_PROVIDER_ERROR_BODY")),{once:true});
    });
  }});
  const settings=await h.dispatch({type:"AI_SAVE_SETTINGS",provider:"anthropic",model:"claude-sonnet-4-5"});
  assert.equal(settings.ok,true);
  const key=await h.dispatch({type:"AI_SET_SESSION_KEY",key:"TEST_SESSION_KEY_012345"});
  assert.equal(key.ok,true);
  const pending=h.dispatch({type:"AI_SEND_PROMPT",text:"Synthetic prompt"});
  await started;
  const duplicate=await h.dispatch({type:"AI_SEND_PROMPT",text:"Should not send"});
  assert.equal(duplicate.ok,false);
  assert.match(duplicate.error,/already active/);
  const cancelled=await h.dispatch({type:"AI_CANCEL_REQUEST"});
  assert.equal(cancelled.ok,true);
  assert.equal(cancelled.cancelled,true);
  const outcome=await pending;
  assert.equal(outcome.ok,false);
  assert.match(outcome.error,/cancelled/);
  assert(!JSON.stringify(outcome).includes("PRIVATE_PROVIDER_ERROR_BODY"));
  assert.equal(h.fetchCalls.length,1);
});
test("Stage 5: Forget session key aborts an outstanding Gemini request",async()=>{
  let notified;
  const started=new Promise(resolve=>{notified=resolve;});
  const h=createHarness({}, {aiPermission:true,mockFetch:async(url,opts)=>{
    assert(url.includes("generativelanguage.googleapis.com"));
    notified();
    return await new Promise((_resolve,reject)=>{
      opts.signal.addEventListener("abort",()=>reject(Error("SENSITIVE_FALLBACK")),{once:true});
    });
  }});
  assert.equal((await h.dispatch({type:"AI_SAVE_SETTINGS",provider:"gemini",model:"gemini-3.8-flash"})).ok,true);
  assert.equal((await h.dispatch({type:"AI_SET_SESSION_KEY",key:"TEST_SESSION_KEY_012345"})).ok,true);
  const pending=h.dispatch({type:"AI_SEND_PROMPT",text:"No private content"});
  await started;
  const cleared=await h.dispatch({type:"AI_CLEAR_SESSION_KEY"});
  assert.equal(cleared.ok,true);
  assert.equal(cleared.ai.hasSessionKey,false);
  const outcome=await pending;
  assert.equal(outcome.ok,false);
  assert.match(outcome.error,/cancelled/);
  assert.equal(h.sessionSettings["elfshell.byok.apiKey.v1"],undefined);
  assert.equal((await h.dispatch({type:"AI_CANCEL_REQUEST"})).cancelled,false);
});

test("Stage 6.1 Hub status/probe without account consent makes zero Worker network calls",async()=>{
  const h=createHarness();
  const status=await h.dispatch({type:"MASTER_STATUS"});
  assert.equal(status.ok,true);
  assert.equal(status.master.connected,false);
  assert.equal(status.master.permissionsGranted,false);
  const denied=await h.dispatch({type:"MASTER_CONNECT"});
  assert.equal(denied.ok,false);
  assert.match(denied.error,/MASTER_FIREFOX_PERMISSION_REQUIRED/);
  const probe=await h.dispatch({type:"MASTER_PROBE"});
  assert.equal(probe.ok,false);
  assert.match(probe.error,/FIREFOX_HOST_PERMISSION_REQUIRED/);
  const disconnected=await h.dispatch({type:"MASTER_DISCONNECT"});
  assert.equal(disconnected.ok,true);
  assert.equal(disconnected.master.localSessionCleared,true);
  assert.equal(disconnected.master.remotelyRevoked,false);
  assert.equal(h.fetchCalls.length,0);
});
test("Stage 6.1 Firefox identity is required after separate host consent, no implicit fallback",async()=>{
  const h=createHarness({}, {googlePermission:true,googleDataConsent:true});
  assert.equal((await h.dispatch({type:"MASTER_STATUS"})).master.permissionsGranted,true);
  const connect=await h.dispatch({type:"MASTER_CONNECT"});
  assert.equal(connect.ok,false);
  assert.match(connect.error,/FIREFOX_IDENTITY_PERMISSION_REQUIRED/);
  assert.equal(h.fetchCalls.length,0);
});
