/* Opt-in release notifications. Firefox remains the only installer of signed add-on updates. */
(function(root) {
  "use strict";
  const U=root.WorkspaceReleaseUtils;
  const KEY="elfshell.updater.preferences.v1";
  const ALARM="elfshell-workspace-check-release";
  const HOST="https://api.github.com/*";
  function defaults(){
    return {enabled:false,channel:"stable",ignoredVersion:null,
      checkedAt:null,latest:null,error:null};
  }
  function sanitize(raw){
    const base=defaults();
    if(!raw||typeof raw!=="object"||Array.isArray(raw))return base;
    base.enabled=raw.enabled===true;
    base.channel=raw.channel==="preview"?"preview":"stable";
    base.ignoredVersion=U.parseVersion(raw.ignoredVersion)?raw.ignoredVersion:null;
    base.checkedAt=Number.isFinite(raw.checkedAt)&&raw.checkedAt>0?raw.checkedAt:null;
    base.latest=raw.latest && U.validateRelease({
      tag_name:raw.latest.version,html_url:raw.latest.url,
      name:raw.latest.title,body:raw.latest.notes,
      published_at:raw.latest.publishedAt,
      prerelease:raw.latest.prerelease,draft:false
    });
    base.error=typeof raw.error==="string"?raw.error.slice(0,140):null;
    return base;
  }
  async function stored(browserApi){
    const raw=(await browserApi.storage.local.get(KEY))[KEY];
    return sanitize(raw);
  }
  async function permitted(browserApi){
    return Boolean(await browserApi.permissions.contains({origins:[HOST]}));
  }
  function installed(browserApi) {
    const version=browserApi.runtime?.getManifest?.().version;
    if(!U.parseVersion(version))throw Error("Installed add-on version could not be verified");
    return version;
  }
  async function status(browserApi){
    const setting=await stored(browserApi);
    const current=installed(browserApi);
    const grant=await permitted(browserApi);
    const update=setting.latest&&U.compareVersion(setting.latest.version,current)>0
      ? setting.latest:null;
    return {current,enabled:setting.enabled,channel:setting.channel,
      permissionGranted:grant,checkedAt:setting.checkedAt,
      latest:setting.latest,available:Boolean(update),
      notice:Boolean(update&&update.version!==setting.ignoredVersion),
      ignoredVersion:setting.ignoredVersion,error:setting.error,
      behavior:"notification-only",installMethod:"Firefox signed add-on update"};
  }
  async function badge(browserApi){
    if(!browserApi.action?.setBadgeText)return;
    try{
      const s=await status(browserApi);
      await browserApi.action.setBadgeText({text:s.notice?"1":""});
      if(s.notice&&browserApi.action.setBadgeBackgroundColor)
        await browserApi.action.setBadgeBackgroundColor({color:"#7558aa"});
    }catch{/* badge failures never interrupt workspace */}
  }
  async function syncAlarm(browserApi){
    if(!browserApi.alarms)return;
    const pref=await stored(browserApi);
    if(pref.enabled && await permitted(browserApi))
      await browserApi.alarms.create(ALARM,{periodInMinutes:U.CHECK_EVERY_MINUTES});
    else await browserApi.alarms.clear(ALARM);
  }
  async function configure(browserApi,message){
    if(typeof message.enabled!=="boolean" ||
       !["stable","preview"].includes(message.channel))
      throw Error("Choose stable or preview release notifications");
    if(message.enabled && !await permitted(browserApi))
      throw Error("Allow GitHub release metadata access in Firefox first");
    const pref=await stored(browserApi);
    pref.enabled=message.enabled;pref.channel=message.channel;
    pref.ignoredVersion=null;
    pref.latest=null;pref.checkedAt=null;pref.error=null;
    await browserApi.storage.local.set({[KEY]:pref});
    await syncAlarm(browserApi);
    await badge(browserApi);
    return status(browserApi);
  }
  async function check(browserApi,fetchImpl){
    if(!await permitted(browserApi))
      throw Error("GitHub release metadata permission has not been granted");
    const pref=await stored(browserApi);
    const current=installed(browserApi);
    try {
      const response=await fetchImpl(U.API_URL,{
        method:"GET",
        headers:{"Accept":"application/vnd.github+json"},
        cache:"no-store",credentials:"omit",redirect:"error"
      });
      if(!response||!Number.isInteger(response.status))
        throw Error("The GitHub release feed returned an invalid response");
      let releases=[];
      if(response.status===404){
        // A new/private repository may not yet publish publicly visible releases.
      }else if(!response.ok) {
        if(response.status===403 || response.status===429)
          throw Error("GitHub release check rate-limited; try later");
        throw Error("GitHub release check failed (HTTP "+response.status+")");
      }else{
        releases=await response.json();
      }
      const result=U.latestFor(releases,current,pref.channel);
      pref.latest=result.latest;
      pref.checkedAt=Date.now();
      pref.error=response.status===404?"No public GitHub release is visible yet":null;
    }catch(error) {
      pref.error=String(error?.message||"Unable to check releases").slice(0,140);
      // A network failure must never present a stale timestamp as a successful check.
    }
    await browserApi.storage.local.set({[KEY]:pref});
    await badge(browserApi);
    return status(browserApi);
  }
  async function ignore(browserApi,message){
    const pref=await stored(browserApi);
    if(!pref.latest || message.version!==pref.latest.version)
      throw Error("Only the currently advertised release can be dismissed");
    pref.ignoredVersion=message.version;
    await browserApi.storage.local.set({[KEY]:pref});
    await badge(browserApi);
    return status(browserApi);
  }
  async function handle(browserApi,fetchImpl,message){
    switch(message.type){
      case "UPDATE_STATUS":return {ok:true,update:await status(browserApi)};
      case "UPDATE_CONFIG":return {ok:true,update:await configure(browserApi,message)};
      case "UPDATE_CHECK":return {ok:true,update:await check(browserApi,fetchImpl)};
      case "UPDATE_IGNORE":return {ok:true,update:await ignore(browserApi,message)};
      default:throw Error("Unrecognized update notification request");
    }
  }
  root.WorkspaceReleaseChecker={KEY,ALARM,HOST,defaults,sanitize,
    status,configure,check,ignore,badge,syncAlarm,handle};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.WorkspaceReleaseChecker;
})(globalThis);
