/* Explicit, local-only Google Master connection controls. Hub only.
 * Never requests a grant at page load; never reads account contents.
 * Revoking Firefox host/data permission is possible in about:addons.
 */
(function(root){
  "use strict";
  const panel=document.querySelector(".master-panel");
  if(!panel)return;
  const AUTH="https://google-master-auth.cryogenized.workers.dev/*";
  const MCP="https://google-master-mcp.cryogenized.workers.dev/*";
  const DATA=["authenticationInfo","personalCommunications",
    "websiteContent","personallyIdentifyingInfo"];
  const get=id=>document.getElementById(id);
  const status=get("master-status"),summary=get("master-probe-result");
  const allow=get("master-grant"),connect=get("master-connect");
  const probe=get("master-probe"),disconnect=get("master-disconnect");
  let busy=false;
  function tell(message,error=false){
    status.textContent=message;
    status.classList.toggle("error",error);
  }
  function display(state){
    if(!state)return;
    const active=state.connected===true;
    allow.disabled=busy || state.permissionsGranted===true;
    connect.disabled=busy || active || state.permissionsGranted!==true;
    probe.disabled=busy || !active;
    disconnect.disabled=busy || !active;
    if(!busy)tell(active
      ?"Connected with a short-lived MCP read-only session. No account contents have been fetched."
      :state.permissionsGranted
        ?"Worker hosts approved. Use Connect to authorize a separate read-only MCP session."
        :"Not connected. Allow the two exact Worker hosts to continue.");
  }
  async function ask(type){
    const result=await browser.runtime.sendMessage({type});
    if(!result?.ok)throw Error("Unable to complete this private MCP operation");
    return result;
  }
  async function refresh(){
    try{display((await ask("MASTER_STATUS")).master);}
    catch{tell("Google Master account access is unavailable in this build.",true);
      for(const control of [connect,probe,disconnect])control.disabled=true;}
  }
  const origin=get("master-origin");
  if(origin){
    // moz-extension: is not a standard HTTP(S) URL. URL.origin may serialize
    // as the opaque string "null" even though Firefox's extension principal
    // has an exact moz-extension://<UUID> origin for the Worker CORS allowlist.
    const parsed=new URL(browser.runtime.getURL(""));
    const instanceOrigin=parsed.protocol==="moz-extension:" && parsed.hostname
      ?parsed.protocol+"//"+parsed.host:"Unavailable in this Firefox context";
    origin.textContent="This installed Firefox instance uses origin "+
      instanceOrigin+
      ". Add exactly this origin to the protected Worker's browser-origin allowlist when authorized.";
  }
  // MUST be invoked synchronously inside the actual click: Firefox permission
  // requests are user-gesture gated. No Google OAuth / account read here.
  allow.addEventListener("click",()=>{
    allow.disabled=true;
    browser.permissions.request({origins:[AUTH,MCP],data_collection:DATA})
      .then(granted=>{
        if(!granted)tell("Worker host and data permissions were declined. No connection made.");
        return refresh();
      },()=>{tell("Firefox did not grant Worker host and data access.",true);
        return refresh();});
  });
  connect.addEventListener("click",async()=>{
    busy=true;for(const b of [allow,connect,probe,disconnect])b.disabled=true;
    tell("Opening Firefox's separate MCP read-only OAuth authorization…");
    try{
      const response=await ask("MASTER_CONNECT");
      tell(response.master.connected
        ?"MCP read-only session connected. No Google data has been fetched."
        :"No MCP session was established.",!response.master.connected);
    }catch{
      tell("MCP OAuth was cancelled, denied or could not be completed. No account read occurred.",true);
    }finally{busy=false;await refresh();}
  });
  probe.addEventListener("click",async()=>{
    busy=true;probe.disabled=true;
    summary.textContent="Checking the read-only capabilities catalogue; no Google content is requested…";
    try{
      const reply=await ask("MASTER_PROBE");
      summary.textContent="Verified "+reply.count+
        " allowlisted read operations. No Gmail, Drive, Calendar or Tasks content was retrieved.";
    }catch{summary.textContent="Capability verification failed; no Google account content was returned.";}
    finally{busy=false;await refresh();}
  });
  disconnect.addEventListener("click",async()=>{
    busy=true;disconnect.disabled=true;
    tell("Clearing the Firefox MCP session and requesting token revocation…");
    try{
      const reply=await ask("MASTER_DISCONNECT");
      tell(reply.master.remotelyRevoked
        ?"Disconnected. The local session was cleared and the remote token was revoked."
        :"Local session cleared. Remote revocation could not be confirmed; revoke the client in your account settings if needed.");
      summary.textContent="No connected MCP client.";
    }catch{tell("Unable to confirm local MCP session removal.",true);}
    finally{busy=false;await refresh();}
  });
  browser.storage?.onChanged?.addListener((changes,area)=>{
    if(area==="session" && Object.keys(changes).some(key=>key.startsWith("elfshell.master.oauth")))
      void refresh();
  });
  browser.permissions?.onRemoved?.addListener(()=>void refresh());
  void refresh(); // status is storage-only; no network or automatic sign-in.
})(globalThis);
