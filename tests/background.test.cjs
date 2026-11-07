const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createHarness(seed={}) {
  const tabs = [], groups = [], settings = {...seed};
  let tabId = 1, groupId = 1, onMessage = null, onExternal = null;
  const browser = {
    runtime: {
      id: "workspace-ai@elf-shell.local",
      getURL: name => "moz-extension://fixture/" + name,
      onMessage: { addListener: callback => { onMessage = callback; } },
      onMessageExternal: { addListener: callback => { onExternal = callback; } }
    },
    storage: { local: {
      get: async key => Array.isArray(key)
        ? Object.fromEntries(key.map(item=>[item,settings[item]]))
        : ({[key]:settings[key]}),
      set: async values => { Object.assign(settings, values); }
    } },
    tabs: {
      query: async () => tabs.map(tab => ({ ...tab })),
      create: async data => {
        const tab = {id: tabId++, windowId: data.windowId || 1, url: data.url, active: !!data.active, pinned: !!data.pinned};
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
    action: { onClicked: {addListener:()=>{}} }
  };
  const context = vm.createContext({browser, URL, console});
  for (const file of ["shared/workspace.js","background.js"]) {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname,"..",file),"utf8"),context,{filename:file});
  }
  return {
    tabs, groups, settings,
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
