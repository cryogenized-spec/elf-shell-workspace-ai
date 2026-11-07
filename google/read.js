/* Read-only Google Calendar/Tasks REST adapters; no arbitrary URLs or writes. */
(function(root){
  "use strict";
  const BASE_CAL="https://www.googleapis.com/calendar/v3";
  const BASE_TASKS="https://tasks.googleapis.com/tasks/v1";
  function safeText(input,limit=240) {
    return typeof input==="string" ? input.slice(0,limit) : "";
  }
  function localDayWindow(now) {
    const from=new Date(now);
    if(Number.isNaN(from.getTime())) throw new Error("Invalid local time");
    from.setHours(0,0,0,0);
    const until=new Date(from);
    until.setDate(until.getDate()+1);
    return {from:from.toISOString(),until:until.toISOString()};
  }
  function safeArray(value,limit) {
    return Array.isArray(value)?value.slice(0,limit):[];
  }
  function requireToken(token,scope,now=Date.now()) {
    if(!token || typeof token.accessToken!=="string" ||
       !Number.isFinite(token.expiresAt) || token.expiresAt<=now ||
       !Array.isArray(token.scopes) || !token.scopes.includes(scope))
       throw new Error("Google session expired or the selected scope was not granted");
    return token.accessToken;
  }
  async function getJson(url,token,fetchImpl) {
    const parsed=new URL(url);
    if(parsed.protocol!=="https:" || ![new URL(BASE_CAL).hostname,new URL(BASE_TASKS).hostname].includes(parsed.hostname))
      throw new Error("Google API destination is not permitted");
    const response=await fetchImpl(parsed.href,{
      method:"GET",
      headers:{"Authorization":"Bearer "+token,"Accept":"application/json"},
      redirect:"error",cache:"no-store",credentials:"omit"
    });
    if(!response || !Number.isInteger(response.status))
      throw new Error("Google API response was invalid");
    if(!response.ok) {
      if(response.status===401 || response.status===403) throw new Error("Google authorization or permission was denied");
      throw new Error("Google API request failed (HTTP "+response.status+")");
    }
    const data=await response.json();
    if(!data || typeof data!=="object" || Array.isArray(data))
      throw new Error("Google returned an invalid JSON response");
    return data;
  }
  async function todayCalendar(token,fetchImpl,now=Date.now()) {
    const key=requireToken(token,"https://www.googleapis.com/auth/calendar.events.readonly",now);
    const window=localDayWindow(now);
    const url=new URL(BASE_CAL+"/calendars/primary/events");
    url.searchParams.set("timeMin",window.from);
    url.searchParams.set("timeMax",window.until);
    url.searchParams.set("singleEvents","true");
    url.searchParams.set("orderBy","startTime");
    url.searchParams.set("maxResults","30");
    const data=await getJson(url.href,key,fetchImpl);
    return {dateStart:window.from,dateEnd:window.until,limited:Boolean(data.nextPageToken),
      events:safeArray(data.items,30).map(item=>({
        id:safeText(item.id,180),
        title:safeText(item.summary||"Untitled event",180),
        start:safeText(item.start?.dateTime||item.start?.date,50),
        end:safeText(item.end?.dateTime||item.end?.date,50),
        status:safeText(item.status,30),
        description:safeText(item.description,2000),
        sourceUrl:safeText(item.htmlLink,2048)
      }))};
  }
  async function currentTasks(token,fetchImpl,now=Date.now()) {
    const key=requireToken(token,"https://www.googleapis.com/auth/tasks.readonly",now);
    const listUrl=BASE_TASKS+"/users/@me/lists?maxResults=6";
    const lists=await getJson(listUrl,key,fetchImpl);
    const selected=safeArray(lists.items,5);
    const result=[];
    let hasMore=Boolean(lists.nextPageToken)||safeArray(lists.items,6).length>5;
    for(const list of selected) {
      const id=typeof list.id==="string"?list.id:"";
      if(!id || id.length>512) continue;
      const url=new URL(BASE_TASKS+"/lists/"+encodeURIComponent(id)+"/tasks");
      url.searchParams.set("maxResults","25");
      url.searchParams.set("showCompleted","false");
      url.searchParams.set("showDeleted","false");
      const data=await getJson(url.href,key,fetchImpl);
      hasMore ||= Boolean(data.nextPageToken);
      result.push({list:safeText(list.title||"Tasks",100),
        tasks:safeArray(data.items,25).map(task=>({
          id:safeText(task.id,180),
          title:safeText(task.title||"Untitled task",180),
          due:safeText(task.due,50),
          status:safeText(task.status,30),
          notes:safeText(task.notes,2000),
          sourceUrl:safeText(task.webViewLink,2048)
        }))});
    }
    return {lists:result,limited:hasMore};
  }
  root.WorkspaceGoogleRead={localDayWindow,requireToken,todayCalendar,currentTasks};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.WorkspaceGoogleRead;
})(globalThis);