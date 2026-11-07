/* Firefox MV3 background event-page controller: local tab operations only. */
"use strict";
const { DEFAULT_RESOURCES, normalizeResource, matchesTab } = globalThis.WorkspaceUtils;
const STORAGE_KEY = "elfshell.workspace.resources.v1";
const GROUP_TITLE = "ELF//SHELL · GOOGLE WORKSPACE";
let operation = Promise.resolve();

function serialise(action) {
  const next = operation.then(action, action);
  operation = next.catch(() => {});
  return next;
}
async function resources() {
  const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  if (!Array.isArray(stored)) return DEFAULT_RESOURCES.map(item => normalizeResource(item.name, item.url));
  const result = [];
  const seen = new Set();
  for (const item of stored.slice(0, 80)) {
    try {
      const valid = normalizeResource(item.name, item.url);
      if (!seen.has(valid.key)) { result.push(valid); seen.add(valid.key); }
    } catch { /* Ignore corrupt imported settings. */ }
  }
  return result;
}
async function saveResources(items) {
  await browser.storage.local.set({[STORAGE_KEY]:items});
}
async function currentWindow() {
  const win = await browser.windows.getLastFocused({windowTypes:["normal"]});
  if (!win || typeof win.id !== "number") throw new Error("No normal Firefox window is available");
  return win;
}
async function ensureHub(windowId) {
  const hubUrl = browser.runtime.getURL("hub.html");
  const all = await browser.tabs.query({});
  let hub = all.find(tab => tab.url === hubUrl && !tab.incognito);
  if (!hub) {
    hub = await browser.tabs.create({windowId, url:hubUrl, active:false, pinned:true});
  } else if (!hub.pinned) {
    hub = await browser.tabs.update(hub.id, {pinned:true});
  }
  return hub;
}
async function ensureGroup(windowId, ids) {
  const unique = [...new Set(ids)].filter(id => Number.isInteger(id));
  if (!unique.length) return null;
  const groups = await browser.tabGroups.query({windowId});
  const existing = groups.find(group => group.title === GROUP_TITLE);
  const groupId = existing
    ? await browser.tabs.group({tabIds:unique, groupId:existing.id})
    : await browser.tabs.group({tabIds:unique, createProperties:{windowId}});
  await browser.tabGroups.update(groupId, {title:GROUP_TITLE, color:"purple", collapsed:false});
  return groupId;
}
async function launchWorkspace() {
  const selection = await resources();
  const win = await currentWindow();
  const hub = await ensureHub(win.id);
  const targetWindowId = hub.windowId;
  const all = await browser.tabs.query({});
  const childIds = [];
  const outsideWindow = [];
  let opened = 0, reused = 0;
  for (const item of selection) {
    let tab = all.find(candidate => !candidate.incognito && candidate.id !== hub.id && matchesTab(item,candidate));
    if (!tab) {
      tab = await browser.tabs.create({windowId:targetWindowId,url:item.url,active:false});
      all.push(tab); opened += 1;
    } else {
      reused += 1;
    }
    if (tab.windowId === targetWindowId && !tab.pinned) childIds.push(tab.id);
    else outsideWindow.push(item.name);
  }
  const groupId = await ensureGroup(targetWindowId, childIds);
  await browser.tabs.update(hub.id,{active:true});
  await browser.windows.update(hub.windowId,{focused:true});
  return {opened,reused,groupId,hubTabId:hub.id,outsideWindow,resources:selection.length};
}
async function activateResource(key) {
  const allResources = await resources();
  const wanted = allResources.find(item => item.key === key);
  if (!wanted) throw new Error("This resource is no longer in your workspace");
  const tabs = await browser.tabs.query({});
  let tab = tabs.find(item => !item.incognito && matchesTab(wanted,item));
  let reused = true;
  if (!tab) {
    const hub = tabs.find(item => item.url === browser.runtime.getURL("hub.html"));
    const win = hub ? {id:hub.windowId} : await currentWindow();
    tab = await browser.tabs.create({windowId:win.id,url:wanted.url,active:true});
    await ensureGroup(win.id,[tab.id]);
    reused = false;
  } else {
    await browser.tabs.update(tab.id,{active:true});
  }
  await browser.windows.update(tab.windowId,{focused:true});
  return {reused,tabId:tab.id};
}
async function handle(message) {
  try {
    if (!message || typeof message !== "object" || typeof message.type !== "string") {
      throw new Error("Malformed request");
    }
    switch (message.type) {
      case "GET_STATE":
        return {ok:true,resources:await resources(),features:{googleApi:false,byok:false,morningCoffee:false,bridge:false}};
      case "OPEN_WORKSPACE":
        return {ok:true,result:await serialise(launchWorkspace)};
      case "OPEN_RESOURCE":
        return {ok:true,result:await serialise(() => activateResource(message.key))};
      case "SAVE_RESOURCE":
        return {ok:true,resources:await serialise(async () => {
          const item = normalizeResource(message.name,message.url);
          const current = await resources();
          if (current.some(existing => existing.key === item.key)) throw new Error("This Google resource is already saved");
          if (current.length >= 80) throw new Error("Maximum 80 saved resources");
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
browser.runtime.onMessage.addListener((message,sender) => {
  if (sender.id !== browser.runtime.id) return {ok:false,error:"Unauthorized sender"};
  return handle(message);
});
browser.action.onClicked.addListener(() => {
  // This must be called immediately within the user gesture, before awaiting anything.
  if (browser.sidebarAction && browser.sidebarAction.open) {
    browser.sidebarAction.open().catch(() => {});
  }
  serialise(launchWorkspace).catch(error => console.error("Workspace initialization failed:",error));
});