/* Morning Coffee v0.8: deterministic, local-only briefing.
   No AI requests; no inferred deadlines or side effects. */
(function(root) {
  "use strict";
  const MAX_ITEMS=80, MAX_RELATIONS=15;
  const DOC_LINK=/https:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]{5,180})(?:\/[a-zA-Z0-9._/?=&%-]*)?/g;
  function text(value,limit=180) {
    return typeof value==="string" ? value.trim().slice(0,limit) : "";
  }
  function localDay(now) {
    const date=new Date(now);
    if(!Number.isFinite(date.getTime()))throw Error("Invalid briefing date");
    return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),
      String(date.getDate()).padStart(2,"0")].join("-");
  }
  function safeSourceLink(candidate,kind) {
    if(typeof candidate!=="string"||candidate.length>2048)return null;
    try {
      const u=new URL(candidate);
      if(u.protocol!=="https:"||u.username||u.password||u.port)return null;
      if(kind==="calendar" && (u.hostname==="calendar.google.com" ||
        (u.hostname==="www.google.com" && u.pathname.startsWith("/calendar/"))))
        return u.href;
      if(kind==="tasks" && (u.hostname==="tasks.google.com" ||
        (u.hostname==="calendar.google.com" && u.pathname.startsWith("/calendar/"))))
        return u.href;
    }catch{/* untrusted API links are not navigable */}
    return null;
  }
  function fileReferences(source) {
    if(typeof source!=="string")return [];
    const refs=new Set();
    DOC_LINK.lastIndex=0;
    let match;
    const sample=source.slice(0,3000);
    while((match=DOC_LINK.exec(sample))!==null && refs.size<10)
      refs.add("file:"+match[1]+":"+match[2]);
    return [...refs];
  }
  function eventItem(event,now) {
    if(!event || event.status==="cancelled")return null;
    const title=text(event.title||"Untitled event");
    const start=text(event.start,50),end=text(event.end,50);
    const time=start.includes("T")?Date.parse(start):NaN;
    const finish=end.includes("T")?Date.parse(end):NaN;
    const minutes=Number.isFinite(time)?Math.round((time-now)/60000):null;
    let attention="Today";
    let priority=50;
    if(start && !start.includes("T")){attention="All-day appointment";priority=55;}
    else if(minutes!==null && minutes>=0 && minutes<=120) {
      attention="Starting within two hours";priority=90;
    }else if(minutes!==null && minutes<0 && Number.isFinite(finish)&&finish>now){
      attention="Currently scheduled";priority=80;
    }else if(minutes!==null && minutes<0){
      attention="Earlier today";priority=20;
    }
    return {type:"calendar",id:text(event.id,180),title,when:start,
      attention,priority,sourceUrl:safeSourceLink(event.sourceUrl,"calendar"),
      refs:fileReferences(event.description)};
  }
  function taskItem(task,list,day) {
    if(!task||task.status==="completed")return null;
    const scheduled=typeof task.due==="string"?task.due.slice(0,10):"";
    const validDate=/^\d{4}-\d{2}-\d{2}$/.test(scheduled)?scheduled:null;
    let attention="Unscheduled task",priority=25;
    if(validDate && validDate<day){attention="Scheduled before today — review";priority=95;}
    else if(validDate===day){attention="Scheduled for today";priority=70;}
    else if(validDate){attention="Scheduled for later";priority=10;}
    return {type:"tasks",id:text(task.id,180),title:text(task.title||"Untitled task"),
      list:text(list,100),when:validDate,attention,priority,
      sourceUrl:safeSourceLink(task.sourceUrl,"tasks"),
      refs:fileReferences(task.notes)};
  }
  function relations(items) {
    const groups=new Map();
    for(const item of items)for(const ref of item.refs) {
      if(!groups.has(ref))groups.set(ref,[]);
      groups.get(ref).push(item);
    }
    const results=[];
    for(const [ref,group] of groups){
      const unique=[...new Set(group.map(i=>i.type+":"+i.id))];
      if(unique.length<2)continue;
      results.push({
        strength:"explicit-reference",
        explanation:"These items contain the same Google file link. That does not prove they are the same project.",
        fileKey:ref,
        titles:group.slice(0,3).map(i=>i.title),
        sourceCount:unique.length
      });
      if(results.length>=MAX_RELATIONS)break;
    }
    return results;
  }
  function compile(snapshot,now=Date.now()){
    if(!snapshot||typeof snapshot!=="object")throw Error("Missing Calendar/Tasks snapshot");
    const day=localDay(now),events=[],tasks=[],errors=[];
    const used=[];
    if(snapshot.calendar) {
      used.push("Calendar");
      for(const source of (snapshot.calendar.events||[]).slice(0,30)){
        const item=eventItem(source,now);
        if(item)events.push(item);
      }
    }
    if(snapshot.tasks){
      used.push("Tasks");
      for(const list of (snapshot.tasks.lists||[]).slice(0,5))
        for(const source of (list.tasks||[]).slice(0,25)){
          const item=taskItem(source,list.list,day);
          if(item)tasks.push(item);
        }
    }
    for(const error of (snapshot.errors||[]).slice(0,8))
      errors.push({service:text(error.service,35),message:text(error.message,220)});
    const all=[...events,...tasks].slice(0,MAX_ITEMS);
    const attention=[...all].sort((a,b)=>b.priority-a.priority||
      a.title.localeCompare(b.title)).slice(0,15).map(({refs,...item})=>item);
    return {
      generatedAt:new Date(now).toISOString(),localDate:day,
      sources:used,partial:Boolean(snapshot.calendar?.limited||snapshot.tasks?.limited||errors.length),
      counts:{events:events.length,tasks:tasks.length,highlighted:attention.filter(i=>i.priority>=70).length},
      attention,connections:relations(all),errors,
      notices:[
        "Google Tasks scheduled dates are not necessarily deadlines; review rather than assume overdue.",
        "Only today's primary Calendar events and a limited set of incomplete Tasks are included.",
        "No Gmail messages, Drive file bodies or AI provider requests are included."
      ],
      aiUsed:false, gmailIncluded:false
    };
  }
  root.WorkspaceMorningCoffee={localDay,safeSourceLink,fileReferences,compile};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.WorkspaceMorningCoffee;
})(globalThis);
