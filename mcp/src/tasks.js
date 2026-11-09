// Purpose-built Google Tasks REST operations; no arbitrary URL/method tool.
import {requireSession} from "./sessions.js";
import {createTaskAction} from "./approvals.js";
const BASE="https://tasks.googleapis.com";
const MAX_RESPONSE_BYTES=256*1024;

const small=(s,n=1024)=>typeof s==="string"?s.slice(0,n):"";
const safeId=(id)=> {
  if(typeof id!=="string" || id.length<1 || id.length>512 ||
     /[\x00-\x1f]/.test(id))throw Error("INVALID_RESOURCE_ID");
  return encodeURIComponent(id);
};
function taskShape(value) {
  return {
    id:small(value?.id,512),
    title:small(value?.title),
    notes:small(value?.notes,8192),
    status:value?.status==="completed"?"completed":"needsAction",
    scheduledDate:typeof value?.due==="string"?value.due.slice(0,10):null,
    updated:small(value?.updated,50),
    parent:small(value?.parent,512) || null
  };
}
function listShape(value) {
  return {id:small(value?.id,512),title:small(value?.title),updated:small(value?.updated,50)};
}

async function boundedBody(response) {
  const length=Number(response.headers?.get?.("content-length") || 0);
  if(length > MAX_RESPONSE_BYTES)throw Error("GOOGLE_RESPONSE_TOO_LARGE");
  try{
    if(response.body?.getReader){
      const reader=response.body.getReader(),parts=[];
      let size=0;
      try{
        for(;;){
          const {done,value}=await reader.read();
          if(done)break;
          size+=value?.byteLength||0;
          if(size>MAX_RESPONSE_BYTES)throw Error("GOOGLE_RESPONSE_TOO_LARGE");
          parts.push(value);
        }
      }finally{reader.releaseLock();}
      const bytes=new Uint8Array(size);
      let offset=0;
      for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
      return JSON.parse(new TextDecoder().decode(bytes));
    }
    // Test-double fallback, still enforce the output-size bound.
    const value=await response.json();
    if(JSON.stringify(value).length>MAX_RESPONSE_BYTES)throw Error("GOOGLE_RESPONSE_TOO_LARGE");
    return value;
  } catch(error){
    if(error?.message==="GOOGLE_RESPONSE_TOO_LARGE")throw error;
    throw Error("GOOGLE_RESPONSE_INVALID");
  }
}

async function rest(fetchImpl,accessToken,path,{method="GET",query,body}={}) {
  const url=new URL(path,BASE);
  if(url.origin!==BASE || !url.pathname.startsWith("/tasks/v1/"))
    throw Error("GOOGLE_DESTINATION_REJECTED");
  for(const [key,value] of Object.entries(query||{})){
    if(value!==undefined&&value!==null&&value!=="")url.searchParams.set(key,String(value));
  }
  let response;
  try{
    response=await fetchImpl(url.href,{
      method,
      headers:{"Authorization":"Bearer "+accessToken,"Accept":"application/json",
        ...(body===undefined?{}:{"Content-Type":"application/json"})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
      redirect:"error",credentials:"omit",cache:"no-store",
      signal:AbortSignal.timeout(15000)
    });
  }catch{throw Error("GOOGLE_NETWORK_UNAVAILABLE");}
  if(!response||typeof response.status!=="number")throw Error("GOOGLE_RESPONSE_INVALID");
  if(!response.ok){
    // Never echo provider response bodies, token, query details or notes.
    const code=response.status===401?"GOOGLE_UNAUTHORIZED":
      response.status===403?"GOOGLE_FORBIDDEN":
      response.status===404?"GOOGLE_NOT_FOUND":
      response.status===429?"GOOGLE_RATE_LIMITED":
      response.status>=500?"GOOGLE_UNAVAILABLE":"GOOGLE_REQUEST_REJECTED";
    throw Error(code);
  }
  const data=await boundedBody(response);
  if(!data||typeof data!=="object"||Array.isArray(data))
    throw Error("GOOGLE_RESPONSE_INVALID");
  return data;
}

export function createTasksService({sessions,fetchImpl=fetch,approvalGate}) {
  if(!sessions?.get || typeof fetchImpl!=="function")
    throw Error("TASKS_SERVICE_NOT_CONFIGURED");
  return Object.freeze({
    async listTasklists({accountId="default",pageToken,maxResults=25}) {
      const token=await requireSession(sessions,accountId);
      const data=await rest(fetchImpl,token,"/tasks/v1/users/@me/lists",{
        query:{maxResults,pageToken}
      });
      return {accountId,items:(Array.isArray(data.items)?data.items:[])
        .slice(0,maxResults).map(listShape),
        nextPageToken:small(data.nextPageToken,1024)||null,partial:Boolean(data.nextPageToken)};
    },
    async listTasks({accountId="default",tasklistId,maxResults=25,pageToken,
                     showCompleted=false,showAssigned=false}){
      const token=await requireSession(sessions,accountId);
      const data=await rest(fetchImpl,token,
        "/tasks/v1/lists/"+safeId(tasklistId)+"/tasks",{
          query:{maxResults,pageToken,showCompleted,showAssigned,showDeleted:false,showHidden:false}
        });
      return {accountId,tasklistId,items:(Array.isArray(data.items)?data.items:[])
        .slice(0,maxResults).map(taskShape),
        nextPageToken:small(data.nextPageToken,1024)||null,partial:Boolean(data.nextPageToken),
        note:"Scheduled dates are not necessarily deadlines. Hidden completed tasks are not included."};
    },
    async getTask({accountId="default",tasklistId,taskId}){
      const token=await requireSession(sessions,accountId);
      const data=await rest(fetchImpl,token,
        "/tasks/v1/lists/"+safeId(tasklistId)+"/tasks/"+safeId(taskId));
      return {accountId,tasklistId,task:taskShape(data)};
    },
    async createTask(input){
      const action=createTaskAction(input);
      const token=await requireSession(sessions,action.accountId,true);
      if(!approvalGate?.consume)throw Error("WRITE_APPROVAL_REQUIRED");
      await approvalGate.consume(action);
      const body={title:action.title};
      if(action.notes)body.notes=action.notes;
      if(action.scheduledDate)body.due=action.scheduledDate+"T00:00:00.000Z";
      const data=await rest(fetchImpl,token,
        "/tasks/v1/lists/"+safeId(action.tasklistId)+"/tasks",{method:"POST",body});
      return {accountId:action.accountId,tasklistId:action.tasklistId,
        created:true,task:taskShape(data)};
    }
  });
}
