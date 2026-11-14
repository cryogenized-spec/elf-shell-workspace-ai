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
from selenium.webdriver.support.ui import WebDriverWait, Select

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
    # Selenium 4.52+ returns a WebExtension object with an explicit id.
    # permanent=False is essential: developer XPIs are unsigned and must
    # remain confined to this disposable Firefox test session.
    addon=driver.install_web_extension(str(PACKAGE),permanent=False)
    addon_id=addon.id
    check("unsigned temporary Firefox add-on installed",
          lambda:require(addon_id=="workspace-ai@elf-shell.local","Unexpected extension ID: "+repr(addon_id)))

    # Only a temporary CI test profile is used. Browser-chrome context reads
    # Firefox's extension UUID mapping; it never reads real user profile data.
    with driver.context(driver.CONTEXT_CHROME):
        uuid=driver.execute_script("""
          // Browser chrome provides Services on Firefox's main window.
          // Do not import privileged parent-process modules in Marionette.
          const service=(typeof Services!=="undefined" ? Services : window.Services);
          if (!service?.prefs) throw new Error("Firefox browser-chrome Services not available");
          const ids=JSON.parse(service.prefs.getStringPref("extensions.webextensions.uuids","{}"));
          return ids["workspace-ai@elf-shell.local"] || null;
        """)
    require(isinstance(uuid,str) and uuid,"Firefox did not assign a companion extension origin")
    driver.get("moz-extension://"+uuid+"/hub.html")
    WebDriverWait(driver,15).until(lambda d:len(d.find_elements(By.ID,"launch"))==1)
    check("Hub rendered as an extension page",lambda:require("Workspace Hub" in driver.title,driver.title))

    # Stage 6.1: real Firefox identity and host-permission gates, no live OAuth.
    check("manual Google Master controls are present but no auto-login occurs",
          lambda:require(
            len(driver.find_elements(By.ID,"master-connect"))==1 and
            driver.find_element(By.ID,"master-connect").get_attribute("disabled") and
            "Not connected" in driver.find_element(By.ID,"master-status").text,
            "Master OAuth was unexpectedly offered without user-granted hosts"))
    reported_origin=driver.find_element(By.ID,"master-origin").get_attribute("textContent")
    check("Hub shows the true moz-extension UUID for exact Worker CORS allowlisting",
          lambda:require("moz-extension://"+uuid in reported_origin and
            "origin null" not in reported_origin,
            "The Hub did not show the real Firefox extension origin"))
    identity_url=driver.execute_script("return browser.identity.getRedirectURL()")
    check("Firefox provides a stable OAuth identity redirect for the companion",
          lambda:require(
            identity_url.startswith("https://") and
            ".extensions.allizom.org/" in identity_url,
            "No Firefox identity callback"))
    master_status=extension_call({"type":"MASTER_STATUS"})
    check("Master OAuth startup reads local status only",
          lambda:require(master_status["master"]["connected"] is False and
            master_status["master"]["permissionsGranted"] is False,
            "An unauthorized Master session was present"))
    no_read=driver.execute_async_script("""
      const done=arguments[arguments.length-1];
      browser.runtime.sendMessage({type:"MASTER_PROBE"}).then(done);
    """)
    check("Master capability probe is blocked before any host or data consent",
          lambda:require(no_read.get("ok") is False and
            "FIREFOX_HOST_PERMISSION_REQUIRED" in no_read.get("error",""),
            "Master probe bypassed Firefox permissions"))

    # No provider keys are configured; this exercises only local session history.
    empty_history=extension_call({"type":"AI_CONVERSATION_LIST"})
    check("conversation begins empty without requesting provider data",
          lambda:require(empty_history.get("entries")==[] and
            driver.find_element(By.ID,"ai-conversation-clear").get_attribute("disabled"),
            str(empty_history)))
    extension_call({"type":"AI_CONVERSATION_APPEND","prompt":"Local QA greeting",
      "answer":"Local QA response","provider":"openai","model":"gpt-6-luna"})
    WebDriverWait(driver,10).until(lambda d:
        "Local QA response" in d.find_element(By.ID,"ai-conversation-list").text)
    check("Hub renders the reply saved by same-extension session storage",
          lambda:require("Local QA greeting" in driver.find_element(By.ID,"ai-conversation-list").text,
                         "Hub transcript did not receive session update"))
    check("multi-turn is always disabled by default",
          lambda:require(not driver.find_element(By.ID,"ai-context-enable").is_selected() and
                         "Context OFF" in driver.find_element(By.ID,"ai-context-preview").text,
                         "Chat history was enabled without opt-in"))
    extension_call({"type":"AI_CONVERSATION_APPEND","prompt":"Browser QA follow-up",
      "answer":"Only for testing", "provider":"openai","model":"gpt-5.4-mini"})
    check("explicit context preview never returns prompt text",
          lambda:require("Browser QA follow-up" not in json.dumps(
            extension_call({"type":"AI_CONTEXT_PREVIEW","includeHistory":True,"historyLimit":1})["summary"]),
            "Preview leaked prompt text"))
    driver.find_element(By.ID,"ai-context-enable").click()
    WebDriverWait(driver,10).until(lambda d:
        "1 previous exchange" in d.find_element(By.ID,"ai-context-preview").text)
    check("real Hub checkbox displays matching context budget without model request",
          lambda:require("roughly" in driver.find_element(By.ID,"ai-context-preview").text,
                         "Context size estimate is missing"))
    driver.refresh()
    WebDriverWait(driver,10).until(lambda d:len(d.find_elements(By.ID,"ai-context-enable"))==1)
    check("opt-in is not saved across Hub reloads",
          lambda:require(not driver.find_element(By.ID,"ai-context-enable").is_selected(),
                         "Context must reset on reload"))
    driver.get("moz-extension://"+uuid+"/sidebar.html")
    WebDriverWait(driver,12).until(lambda d:
        "Local QA response" in d.find_element(By.ID,"ai-conversation-list").text)
    check("sidebar shows the very same session conversation",
          lambda:require("Local QA greeting" in driver.find_element(By.ID,"ai-conversation-list").text,
                         "Sidebar transcript differs from Hub"))
    driver.find_element(By.ID,"ai-conversation-clear").click()
    WebDriverWait(driver,10).until(lambda d:
        "No replies in this Firefox session" in d.find_element(By.ID,"ai-conversation-list").text)
    check("Clear conversation removes only the session transcript",
          lambda:require(extension_call({"type":"AI_CONVERSATION_LIST"})["entries"]==[],
                         "Clear conversation did not remove session history"))
    driver.get("moz-extension://"+uuid+"/hub.html")
    WebDriverWait(driver,10).until(lambda d:len(d.find_elements(By.ID,"launch"))==1)

    state=extension_call({"type":"GET_STATE"})
    check("default profile has six Google Workspace application links",
          lambda:require(len(state["resources"])==6 and len(state["profiles"])==1,str(state)))

    first=extension_call({"type":"OPEN_WORKSPACE"})
    initial_tabs=tab_state()
    print("FIRST_LAUNCH_TAB_URLS:", json.dumps([
      {"id":t["id"],"url":t.get("url"),"group":t.get("groupId")}
      for t in initial_tabs.get("tabs",[])
    ]), flush=True)
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

    # Exercise the actual Hub controls, not just the background API.
    WebDriverWait(driver,10).until(
        lambda d:d.find_element(By.ID,"persona-mode").get_attribute("value")=="ayarime")
    Select(driver.find_element(By.ID,"persona-mode")).select_by_value("professional")
    driver.find_element(By.CSS_SELECTOR,'#persona-form button[type="submit"]').click()
    WebDriverWait(driver,10).until(
        lambda d:extension_call({"type":"GET_PERSONA"})["persona"]["mode"]=="professional")
    driver.refresh()
    WebDriverWait(driver,10).until(
        lambda d:d.find_element(By.ID,"persona-mode").get_attribute("value")=="professional")
    check("professional personality saves and survives Hub reload",
          lambda:require(extension_call({"type":"GET_PERSONA"})["persona"]["mode"]=="professional","Mode not retained"))

    Select(driver.find_element(By.ID,"persona-mode")).select_by_value("custom")
    custom=driver.find_element(By.ID,"persona-custom")
    custom.send_keys("Use my preferred precise technical writing style.")
    driver.find_element(By.CSS_SELECTOR,'#persona-form button[type="submit"]').click()
    WebDriverWait(driver,10).until(
        lambda d:extension_call({"type":"GET_PERSONA"})["persona"]["mode"]=="custom")
    check("custom personality is locally editable",
          lambda:require("precise technical" in extension_call({"type":"GET_PERSONA"})["persona"]["customPrompt"],"Prompt not saved"))
    driver.find_element(By.ID,"persona-reset").click()
    WebDriverWait(driver,10).until(
        lambda d:extension_call({"type":"GET_PERSONA"})["persona"]["mode"]=="ayarime")
    check("personality reset restores Ayarime default",
          lambda:require(extension_call({"type":"GET_PERSONA"})["persona"]["customPrompt"]=="","Reset failed"))

    auth=extension_call({"type":"GOOGLE_AUTH_STATUS"})
    check("Drive and Gmail restricted scopes are OFF by default",
          lambda:require(
            not driver.find_element(By.ID,"google-scope-drive").is_selected() and
            not driver.find_element(By.ID,"google-scope-gmail").is_selected(),
            "Restricted Drive/Gmail scopes must never be preselected"))
    check("Drive and Gmail metadata previews are disabled until user authorizes each scope",
          lambda:require(
            not driver.find_element(By.ID,"google-drive-read").is_enabled() and
            not driver.find_element(By.ID,"google-gmail-read").is_enabled() and
            "restricted" in driver.find_element(By.CSS_SELECTOR,".google-metadata-panel").text.lower(),
            "Restricted metadata controls must begin disconnected"))
    check("Google authorization is disconnected and no scope is pre-granted",
          lambda:require(auth["ok"] and not auth["auth"]["connected"] and
            not auth["auth"]["permissionsGranted"] and
            not auth["auth"]["config"]["clientId"],str(auth)))
    check("Desktop OAuth client secret has private input and no stored value on startup",
          lambda:require(
            driver.find_element(By.ID,"google-client-secret").get_attribute("type")=="password" and
            driver.find_element(By.ID,"google-client-secret").get_attribute("value")=="" and
            not driver.find_element(By.ID,"google-secret-clear").is_enabled() and
            "No Desktop OAuth client secret stored" in driver.find_element(By.ID,"google-secret-status").text,
            "Desktop OAuth secret must not prefill or appear in saved settings"))
    check("Google OAuth prepare is disabled until a Desktop secret is entered locally",
          lambda:require(not driver.find_element(By.ID,"google-prepare").is_enabled(),
            "Google OAuth prepare should not launch without session credentials"))
    check("Google stuck-sign-in reset is available but disabled until authorization starts",
          lambda:require(
            driver.find_element(By.ID,"google-reset").is_displayed() and
            not driver.find_element(By.ID,"google-reset").is_enabled(),
            "Google reset control should start disabled"))
    check("Google OAuth error classifier preserves stage without exposing codes",
          lambda:require(
            "HTTP 400" in driver.execute_script(
                "return explainGoogleLoginFailure({message:'Google rejected the OAuth code exchange (HTTP 400) code=SENSITIVE_AUTH_CODE'},'exchange')") and
            "SENSITIVE_AUTH_CODE" not in driver.execute_script(
                "return explainGoogleLoginFailure({message:'Google rejected the OAuth code exchange (HTTP 400) code=SENSITIVE_AUTH_CODE'},'exchange')") and
            "Firefox did not complete" in driver.execute_script(
                "return explainGoogleLoginFailure({message:'Failed to read https://127.0.0.1/?code=SECRET'},'redirect')"),
            "Google error contains a secret or does not distinguish stages"))
    check("native Firefox uses two-option OAuth launch without deprecated redirect field",
          lambda:require(
            driver.execute_script("""
              const prepared='https://accounts.google.com/o/oauth2/v2/auth'+
                '?response_type=code&redirect_uri='+encodeURIComponent('http://127.0.0.1/mozoauth2/test');
              let received=null;
              const fake={identity:{launchWebAuthFlow:(details)=>{received=details;return Promise.resolve('ignored');}}};
              window.WorkspaceGoogleLogin.launch(fake,prepared);
              return received && received.interactive===true &&
                received.url===prepared && !('redirect_uri' in received) &&
                Object.keys(received).length===2;
            """),
            "Firefox launch helper changed the established two-field API contract"))
    check("native Firefox OAuth launch errors are redacted and actionable",
          lambda:require(
            "AUTH_START_BROWSER_REJECTED" in driver.execute_script("""
              return window.WorkspaceGoogleLogin.safeStartFailure(
                new Error('callback code=TOP_SECRET_DO_NOT_ECHO'));
            """) and
            "TOP_SECRET_DO_NOT_ECHO" not in driver.execute_script("""
              return window.WorkspaceGoogleLogin.safeStartFailure(
                new Error('callback code=TOP_SECRET_DO_NOT_ECHO'));
            """),
            "The Firefox launch error might reveal OAuth secrets"))
    check("Google sign-in is opt-in and disabled before preparation",
          lambda:require(not driver.find_element(By.ID,"google-connect").is_enabled(),
            "Connect Google unexpectedly enabled"))
    check("Google OAuth client ID field includes the exact Google Auth Platform Clients shortcut",
          lambda:require(
            driver.find_element(By.ID,"google-create-client-link").get_attribute("href")==
              "https://console.cloud.google.com/auth/clients" and
            driver.find_element(By.ID,"google-create-client-link").get_attribute("target")=="_blank" and
            "noopener" in (driver.find_element(By.ID,"google-create-client-link").get_attribute("rel") or "") and
            "noreferrer" in (driver.find_element(By.ID,"google-create-client-link").get_attribute("rel") or "") and
            driver.find_element(By.ID,"google-create-client-link").is_displayed(),
            "Missing or insecure Google OAuth client creation link"))
    check("Google OAuth client guidance distinguishes Desktop client ID from client secret",
          lambda:require(
            "Create client" in driver.find_element(By.CSS_SELECTOR,".google-oauth-client-help").text and
            "Desktop app" in driver.find_element(By.CSS_SELECTOR,".google-oauth-client-help").text and
            "separately generated" in driver.find_element(By.CSS_SELECTOR,".google-oauth-client-help").text,
            "OAuth setup guidance is incomplete"))

    client="123456789-abcdefabcdef.apps.googleusercontent.com"
    input=driver.find_element(By.ID,"google-client-id")
    input.send_keys(client)
    driver.find_element(By.CSS_SELECTOR,'#google-config-form button[type="submit"]').click()
    WebDriverWait(driver,10).until(
        lambda d:extension_call({"type":"GOOGLE_AUTH_STATUS"})["auth"]["config"]["clientId"]==client)
    check("public OAuth Desktop client ID saves locally without tokens",
          lambda:require(not extension_call({"type":"GOOGLE_AUTH_STATUS"})["auth"]["connected"],
            "Unexpected Google account connection"))
    driver.refresh()
    WebDriverWait(driver,10).until(
        lambda d:d.find_element(By.ID,"google-client-id").get_attribute("value")==client)
    check("OAuth configuration persists without contacting Google",
          lambda:require(not driver.find_element(By.ID,"google-connect").is_enabled(),
            "Connection enabled without Firefox host consent"))
    blocked=driver.execute_async_script("""
      const done=arguments[arguments.length-1];
      browser.runtime.sendMessage({type:"GOOGLE_AUTH_PREPARE"})
        .then(done,error=>done({ok:false,error:String(error)}));
    """)
    check("OAuth preparation is blocked until Google API origins are granted",
          lambda:require(not blocked["ok"] and "Grant" in blocked.get("error",""),str(blocked)))

    # Public provider reasoning is shown only after a real event. The optional
    # larger output budget is never selected on a fresh installation.
    check("reasoning presentation exists in Hub without fabricating model thought",
          lambda:require(
            driver.find_element(By.ID,"ai-output-budget").get_attribute("value")=="768" and
            driver.find_element(By.ID,"ai-trace").get_attribute("hidden") is not None and
            driver.find_element(By.ID,"ai-reasoning-label").get_attribute("textContent")=="Thinking…" and
            "Provider reasoning summary" in
              driver.find_element(By.ID,"ai-summary-details").get_attribute("outerHTML"),
            "Reasoning panel has incorrect default state"))
    check("activity and thinking are separate expandable panels",
          lambda:require(
            driver.find_element(By.ID,"ai-activity-details").tag_name=="details" and
            driver.find_element(By.ID,"ai-summary-details").tag_name=="details" and
            "not private internal reasoning" in
              driver.find_element(By.ID,"ai-reasoning-source").get_attribute("textContent"),
            "Reasoning source disclosure is missing"))
    # Exercise only the local loading presentation; no paid inference or
    # Google content is touched. Restore the idle state after reading styles.
    rose_style=driver.execute_script("""
      const board=document.getElementById("ai-trace");
      const selector=name=>document.querySelector(name);
      board.hidden=false;
      board.dataset.stage="thinking";
      const read=name=>getComputedStyle(selector(name)).animationName;
      const output={
        tileCount:selector("#ai-trace").querySelectorAll(".rose-tile").length,
        right:read(".rose-tile--right"),
        down:read(".rose-tile--down"),
        left:read(".rose-tile--left"),
        up:read(".rose-tile--up"),
        spirit:read(".rose-spirit"),
        spiritDuration:getComputedStyle(selector(".rose-spirit")).animationDuration,
        tileDuration:getComputedStyle(selector(".rose-tile--right")).animationDuration,
        spark:read(".rose-spark--cyan"),
        tileArt:getComputedStyle(selector(".rose-tile--right"),"::before").backgroundImage,
        loader:!!selector(".ayarime-rose-loader")
      };
      board.dataset.stage="idle";
      board.hidden=true;
      return output;
    """)
    check("Ayarime rose has four animated quadrants and alternating axis rotation",
          lambda:require(
            rose_style["loader"] and rose_style["tileCount"]==4 and
            rose_style["right"]=="rose-fold-right" and
            rose_style["down"]=="rose-fold-down" and
            rose_style["left"]=="rose-fold-left" and
            rose_style["up"]=="rose-fold-up" and
            rose_style["spirit"]=="rose-alternate-axes" and
            rose_style["spiritDuration"]=="7.6s" and
            rose_style["tileDuration"]=="3.8s" and
            rose_style["spark"]=="rose-magic-spark" and
            "ayarime-rose-outline.svg" in rose_style["tileArt"],
            "Rose animation or bundled vector did not load: "+str(rose_style)))
    ai=extension_call({"type":"AI_STATUS"})
    check("BYOK defaults to disconnected without provider permission or a key",
          lambda:require(ai["ok"] and not ai["ai"]["hasSessionKey"] and
            not ai["ai"]["hostGranted"] and not ai["ai"]["googleDataIncluded"],str(ai)))
    check("AI metadata verification is unavailable without permission or a session key",
          lambda:require(not driver.find_element(By.ID,"ai-check-model").is_enabled(),
            "Model metadata check unexpectedly enabled"))
    check("Google API diagnostics cannot run before OAuth consent",
          lambda:require(not driver.find_element(By.ID,"google-check").is_enabled(),
            "Google scope check unexpectedly enabled"))
    check("OpenAI offer model catalog defaults to GPT-5.4 Mini with editable ID",
          lambda:require(ai["ai"]["model"]=="gpt-5.4-mini" and
            driver.find_element(By.ID,"ai-model").get_attribute("value")=="gpt-5.4-mini" and
            driver.find_element(By.ID,"ai-model").get_attribute("list")=="openai-model-presets",
            "OpenAI model preset is not configured"))
    check("live trace UI starts hidden without fetching data or a session key",
          lambda:require(driver.find_element(By.ID,"ai-stream-options").is_displayed() and
            not driver.find_element(By.ID,"ai-trace").is_displayed() and
            not driver.find_element(By.ID,"ai-cancel").is_displayed() and
            driver.execute_script("return typeof window.WorkspaceTraceUI")=="object",
            "Unexpected trace surface or missing streaming controller"))
    check("complimentary model selector contains screenshot models in two groups",
          lambda:require(
            driver.find_element(By.ID,"ai-model-choice").is_displayed() and
            len(driver.find_elements(By.CSS_SELECTOR,"#ai-model-choice optgroup"))==3 and
            len(driver.find_elements(By.CSS_SELECTOR,"#ai-model-choice optgroup:nth-of-type(1) option"))==8 and
            len(driver.find_elements(By.CSS_SELECTOR,"#ai-model-choice optgroup:nth-of-type(2) option"))==9,
            "OpenAI screenshot catalog groups are incomplete"))
    check("offer enrollment is unchecked and usage is only locally observed",
          lambda:require(
            not driver.find_element(By.ID,"ai-offer-enrolled").is_selected() and
            "NOT remaining free tokens" in driver.find_element(By.ID,"ai-offer-small-count").text and
            "eligibility" in driver.find_element(By.ID,"ai-offer-panel").text,
            "Offer view incorrectly claims verified free balance"))
    check("web search is disabled by default; summary effort selectable",
          lambda:require(not driver.find_element(By.ID,"ai-web-search").is_selected() and
            driver.find_element(By.ID,"ai-effort").get_attribute("value")=="medium",
            "The browser selected a potentially billable tool unexpectedly"))
    check("Ask Ayarime is disabled until user explicitly configures the provider",
          lambda:require(not driver.find_element(By.ID,"ai-send").is_enabled(),
            "AI prompt unexpectedly enabled"))
    Select(driver.find_element(By.ID,"ai-provider")).select_by_value("gemini")
    driver.find_element(By.CSS_SELECTOR,'#ai-settings-form button[type="submit"]').click()
    WebDriverWait(driver,10).until(
        lambda d:extension_call({"type":"AI_STATUS"})["ai"]["provider"]=="gemini")
    check("switching provider changes only local model preferences",
          lambda:require(not extension_call({"type":"AI_STATUS"})["ai"]["hasSessionKey"],
            "Provider switch retained credentials"))
    keyfield=driver.find_element(By.ID,"ai-key")
    keyfield.send_keys("TESTKEY123456")
    driver.find_element(By.ID,"ai-set-key").click()
    WebDriverWait(driver,10).until(
        lambda d:"Allow this provider and optional data-sharing consent" in d.find_element(By.ID,"ai-status").text)
    check("BYOK session key cannot be stored without provider permission",
          lambda:require(not extension_call({"type":"AI_STATUS"})["ai"]["hasSessionKey"],
            "Key accepted without permission"))

    check("Morning Coffee appears in Hub but has no cached briefing",
          lambda:require(driver.find_element(By.ID,"coffee-run").is_displayed() and
            not driver.find_element(By.ID,"coffee-results").text.strip(),
            "Briefing appeared without an explicit request"))
    driver.find_element(By.ID,"coffee-run").click()
    WebDriverWait(driver,10).until(
        lambda d:"session has expired" in d.find_element(By.ID,"coffee-status").text)
    check("Morning Coffee cannot read before Google authorization",
          lambda:require(not driver.find_element(By.ID,"coffee-results").text.strip(),
            "Unauthorized Calendar/Tasks data rendered"))
    driver.find_element(By.ID,"coffee-calendar").click()
    driver.find_element(By.ID,"coffee-tasks").click()
    driver.find_element(By.ID,"coffee-run").click()
    WebDriverWait(driver,10).until(
        lambda d:"Select Calendar and/or Tasks" in d.find_element(By.ID,"coffee-status").text)
    check("Morning Coffee requires explicit selection of a data source",
          lambda:require(not driver.find_element(By.ID,"coffee-results").text.strip(),
            "Briefing should not have been prepared"))

    updater=extension_call({"type":"UPDATE_STATUS"})
    check("release notifications start opt-in and do not claim an installed update",
          lambda:require(updater["ok"] and updater["update"]["current"]=="0.14.0" and
            not updater["update"]["enabled"] and
            updater["update"]["behavior"]=="notification-only",str(updater)))
    check("release check is disabled before optional GitHub permission",
          lambda:require(not driver.find_element(By.ID,"update-check").is_enabled(),
            "Release checks unexpectedly enabled"))
    Select(driver.find_element(By.ID,"update-channel")).select_by_value("preview")
    WebDriverWait(driver,10).until(
        lambda d:extension_call({"type":"UPDATE_STATUS"})["update"]["channel"]=="preview")
    driver.refresh()
    WebDriverWait(driver,10).until(
        lambda d:d.find_element(By.ID,"update-channel").get_attribute("value")=="preview")
    check("release-channel preference persists without network permission",
          lambda:require(not extension_call({"type":"UPDATE_STATUS"})["update"]["enabled"],
            "Daily update polling was turned on unexpectedly"))
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
