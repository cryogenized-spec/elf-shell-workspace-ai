/* Google Master Worker /v1 typed, read-only adapter (Stage 6).
 * Inert until a trusted caller supplies an independently acquired MCP
 * OAuth bearer token AND explicit per-operation user approval. No Google
 * tokens, API keys, browser account data, or writes are stored here.
 */
(function(root){
  "use strict";
  const RESOURCE="https://google-master-mcp.cryogenized.workers.dev/mcp";
  const READS=Object.freeze([
    "tasks_list_tasklists","tasks_list_tasks","tasks_get_task",
    "script_get_project","script_get_content","script_list_versions",
    "script_list_deployments","drive_list_files","drive_get_file",
    "drive_query_activity","docs_get_document","sheets_get_spreadsheet",
    "sheets_get_values","slides_get_presentation","calendar_list_calendars",
    "calendar_list_events","gmail_list_messages","gmail_get_message",
    "gmail_list_labels","contacts_list_connections","forms_get_form",
    "forms_list_responses","meet_list_conferences","meet_get_space"
  ]);
  const ALLOWED=new Set(READS),MAX_INPUT=32768,MAX_RESULT=512*1024,MAX_TIMEOUT=30000;
  const FORBIDDEN=/^(?:api_?key|access_?token|refresh_?token|authorization|bearer|credential|client_?secret|approval|approved|write|mutation)$/i;
  function fail(code){const e=new Error(code);e.name="WorkspaceGoogleMasterError";return e;}
  function plain(value){return value!==null&&typeof value==="object"&&!Array.isArray(value)&&
    (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);}
  function safeInput(value,depth=0){
    if(depth>6)throw fail("INVALID_INPUT");
    if(value===null||typeof value==="boolean")return;
    if(typeof value==="string"){
      if(value.length>10000)throw fail("INVALID_INPUT");
      return;
    }
    if(typeof value==="number"){
      if(!Number.isFinite(value))throw fail("INVALID_INPUT");
      return;
    }
    if(Array.isArray(value)){
      if(value.length>250)throw fail("INVALID_INPUT");
      for(const item of value)safeInput(item,depth+1);
      return;
    }
    if(!plain(value))throw fail("INVALID_INPUT");
    if(Object.keys(value).length>80)throw fail("INVALID_INPUT");
    for(const [key,entry] of Object.entries(value)){
      if(FORBIDDEN.test(key)||["__proto__","prototype","constructor"].includes(key)||
         key.length>90)throw fail("INVALID_INPUT");
      safeInput(entry,depth+1);
    }
  }
  function inputBody(value){
    if(!plain(value))throw fail("INVALID_INPUT");
    safeInput(value);
    let payload;
    try{payload=JSON.stringify(value);}catch{throw fail("INVALID_INPUT");}
    if(new TextEncoder().encode(payload).byteLength>MAX_INPUT)
      throw fail("INPUT_TOO_LARGE");
    return payload;
  }
  async function boundedJson(response){
    const contentLength=response.headers?.get?.("content-length");
    if(contentLength&&(!/^[0-9]+$/.test(contentLength)||Number(contentLength)>MAX_RESULT))
      throw fail("RESPONSE_TOO_LARGE");
    if(!response.body?.getReader)throw fail("REMOTE_RESPONSE_INVALID");
    const reader=response.body.getReader(),chunks=[];
    let size=0;
    try{
      for(;;){
        const {done,value}=await reader.read();
        if(done)break;
        if(!(value instanceof Uint8Array))throw fail("REMOTE_RESPONSE_INVALID");
        size+=value.byteLength;
        if(size>MAX_RESULT)throw fail("RESPONSE_TOO_LARGE");
        chunks.push(value);
      }
    }finally{
      try{await reader.cancel();}catch{}
      reader.releaseLock();
    }
    const bytes=new Uint8Array(size);
    let pos=0;for(const part of chunks){bytes.set(part,pos);pos+=part.byteLength;}
    try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}
    catch{throw fail("REMOTE_RESPONSE_INVALID");}
  }
  function resource(url){
    let parsed;
    try{parsed=new URL(url);}catch{throw fail("INVALID_RESOURCE");}
    if(parsed.href!==RESOURCE||parsed.protocol!=="https:"||parsed.port||
       parsed.username||parsed.password||parsed.search||parsed.hash)
      throw fail("INVALID_RESOURCE");
    return parsed.origin;
  }
  function create({resourceUrl=RESOURCE,hasHostPermission,getAccessToken,
                   approveRead,fetchImpl=root.fetch,timeoutMs=12000}={}){
    const origin=resource(resourceUrl);
    if(typeof hasHostPermission!=="function"||
       typeof getAccessToken!=="function"||
       typeof approveRead!=="function"||
       typeof fetchImpl!=="function")
      throw fail("CALLBACKS_REQUIRED");
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>MAX_TIMEOUT)
      throw fail("INVALID_TIMEOUT");
    async function request(path,method,input,operation){
      // Consent is per call and MUST precede fetching or obtaining a bearer.
      // Callback error details may contain local account or token information:
      // always return a fixed safe category to callers.
      let approved=false;
      try{
        approved=await approveRead(Object.freeze({operation,risk:"read",
          inputKeys:Object.freeze(Object.keys(input||{}).sort())}));
      }catch{throw fail("USER_CONSENT_REQUIRED");}
      if(approved!==true)throw fail("USER_CONSENT_REQUIRED");
      let permitted=false;
      try{permitted=await hasHostPermission(origin);}
      catch{throw fail("FIREFOX_HOST_PERMISSION_REQUIRED");}
      if(permitted!==true)throw fail("FIREFOX_HOST_PERMISSION_REQUIRED");
      let token;
      try{token=await getAccessToken();}
      catch{throw fail("MCP_TOKEN_REQUIRED");}
      if(typeof token!=="string"||token.length<8||token.length>8192||
         /[^\x21-\x7e]/.test(token))throw fail("MCP_TOKEN_REQUIRED");
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),timeoutMs);
      const headers={Authorization:"Bearer "+token,Accept:"application/json"};
      const options={method,headers,redirect:"error",cache:"no-store",
        credentials:"omit",referrerPolicy:"no-referrer",signal:controller.signal};
      if(method==="POST"){headers["Content-Type"]="application/json";options.body=inputBody(input);}
      try{
        const reply=await fetchImpl(origin+path,options);
        if(!reply||!Number.isSafeInteger(reply.status))throw fail("REMOTE_RESPONSE_INVALID");
        if(!reply.ok){
          // No provider response body or untrusted server text is surfaced.
          if(reply.status===401)throw fail("CLIENT_UNAUTHORIZED");
          if(reply.status===403)throw fail("CLIENT_FORBIDDEN");
          if(reply.status===429)throw fail("RATE_LIMITED");
          throw fail("REMOTE_REQUEST_FAILED");
        }
        const result=await boundedJson(reply);
        if(!plain(result))throw fail("REMOTE_RESPONSE_INVALID");
        return result;
      }catch(error){
        if(controller.signal.aborted)throw fail("REMOTE_TIMEOUT");
        if(error?.name==="WorkspaceGoogleMasterError")throw error;
        throw fail("REMOTE_UNAVAILABLE");
      }finally{clearTimeout(timer);}
    }
    async function capabilities(){
      const data=await request("/v1/capabilities","GET",{},"capabilities");
      if(!Array.isArray(data.operations)||data.operations.length>256)
        throw fail("REMOTE_RESPONSE_INVALID");
      const accepted=[],seen=new Set();
      for(const item of data.operations){
        if(!plain(item)||typeof item.name!=="string")continue;
        if(!ALLOWED.has(item.name)||item.risk!=="read"||seen.has(item.name))continue;
        if(typeof item.description!=="string"||item.description.length>512)continue;
        seen.add(item.name);
        accepted.push(Object.freeze({name:item.name,description:item.description,risk:"read"}));
      }
      return Object.freeze(accepted);
    }
    async function read(operation,input={}){
      if(!ALLOWED.has(operation))throw fail("UNKNOWN_OPERATION");
      // Reject unsupported/nested input before requesting bearer or user approval.
      inputBody(input);
      const reply=await request("/v1/operations/"+operation,"POST",input,operation);
      if(!Object.hasOwn(reply,"result"))throw fail("REMOTE_RESPONSE_INVALID");
      return reply.result;
    }
    return Object.freeze({capabilities,read,operations:READS});
  }
  root.WorkspaceGoogleMasterRead=Object.freeze({RESOURCE,READS,create,inputBody});
  if(typeof module!=="undefined"&&module.exports)
    module.exports=root.WorkspaceGoogleMasterRead;
})(globalThis);
