const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createHarness() {
  const tabs = [], groups = [], settings = {};
  let tabId = 1, groupId = 1, onMessage = null, onExternal = null;
  const browser = {
    runtime: {
      id: "workspace-ai@elf-shell.local",
      getURL: name => "moz-extension://fixture/" + name,
      onMessage: { addListener: callback => { onMessage = callback; } },
      onMessageExternal: { addListener: callback => { onExternal = callback; } }
    },
    storage: { local: {
      get: async key => ({ [key]: settings[key] }),
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
    tabs, groups,
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
