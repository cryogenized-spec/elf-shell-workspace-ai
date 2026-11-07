#!/usr/bin/env python3
"""Isolated real-Firefox smoke test for the unsigned Workspace AI companion."""
from __future__ import annotations
import json
import os
from pathlib import Path
import sys
import traceback
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.support.ui import WebDriverWait

ROOT=Path(__file__).resolve().parents[1]
PACKAGE=ROOT/"dist"/"workspace-ai-alpha-unsigned.xpi"
ARTIFACTS=ROOT/"dist"/"native-firefox"
ARTIFACTS.mkdir(parents=True,exist_ok=True)
results={"suite":"Firefox Workspace AI native smoke","checks":[]}
driver=None

def check(label, callback):
    callback()
    results["checks"].append({"name":label,"status":"PASS"})
    print("PASS:",label,flush=True)

def require(value, message):
    if not value:
        raise AssertionError(message)

def extension_call(payload):
    code="""
      const done=arguments[arguments.length-1];
      (async()=>await browser.runtime.sendMessage(PAYLOAD))()
       .then(done,error=>done({ok:false,error:String(error)}));
    """.replace("PAYLOAD",json.dumps(payload))
    answer=driver.execute_async_script(code)
    require(isinstance(answer,dict) and answer.get("ok"),str(answer))
    return answer

def tab_state():
    return driver.execute_async_script("""
      const done=arguments[arguments.length-1];
      (async()=>{
        const tabs=await browser.tabs.query({});
        const hubs=tabs.filter(t=>t.url===browser.runtime.getURL("hub.html"));
        const groups=await browser.tabGroups.query({});
        return {hubs:hubs.map(t=>({id:t.id,pinned:t.pinned,windowId:t.windowId})),
          groups:groups.map(g=>({id:g.id,title:g.title,windowId:g.windowId})),
          tabs:tabs.map(t=>({id:t.id,windowId:t.windowId,groupId:t.groupId,pinned:t.pinned,url:t.url}))};
      })().then(done,e=>done({error:String(e)}));
    """)

try:
    require(PACKAGE.is_file(),"Unsigned development XPI must be packaged before testing")
    options=webdriver.FirefoxOptions()
    options.add_argument("-headless")
    binary=os.getenv("FIREFOX_BINARY")
    if binary:
        options.binary_location=binary
    options.set_preference("browser.shell.checkDefaultBrowser",False)
    options.set_preference("browser.startup.homepage","about:blank")
    driver=webdriver.Firefox(options=options,
        service=FirefoxService(service_args=["--allow-system-access"]))
    driver.set_page_load_timeout(25)
    driver.set_script_timeout(25)
    driver.set_window_size(1366,800)
    results["firefoxVersion"]=driver.capabilities.get("browserVersion")
    major=int(results["firefoxVersion"].split(".")[0])
    require(major>=142,"Firefox version 142+ required")
    addon_id=driver.install_addon(str(PACKAGE),temporary=True)
    check("unsigned temporary Firefox add-on installed",
          lambda:require(addon_id=="workspace-ai@elf-shell.local","Unexpected extension ID: "+repr(addon_id)))

    # Only a temporary CI test profile is used. Browser-chrome context reads
    # Firefox's extension UUID mapping; it never reads real user profile data.
    with driver.context(driver.CONTEXT_CHROME):
        uuid=driver.execute_script("""
          const Services=ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs").Services;
          const ids=JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids","{}"));
          return ids["workspace-ai@elf-shell.local"] || null;
        """)
    require(isinstance(uuid,str) and uuid,"Firefox did not assign a companion extension origin")
    driver.get("moz-extension://"+uuid+"/hub.html")
    WebDriverWait(driver,15).until(lambda d:len(d.find_elements(By.ID,"launch"))==1)
    check("Hub rendered as an extension page",lambda:require("Workspace Hub" in driver.title,driver.title))

    state=extension_call({"type":"GET_STATE"})
    check("default profile has six Google Workspace application links",
          lambda:require(len(state["resources"])==6 and len(state["profiles"])==1,str(state)))

    first=extension_call({"type":"OPEN_WORKSPACE"})
    second=extension_call({"type":"OPEN_WORKSPACE"})
    check("repeated launches do not duplicate any Google tabs",
          lambda:require(first["result"]["opened"]==6 and second["result"]["opened"]==0,str([first,second])))
    tabs=tab_state()
    require(not tabs.get("error"),str(tabs))
    check("exactly one pinned master and one named Firefox tab group",
          lambda:require(len(tabs["hubs"])==1 and tabs["hubs"][0]["pinned"] and
            any(g["title"]=="ELF//SHELL · GOOGLE WORKSPACE" for g in tabs["groups"]),str(tabs)))

    created=extension_call({"type":"CREATE_PROFILE","name":"Workshop QA"})
    require(created["activeProfileId"]!="default","New profile did not activate")
    extension_call({"type":"SAVE_RESOURCE","name":"Disposable Stock QA",
      "url":"https://docs.google.com/spreadsheets/d/WORKSHOPQA123456/edit"})
    third=extension_call({"type":"OPEN_WORKSPACE"})
    check("separate named profile creates its own Firefox group",
          lambda:require(third["result"]["opened"]==1 and third["result"]["profileName"]=="Workshop QA",str(third)))
    groups=tab_state()["groups"]
    require(any(g["title"]=="ELF//SHELL · WORKSHOP QA" for g in groups),str(groups))

    before=tab_state()["tabs"]
    deleted=extension_call({"type":"DELETE_PROFILE","id":created["activeProfileId"]})
    after=tab_state()["tabs"]
    check("deleting a saved profile never closes existing tabs",
          lambda:require(deleted["activeProfileId"]=="default" and len(before)==len(after),"Unexpected tab close"))

    driver.save_screenshot(str(ARTIFACTS/"workspace-hub.png"))
    results["status"]="PASS"
except Exception as error:
    results["status"]="FAIL";results["error"]=str(error);results["traceback"]=traceback.format_exc()
    print("FAIL:",error,file=sys.stderr,flush=True)
    if driver:
        try:driver.save_screenshot(str(ARTIFACTS/"failure.png"))
        except Exception:pass
finally:
    (ARTIFACTS/"report.json").write_text(json.dumps(results,indent=2),encoding="utf8")
    if driver:
        driver.quit()
if results["status"]!="PASS":raise SystemExit(1)
