#!/usr/bin/env python3
"""Real Firefox two-extension integration: ELF//SHELL command -> Workspace AI tabs."""
from __future__ import annotations
import json
import os
from pathlib import Path
import sys
import traceback
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.support.ui import WebDriverWait

ROOT=Path(__file__).resolve().parents[1]
COMPANION=ROOT/"dist"/"workspace-ai-alpha-unsigned.xpi"
CORE=next((ROOT/"core"/"dist").glob("ELF-SHELL-Ayarime-v*-AMO.zip"),None)
ARTIFACTS=ROOT/"dist"/"native-bridge"
ARTIFACTS.mkdir(parents=True,exist_ok=True)
results={"suite":"ELF//SHELL + Workspace AI Firefox interoperability","checks":[]}
driver=None

def require(condition,msg):
    if not condition:raise AssertionError(msg)

def check(name,func):
    func()
    results["checks"].append({"name":name,"status":"PASS"})
    print("PASS:",name,flush=True)

def extension_message(payload):
    code="""
      const done=arguments[arguments.length-1];
      browser.runtime.sendMessage(PAYLOAD)
        .then(done,e=>done({ok:false,error:String(e)}));
    """.replace("PAYLOAD",json.dumps(payload))
    return driver.execute_async_script(code)

try:
    require(COMPANION.is_file() and CORE is not None and CORE.is_file(),"Both unsigned archives must be built")
    options=webdriver.FirefoxOptions()
    options.add_argument("-headless")
    binary=os.getenv("FIREFOX_BINARY")
    if binary:options.binary_location=binary
    options.set_preference("browser.shell.checkDefaultBrowser",False)
    options.set_preference("browser.startup.homepage","about:blank")
    driver=webdriver.Firefox(options=options,service=FirefoxService(service_args=["--allow-system-access"]))
    driver.set_page_load_timeout(25)
    driver.set_script_timeout(25)
    driver.set_window_size(1366,800)

    # Always temporary: the core and companion archives are unsigned dev builds.
    companion_id=driver.install_web_extension(str(COMPANION),permanent=False).id
    core_id=driver.install_web_extension(str(CORE),permanent=False).id
    check("both independent extensions installed in one isolated Firefox",
          lambda:require(companion_id=="workspace-ai@elf-shell.local" and
            core_id=="elf-shell-ayarime@local.theme",str((companion_id,core_id))))

    original=set(driver.window_handles)
    with driver.context(driver.CONTEXT_CHROME):
        driver.execute_script("window.BrowserCommands.openTab();")
    WebDriverWait(driver,15).until(lambda d:len(set(d.window_handles)-original)==1)
    handle=next(iter(set(driver.window_handles)-original))
    driver.switch_to.window(handle)
    WebDriverWait(driver,20).until(lambda d:len(d.find_elements(By.ID,"search-input"))==1)
    check("real ELF//SHELL new tab opens with command palette",
          lambda:require(driver.title=="ELF//SHELL — Ayarime",driver.title))

    query=driver.find_element(By.ID,"search-input")
    query.click()
    query.send_keys("Ayarime, please bring up my workspace")
    WebDriverWait(driver,12).until(
        lambda d:"bring up my workspace" in d.find_element(By.ID,"search-results").text.lower())
    check("natural-language Workspace command is offered by core",
          lambda:require(driver.find_element(By.ID,"palette-option-0").is_displayed(),"Missing suggestion"))
    query.send_keys(Keys.ENTER)
    WebDriverWait(driver,20).until(
        lambda d:"Workspace ready" in d.find_element(By.ID,"workspace-bridge-status").text or
        "Workspace unavailable" in d.find_element(By.ID,"workspace-bridge-status").text)
    status=driver.find_element(By.ID,"workspace-bridge-status").text
    check("core command calls Workspace AI companion successfully",
          lambda:require("Workspace ready" in status,status))

    hello=driver.execute_async_script("""
      const done=arguments[arguments.length-1];
      browser.runtime.sendMessage("workspace-ai@elf-shell.local",
        {kind:"elfshell.workspace.bridge",version:1,command:"HELLO"})
        .then(done,e=>done({ok:false,error:String(e)}));
    """)
    check("external sender is recognized and v1 protocol handshake succeeds",
          lambda:require(hello.get("ok") and hello.get("version")==1,str(hello)))

    # Use the real Firefox extension UUID map, not hard-coded moz-extension URLs.
    with driver.context(driver.CONTEXT_CHROME):
        uid=driver.execute_script("""
          const services=(typeof Services!=="undefined"?Services:window.Services);
          const map=JSON.parse(services.prefs.getStringPref("extensions.webextensions.uuids","{}"));
          return map["workspace-ai@elf-shell.local"];
        """)
    hub_url="moz-extension://"+uid+"/hub.html"
    WebDriverWait(driver,15).until(lambda d:len(d.window_handles)>=8)
    hubs=[]
    for tab in driver.window_handles:
        driver.switch_to.window(tab)
        if driver.current_url==hub_url:
            hubs.append(tab)
    require(len(hubs)==1,"There must be exactly one Super Tab; got "+str(len(hubs)))
    driver.switch_to.window(hubs[0])
    state=extension_message({"type":"GET_STATE"})
    check("Workspace Hub survives command and retains six default resources",
          lambda:require(state.get("ok") and len(state.get("resources",[]))==6,str(state)))

    tab_data=driver.execute_async_script("""
      const done=arguments[arguments.length-1];
      (async()=>{
        const tabs=await browser.tabs.query({});
        const groups=await browser.tabGroups.query({});
        return {tabs:tabs.map(t=>({id:t.id,url:t.url,pinned:t.pinned})),
          groups:groups.map(g=>({title:g.title}))};
      })().then(done,e=>done({error:String(e)}));
    """)
    check("the Master is pinned and Google subordinates grouped",
          lambda:require(any(t["pinned"] and t["url"]==hub_url for t in tab_data["tabs"]) and
             any(g["title"]=="ELF//SHELL · GOOGLE WORKSPACE" for g in tab_data["groups"]),str(tab_data)))

    # A second natural-language invocation must not create duplicate Google tabs.
    print("BEFORE_REPEAT_TABS:",json.dumps(tab_data["tabs"]),flush=True)
    print("BEFORE_REPEAT_REGISTRY:",str(driver.current_url),flush=True)
    driver.switch_to.window(handle)
    again=driver.execute_async_script("""
      const done=arguments[arguments.length-1];
      window.AyarimeWorkspaceBridge.openWorkspace().then(done,e=>done({error:String(e)}));
    """)
    check("repeat cross-extension command reuses already-open Google tabs",
          lambda:require(again and again.get("opened")==0 and again.get("reused")==6,str(again)))
    # The second command must focus the existing AI console, not restore or
    # duplicate Google tabs or request any provider key.
    driver.switch_to.window(handle)
    query=driver.find_element(By.ID,"search-input")
    query.click()
    query.send_keys(Keys.CONTROL,"a")
    query.send_keys("Ask Ayarime")
    WebDriverWait(driver,12).until(lambda d:
        "ask ayarime" in d.find_element(By.ID,"search-results").text.lower())
    check("core offers dedicated Ask Ayarime command",
          lambda:require(driver.find_element(By.ID,"palette-option-0").is_displayed(),
                         "Ask Ayarime suggestion is missing"))
    query.send_keys(Keys.ENTER)
    WebDriverWait(driver,20).until(lambda d:
        "AI console opened" in d.find_element(By.ID,"workspace-bridge-status").text or
        "Assistant unavailable" in d.find_element(By.ID,"workspace-bridge-status").text)
    ask_status=driver.find_element(By.ID,"workspace-bridge-status").text
    check("Ask Ayarime invokes the companion OPEN_ASSISTANT bridge",
          lambda:require("AI console opened" in ask_status,ask_status))
    driver.switch_to.window(hubs[0])
    WebDriverWait(driver,18).until(lambda d:
        d.execute_script("return document.activeElement?.id")=="ai-prompt")
    check("existing pinned Hub focuses its AI prompt",
          lambda:require(driver.find_element(By.ID,"ai-prompt").is_displayed() and
                         driver.current_url==hub_url,
                         "Hub did not focus or clear its local assistant route"))
    # A second explicit click inside the companion is a valid Firefox user
    # gesture to open the native sidebar, unlike the async core bridge.
    driver.find_element(By.ID,"ai-open-sidebar").click()
    WebDriverWait(driver,12).until(lambda d:
        "sidebar opened" in d.find_element(By.ID,"ai-sidebar-status").text.lower() or
        "could not open sidebar" in d.find_element(By.ID,"ai-sidebar-status").text.lower())
    sidebar_message=driver.find_element(By.ID,"ai-sidebar-status").text
    check("companion Hub's direct click opens the Firefox native sidebar",
          lambda:require("sidebar opened" in sidebar_message.lower(),sidebar_message))
    after_ask=driver.execute_async_script("""
      const done=arguments[arguments.length-1];
      browser.tabs.query({}).then(tabs=>done(tabs.map(t=>t.id)),e=>done({error:String(e)}));
    """)
    check("assistant handoff opens no new Google tabs",
          lambda:require(set(after_ask)=={t["id"] for t in tab_data["tabs"]},str(after_ask)))

    results["status"]="PASS"
    driver.save_screenshot(str(ARTIFACTS/"two-extensions.png"))
except Exception as exc:
    results["status"]="FAIL";results["error"]=str(exc);results["traceback"]=traceback.format_exc()
    print("FAIL:",exc,file=sys.stderr,flush=True)
    if driver:
        try:driver.save_screenshot(str(ARTIFACTS/"failure.png"))
        except Exception:pass
finally:
    (ARTIFACTS/"report.json").write_text(json.dumps(results,indent=2),encoding="utf8")
    if driver:driver.quit()
if results["status"]!="PASS":raise SystemExit(1)
