/* OpenAI Responses SSE: privacy-restricted provider events, no raw CoT or tool execution. */
(function(root){
  "use strict";
  const PROVIDERS=root.WorkspaceBYOKProviders;
  const SESSION_KEY="elfshell.byok.apiKey.v1",SETTINGS_KEY="elfshell.byok.settings.v1";
  const DATA_TYPES=["authenticationInfo","personalCommunications","websiteContent","personallyIdentifyingInfo"];
  const EFFORTS=Object.freeze(["none","low","medium","high","xhigh","max"]);
  const OUTPUT_LIMITS=Object.freeze([768,2048,4096]);
  const MAX_BYTES=4*1024*1024,MAX_FRAME=128*1024,MAX_OUTPUT=12000,MAX_SUMMARY=16000;
  const TOOL_NAMES=Object.freeze({
    web_search_call:"Web search",file_search_call:"File search",
    code_interpreter_call:"Code interpreter",function_call:"Function call",
    computer_call:"Computer use",image_generation_call:"Image generation",
    shell_call:"Shell command",apply_patch_call:"Patch application",
    mcp_call:"MCP tool"
  });
  function optionsFrom(message){
    if(!message||typeof message!=="object"||typeof message.text!=="string")
      throw Error("Enter a prompt before starting a stream");
    const effort=message.effort===undefined?"medium":message.effort;
    if(!EFFORTS.includes(effort))throw Error("Choose a supported OpenAI reasoning effort");
    if(typeof message.webSearch!=="boolean")throw Error("Web-search consent must be explicit");
    const maxOutputTokens=message.maxOutputTokens===undefined?768:message.maxOutputTokens;
    if(!OUTPUT_LIMITS.includes(maxOutputTokens))throw Error("Select an approved output-token budget");
    return {effort,webSearch:message.webSearch,maxOutputTokens};
  }
  function buildRequest({model,key,prompt,system,effort="medium",webSearch=false,maxOutputTokens=768,history=[],signal}){
    const id=PROVIDERS.modelId(model),secret=PROVIDERS.keyText(key),
      text=PROVIDERS.userText(prompt);
    if(!EFFORTS.includes(effort)||typeof webSearch!=="boolean"||!OUTPUT_LIMITS.includes(maxOutputTokens))
      throw Error("Invalid streaming settings or output-token budget");
    const offer=root.WorkspaceOpenAIComplimentary?.lookup(id);
    if(offer?.status==="shut-down")
      throw Error("This legacy model has been shut down by OpenAI; select an available model");
    if(offer?.nonReasoning && effort!=="none")
      throw Error("This model does not support reasoning effort; choose None");
    if(offer&&offer.group!=="other"&&effort==="max")
      throw Error("Maximum reasoning is unsupported for this offer model; choose High or Extra High");
    const messages=history.length
      ? root.WorkspaceConversationContext.orderedMessages({turns:history},text)
      : [{role:"user",content:text}];
    const body={
      model:id,input:history.length?messages:text,instructions:String(system||"").slice(0,6000),
      store:false,stream:true,max_output_tokens:maxOutputTokens,
      ...(effort==="none"?{}:{reasoning:{effort,summary:"auto"}}),
      ...(webSearch?{tools:[{type:"web_search"}],tool_choice:"auto"}:{})
    };
    return {url:"https://api.openai.com/v1/responses",
      options:{method:"POST",headers:{"Authorization":"Bearer "+secret,
        "Content-Type":"application/json","Accept":"text/event-stream"},
        body:JSON.stringify(body),redirect:"error",credentials:"omit",cache:"no-store",signal}};
  }
  function safeError(status){
    if(status===401||status===403)return "OpenAI rejected the API key or model access";
    if(status===429)return "OpenAI reported a rate or credit limit";
    if(status===400)return "OpenAI rejected the request: verify model, reasoning setting and tool availability";
    if(status===404)return "Requested OpenAI model or endpoint is unavailable";
    if(status>=500)return "OpenAI service temporarily unavailable";
    return "OpenAI request failed (HTTP "+status+")";
  }
  function frameData(frame){
    let lines=[];
    for(const line of frame.split(/\r\n|\n|\r/)){
      if(line.startsWith("data:"))lines.push(line.slice(5).replace(/^ /,""));
    }
    const joined=lines.join("\n");
    if(!joined||joined==="[DONE]")return null;
    try{return JSON.parse(joined);}catch{throw Error("OpenAI stream contains malformed JSON event");}
  }
  async function consume(response,onEvent,signal){
    if(!response.body?.getReader)throw Error("This Firefox network response cannot be streamed");
    const reader=response.body.getReader(),decoder=new TextDecoder();
    let buffer="",bytes=0,completed=false,frames=0;
    try{
      for(;;){
        if(signal?.aborted)throw Error("Stream cancelled");
        const {done,value}=await reader.read();
        if(done)break;
        if(!(value instanceof Uint8Array))throw Error("Invalid OpenAI stream chunk");
        bytes+=value.byteLength;
        if(bytes>MAX_BYTES)throw Error("OpenAI stream exceeded the safe size limit");
        buffer+=decoder.decode(value,{stream:true});
        let delimiter;
        while((delimiter=/\r\n\r\n|\n\n|\r\r/.exec(buffer))){
          const frame=buffer.slice(0,delimiter.index);
          buffer=buffer.slice(delimiter.index+delimiter[0].length);
          const event=frameData(frame);
          if(event){
            frames++;
            if(frames>20000)throw Error("Too many OpenAI stream events");
            onEvent(event);
            if(["response.completed","response.failed","response.incomplete"].includes(event.type))
              completed=true;
          }
        }
        if(buffer.length>MAX_FRAME)throw Error("OpenAI stream frame too large");
      }
      buffer+=decoder.decode();
      if(buffer.trim()){
        const event=frameData(buffer);
        if(event){onEvent(event);
          if(["response.completed","response.failed","response.incomplete"].includes(event.type))
            completed=true;}
      }
    }finally{
      try{await reader.cancel();}catch{}
      try{reader.releaseLock();}catch{}
    }
    if(signal?.aborted)throw Error("Stream cancelled");
    if(!completed)throw Error("OpenAI stream closed without a terminal response event");
  }
  function presenter(emit){
    const textTotals=new Map(),summaryTotals=new Map();
    let terminal=false,hasSummary=false,toolCount=0;
    const cleanId=(value)=>typeof value==="string"?value.slice(0,100):"";
    const cleanIndex=(value)=>Number.isInteger(value)&&value>=0&&value<1000?value:0;
    function track(map,key,value,limit){
      const current=map.get(key)||"";
      const next=(current+value).slice(0,limit);
      map.set(key,next);
      return next;
    }
    function status(type,details={}){
      if(!terminal){terminal=true;emit({kind:"terminal",status:type,hasSummary,toolCount,...details});}
    }
    function handle(event){
      if(!event||typeof event!=="object"||terminal)return;
      const type=event.type;
      if(type==="response.created"){emit({kind:"phase",name:"Request accepted"});return;}
      if(type==="response.queued"){emit({kind:"phase",name:"Queued by provider"});return;}
      if(type==="response.in_progress"){emit({kind:"phase",name:"Generating response"});return;}
      if(type==="response.output_text.delta"||type==="response.output_text.done"){
        const id=cleanId(event.item_id)+"-"+cleanIndex(event.content_index);
        if(type.endsWith(".done")){
          const value=typeof event.text==="string"?event.text.slice(0,MAX_OUTPUT):"";
          textTotals.set(id,value);
          emit({kind:"answer",id,text:value,done:true});
        }else if(typeof event.delta==="string"&&event.delta.length){
          emit({kind:"answer",id,text:track(textTotals,id,event.delta,MAX_OUTPUT),done:false});
        }
        return;
      }
      if(type==="response.reasoning_summary_text.delta"||
         type==="response.reasoning_summary_text.done"||
         type==="response.reasoning_summary_part.done"){
        const id=cleanId(event.item_id)+"-"+cleanIndex(event.summary_index);
        const delta=type.endsWith(".delta");
        const value=delta?event.delta
          :type==="response.reasoning_summary_part.done"?event.part?.text:event.text;
        if(typeof value!=="string"||!value.length)return;
        hasSummary=true;
        const text=delta?track(summaryTotals,id,value,MAX_SUMMARY):value.slice(0,MAX_SUMMARY);
        if(!delta)summaryTotals.set(id,text);
        emit({kind:"summary",id,text,done:!delta});
        return;
      }
      // Raw reasoning_text events are private: never forward, render or log them.
      if(type==="response.output_item.added"||type==="response.output_item.done"){
        const item=event.item||{};
        if(!Object.hasOwn(TOOL_NAMES,item.type))return;
        const id=cleanId(item.id)||"index-"+cleanIndex(event.output_index);
        if(type.endsWith(".added"))toolCount++;
        emit({kind:"tool",id,title:TOOL_NAMES[item.type],toolType:item.type,
          state:type.endsWith(".done")?"done":"active"});
        return;
      }
      const match=/^response\.(web_search_call|file_search_call|code_interpreter_call)\.(in_progress|searching|interpreting|completed)$/.exec(type||"");
      if(match){
        emit({kind:"tool",id:cleanId(event.item_id),title:TOOL_NAMES[match[1]],toolType:match[1],
          state:match[2]==="completed"?"done":"active"});
        return;
      }
      if(["response.completed","response.incomplete","response.failed"].includes(type)){
        const usage=event.response?.usage;
        const output=Number.isSafeInteger(usage?.output_tokens)&&usage.output_tokens>=0
          ?usage.output_tokens:null;
        const input=Number.isSafeInteger(usage?.input_tokens)&&usage.input_tokens>=0
          ?usage.input_tokens:null;
        const reason=usage?.output_tokens_details?.reasoning_tokens;
        const reasoningTokens=Number.isSafeInteger(reason)&&reason>=0?reason:undefined;
        const totals={usage:{inputTokens:input,outputTokens:output,
          ...(reasoningTokens===undefined?{}:{reasoningTokens})}};
        if(type==="response.completed")status("completed",totals);
        else if(type==="response.incomplete")status("incomplete",{
          message:"OpenAI stopped before completing the answer (possibly output token limit).",...totals
        });
        else status("failed",{message:"OpenAI reported a generation failure.",...totals});
      }else if(type==="error")status("failed",{
        message:"OpenAI reported a generation failure."
      });
    }
    return {handle,isTerminal:()=>terminal};
  }
  async function run({browserApi,fetchImpl,personaLoader,message,signal,emit}){
    const options=optionsFrom(message);
    const config=PROVIDERS.normalizedSettings(
      (await browserApi.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);
    if(config.provider!=="openai")throw Error("Streaming trace is available for OpenAI only");
    if(!await browserApi.permissions.contains({
      origins:[PROVIDERS.PROVIDERS.openai.host],data_collection:DATA_TYPES
    }))throw Error("Grant OpenAI network and data-sharing permissions first");
    const saved=(await browserApi.storage.session.get(SESSION_KEY))[SESSION_KEY];
    if(!saved||saved.provider!=="openai"||!saved.key)
      throw Error("Enter an OpenAI API key for this Firefox session");
    if(message.includeHistory!==undefined&&typeof message.includeHistory!=="boolean")
      throw Error("Conversation context consent must be a boolean");
    const context=message.includeHistory===true
      ? await root.WorkspaceConversationContext.load(browserApi,config.provider,config.model,message)
      : {turns:[]};
    const persona=await personaLoader();
    const system=root.WorkspacePersonaUtils.stylePrompt(persona);
    const req=buildRequest({model:config.model,key:saved.key,prompt:message.text,
      history:context.turns,system,...options,signal});
    if(signal?.aborted)throw Error("Stream cancelled");
    emit({kind:"started",model:config.model,effort:options.effort,
      webSearch:options.webSearch,contextTurns:context.turns.length});
    let response;
    try{response=await fetchImpl(req.url,req.options);}
    catch(error){
      if(signal?.aborted)throw Error("Stream cancelled");
      throw Error("OpenAI connection failed. Check Firefox permissions and network.");
    }
    if(!response||!Number.isInteger(response.status))throw Error("Invalid OpenAI response");
    if(!response.ok)throw Error(safeError(response.status));
    let terminal=null;
    const trace=presenter(event=>{
      if(event.kind==="terminal")terminal=event;
      else emit(event);
    });
    await consume(response,event=>trace.handle(event),signal);
    if(!trace.isTerminal()||!terminal)throw Error("Stream ended unexpectedly");
    let localUsage=null;
    if(Number.isSafeInteger(terminal.usage?.inputTokens) &&
       Number.isSafeInteger(terminal.usage?.outputTokens)){
      try{
        localUsage=await root.WorkspaceOpenAIComplimentary.record(
          browserApi,config.model,terminal.usage);
      }catch{/* A local counter failure must not rewrite the provider's actual completion. */}
    }
    emit({...terminal,localUsage});
  }
  root.WorkspaceOpenAIStream={buildRequest,optionsFrom,frameData,consume,presenter,run};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.WorkspaceOpenAIStream;
})(globalThis);
