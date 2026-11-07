/* Opt-in, non-generative connection diagnostics. Never returns credentials or account records. */
(function(root){
  "use strict";
  const MODEL=root.WorkspaceBYOKProviders;
  const MODEL_MAX=256*1024;
  const ALLOWED_HOSTS=Object.freeze(["api.openai.com","api.anthropic.com","generativelanguage.googleapis.com"]);
  function safeStatus(code) {
    if(code===401||code===403)return "Authentication or account access denied";
    if(code===404)return "Model not found or not available to this API key";
    if(code===429)return "Provider rate limit reached";
    if(code>=500)return "Provider service temporarily unavailable";
    return "Provider rejected the metadata check (HTTP "+code+")";
  }
  function modelRequest(provider,model,key){
    const p=MODEL.providerName(provider),id=MODEL.modelId(model),token=MODEL.keyText(key);
    let url,headers;
    if(p==="openai"){
      url="https://api.openai.com/v1/models/"+encodeURIComponent(id);
      headers={"Authorization":"Bearer "+token,"Accept":"application/json"};
    }else if(p==="anthropic"){
      url="https://api.anthropic.com/v1/models/"+encodeURIComponent(id);
      headers={"x-api-key":token,"anthropic-version":"2023-06-01","Accept":"application/json"};
    }else{
      url="https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(id);
      headers={"x-goog-api-key":token,"Accept":"application/json"};
    }
    const parsed=new URL(url);
    if(parsed.protocol!=="https:"||!ALLOWED_HOSTS.includes(parsed.hostname))
      throw Error("Untrusted provider metadata endpoint");
    return {url,options:{method:"GET",headers,credentials:"omit",cache:"no-store",redirect:"error"}};
  }
  async function boundedJSON(response,limit=MODEL_MAX){
    const length=Number(response.headers?.get?.("content-length")||0);
    if(length>limit)throw Error("Provider metadata exceeds safe response size");
    if(response.body?.getReader){
      const reader=response.body.getReader();
      const chunks=[];let size=0;
      try{
        for(;;){
          const {done,value}=await reader.read();
          if(done)break;
          if(!value||!Number.isFinite(value.length))throw Error("Invalid metadata response stream");
          size+=value.length;
          if(size>limit)throw Error("Provider metadata exceeds safe response size");
          chunks.push(value);
        }
      }finally{reader.releaseLock();}
      const data=new Uint8Array(size);let offset=0;
      for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
      return JSON.parse(new TextDecoder().decode(data));
    }
    // Mock browser fixtures without streaming response bodies.
    return response.json();
  }
  function parseModel(provider,data,requested){
    if(!data||typeof data!=="object"||Array.isArray(data))throw Error("Unexpected model metadata");
    const id=provider==="gemini"
      ?String(data.name||"").replace(/^models\//,"")
      :String(data.id||"");
    if(!id||id.length>100||!MODEL.modelId(id))
      throw Error("Provider returned an invalid model identity");
    const methods=Array.isArray(data.supportedGenerationMethods)?data.supportedGenerationMethods:[];
    const generationSupported=provider==="gemini"
      ? methods.includes("generateContent")
      : null;
    return {modelId:id,requestedModel:requested,
      displayName:typeof data.displayName==="string"?data.displayName.slice(0,110)
        :typeof data.display_name==="string"?data.display_name.slice(0,110):id,
      generationSupported,
      lifecycle:typeof data.lifecycle==="string"?data.lifecycle.slice(0,35):null};
  }
  async function modelProbe({provider,model,key,fetchImpl,now=Date.now()}){
    const req=modelRequest(provider,model,key);
    let response;
    try{response=await fetchImpl(req.url,req.options);}
    catch{return {checkedAt:new Date(now).toISOString(),provider,model,ok:false,
      message:"Could not connect to the provider. Check network or browser permissions."};}
    if(!response||!Number.isInteger(response.status))
      return {checkedAt:new Date(now).toISOString(),provider,model,ok:false,message:"Invalid provider metadata response"};
    if(!response.ok)
      return {checkedAt:new Date(now).toISOString(),provider,model,ok:false,
        statusCode:response.status,message:safeStatus(response.status)};
    try{
      const metadata=parseModel(provider,await boundedJSON(response),model);
      return {checkedAt:new Date(now).toISOString(),provider,model,ok:true,
        ...metadata,
        message:"Model metadata was retrieved. Inference, API credits and billing are not yet verified."};
    }catch{
      return {checkedAt:new Date(now).toISOString(),provider,model,ok:false,
        message:"The provider returned unreadable model metadata."};
    }
  }
  // Probe scopes through a user-triggered minimal GET; do not return event, task or file data.
  const PROBES=Object.freeze({
    calendar:Object.freeze({
      scope:"https://www.googleapis.com/auth/calendar.events.readonly",
      url:"https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1&fields=nextPageToken,items(id)"
    }),
    tasks:Object.freeze({
      scope:"https://www.googleapis.com/auth/tasks.readonly",
      url:"https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=1&fields=nextPageToken,items(id)"
    })
  });
  async function googleProbe({sources,token,permitted,fetchImpl,now=Date.now()}){
    if(!sources||typeof sources!=="object"||Array.isArray(sources)||
       ![true,false,undefined].includes(sources.calendar) ||
       ![true,false,undefined].includes(sources.tasks) ||
       (sources.calendar!==true&&sources.tasks!==true))
      throw Error("Select at least one Google source to verify");
    if(!token||typeof token.accessToken!=="string"||!Array.isArray(token.scopes)||
       !Number.isFinite(token.expiresAt)||token.expiresAt<=now)
      throw Error("Connect Google before running a read-only API check");
    const output=[];
    for(const name of ["calendar","tasks"]){
      if(sources[name]!==true)continue;
      const p=PROBES[name];
      if(!token.scopes.includes(p.scope)){
        output.push({source:name,ok:false,message:"Requested read-only OAuth scope was not granted"});
        continue;
      }
      if(!await permitted([p.scope])){
        output.push({source:name,ok:false,message:"Firefox API host or data-sharing consent is missing"});
        continue;
      }
      try {
        const response=await fetchImpl(p.url,{
          method:"GET",headers:{"Authorization":"Bearer "+token.accessToken,"Accept":"application/json"},
          redirect:"error",credentials:"omit",cache:"no-store"
        });
        if(!response||!Number.isInteger(response.status)){
          output.push({source:name,ok:false,message:"Invalid Google API response"});
        }else if(response.ok){
          // Deliberately do not parse the response: never copy event/list IDs into diagnostics.
          output.push({source:name,ok:true,
            message:"Google API accepted a minimal read-only request. No item contents retained."});
        }else{
          output.push({source:name,ok:false,statusCode:response.status,
            message:response.status===401||response.status===403
              ? "Google authorization or scope denied"
              : response.status===429?"Google API rate limit reached"
              : "Google API returned HTTP "+response.status});
        }
      }catch{
        output.push({source:name,ok:false,message:"Google API could not be reached"});
      }
    }
    return {checkedAt:new Date(now).toISOString(),sources:output,
      allPassed:output.length>0&&output.every(item=>item.ok),
      aiUsed:false,accountDataReturned:false,
      note:"This is an authenticated read-only API check, not proof of full OAuth onboarding or file access."};
  }
  root.WorkspaceConnectionDiagnostics={modelRequest,modelProbe,googleProbe,PROBES};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.WorkspaceConnectionDiagnostics;
})(globalThis);
