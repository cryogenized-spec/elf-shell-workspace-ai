/* Real OpenAI trace UI: provider summaries, source events and elapsed timers. */
(function(root){
  "use strict";
  const PORT="elfshell.openai.trace.v1";
  // Reviewed UI identifiers, not provider-supplied URLs. Branded assets will
  // require explicit logo licensing and a trusted tool registry.
  const TOOL_VISUALS=Object.freeze({
    web_search_call:{glyph:"⌕",tone:"search",name:"Web search"},
    file_search_call:{glyph:"▤",tone:"file",name:"File search"},
    code_interpreter_call:{glyph:"⌘",tone:"code",name:"Code interpreter"},
    function_call:{glyph:"ƒ",tone:"function",name:"Function"},
    computer_call:{glyph:"▣",tone:"computer",name:"Computer"},
    image_generation_call:{glyph:"✧",tone:"image",name:"Image generation"},
    shell_call:{glyph:">_",tone:"shell",name:"Shell"},
    apply_patch_call:{glyph:"±",tone:"code",name:"Patch"},
    mcp_call:{glyph:"⬡",tone:"mcp",name:"MCP tool"},
    generic:{glyph:"◇",tone:"generic",name:"Tool"}
  });
  function toolVisual(key){
    return Object.prototype.hasOwnProperty.call(TOOL_VISUALS,key)
      ? TOOL_VISUALS[key] : TOOL_VISUALS.generic;
  }

  let running=null;
  function el(tag,className,value){
    const element=document.createElement(tag);
    if(className)element.className=className;
    if(value!==undefined)element.textContent=value;
    return element;
  }
  function seconds(ms){return (Math.max(0,ms)/1000).toFixed(1)+"s";}
  function renderSummary(host,value){
    host.replaceChildren();
    if(!String(value).trim())return;
    for(const raw of String(value).split(/\r?\n/).slice(0,180)){
      const line=raw.trim();
      if(!line){host.append(el("div","trace-gap",""));continue;}
      let tag="p",css="trace-line",body=line;
      if(/^#{1,4}\s+/.test(line)){tag="h4";css="trace-heading";body=line.replace(/^#{1,4}\s+/,"");}
      else if(/^[-*]\s+/.test(line)){css="trace-bullet";body=line.slice(2);}
      else if(/^>\s?/.test(line)){css="trace-quote";body=line.replace(/^>\s?/,"");}
      const node=el(tag,css);
      const regex=/\*\*([^*]+)\*\*|\*([^*]+)\*/g;
      let match,pos=0;
      while((match=regex.exec(body))){
        if(match.index>pos)node.append(document.createTextNode(body.slice(pos,match.index)));
        node.append(el(match[1]?"strong":"em","",match[1]||match[2]));
        pos=regex.lastIndex;
      }
      if(pos<body.length)node.append(document.createTextNode(body.slice(pos)));
      host.append(node);
    }
  }
  function start(settings,refresh){
    if(running)return false;
    const output=document.querySelector("#ai-output"),status=document.querySelector("#ai-status");
    const board=document.querySelector("#ai-trace"),events=document.querySelector("#ai-trace-steps");
    const summary=document.querySelector("#ai-summary-text"),summaryInfo=document.querySelector("#ai-summary-status");
    const clock=document.querySelector("#ai-elapsed"),usage=document.querySelector("#ai-trace-usage");
    const send=document.querySelector("#ai-send"),stop=document.querySelector("#ai-cancel");
    const headline=document.querySelector("#ai-reasoning-label");
    const hint=document.querySelector("#ai-summary-hint");
    const details=document.querySelector("#ai-summary-details");
    const activityCount=document.querySelector("#ai-activity-count");
    let renderHandle=null;
    if(!output||!board||!events||!summary||!send||!stop)return false;
    const started=performance.now();
    const state={started,port:null,finished:false,steps:new Map(),parts:new Map(),
      summaries:new Map(),hasSummary:false,refresh,timer:null,firstAnswerAt:null,
      summaryTouched:false,model:null};
    running=state;
    output.replaceChildren();events.replaceChildren();summary.replaceChildren();
    board.hidden=false;
    board.dataset.stage="connecting";
    if(headline)headline.textContent="Connecting…";
    if(hint)hint.textContent="WAITING";
    if(activityCount)activityCount.textContent="0 events";
    if(details){
      details.open=true;
      details.onclick=event=>{
        if(event.target.closest("summary"))state.summaryTouched=true;
      };
    }
    const activity=document.querySelector("#ai-activity-details");
    if(activity)activity.open=false;
    summaryInfo.textContent="Waiting for a provider-exposed reasoning summary…";
    usage.textContent="No token usage available yet.";
    send.disabled=true;stop.hidden=false;stop.disabled=false;
    status.textContent="Connecting to OpenAI · waiting for streamed events…";
    status.classList.remove("error");
    const now=()=>performance.now();
    const textSummary=()=>[...state.summaries.values()].join("\n\n").slice(0,16000);
    function flushSummary(){
      if(renderHandle!==null&&typeof cancelAnimationFrame==="function"){
        cancelAnimationFrame(renderHandle);
      }
      renderHandle=null;
      renderSummary(summary,textSummary());
    }
    function queueSummary(){
      if(renderHandle!==null)return;
      if(typeof requestAnimationFrame!=="function"){flushSummary();return;}
      renderHandle=requestAnimationFrame(()=>{renderHandle=null;renderSummary(summary,textSummary());});
    }
    function updateClocks(){
      const current=now();
      clock.textContent=seconds(current-started);
      for(const step of state.steps.values())
        step.time.textContent=seconds((step.end===null?current:step.end)-step.start);
    }
    function step(id,title,toolType=null){
      if(state.steps.has(id))return state.steps.get(id);
      const row=el("div","trace-row active");
      const visual=toolType?toolVisual(toolType):null;
      const marker=visual
        ?el("span","trace-tool-icon tone-"+visual.tone,visual.glyph)
        :el("span","trace-marker","◉");
      if(visual){
        marker.setAttribute("role","img");
        marker.setAttribute("aria-label",visual.name+" activity icon");
        marker.title=visual.name+" — generic icon, not a vendor logo";
      }
      const label=el("span","trace-label",title);
      const time=el("span","trace-time","0.0s");
      row.append(marker,label,time);events.append(row);
      const item={row,marker,label,time,start:now(),end:null,isTool:Boolean(visual)};
      state.steps.set(id,item);
      if(activityCount)activityCount.textContent=state.steps.size+" events";
      updateClocks();
      return item;
    }
    function finishStep(id){
      const item=state.steps.get(id);
      if(item&&item.end===null){
        item.end=now();
        // Keep the trusted tool category glyph after completion; the
        // separate row completion state supplies the tick indicator.
        if(item.isTool)
          item.row.classList.add("done");
        else item.marker.textContent="✓";
        item.row.classList.remove("active");
      }
    }
    function finish(message){
      if(state.finished)return;
      state.finished=true;
      for(const id of state.steps.keys())finishStep(id);
      if(state.timer!==null)clearInterval(state.timer);
      flushSummary();
      updateClocks();
      stop.hidden=true;
      board.dataset.stage=message.status||"failed";
      const total=now()-started;
      const preAnswer=(state.firstAnswerAt===null?total:state.firstAnswerAt-started);
      if(headline)headline.textContent=message.status==="completed"
        ?(state.hasSummary?"Thought for "+seconds(preAnswer):"Completed in "+seconds(total))
        :message.status==="cancelled"?"Stopped after "+seconds(total)
        :message.status==="incomplete"?"Incomplete after "+seconds(total)
        :"Failed after "+seconds(total);
      if(hint)hint.textContent=state.hasSummary?"SUMMARY": "NOT PROVIDED";
      if(details&&!state.summaryTouched)details.open=false;
      const ended=step("terminal",message.status==="completed"?"Completed":
        message.status==="cancelled"?"Cancelled":
        message.status==="incomplete"?"Incomplete":"Failed");
      ended.end=ended.start;
      ended.marker.textContent=message.status==="completed"?"✓":"!";
      status.textContent=message.status==="completed"
        ?"OpenAI stream completed · provider summaries and actual events shown."
        :message.message||"OpenAI stream ended: "+message.status;
      status.classList.toggle("error",message.status==="failed");
      if(!state.hasSummary)
        summaryInfo.textContent="This model did not expose a reasoning summary. Activity and time are shown, but private internal thoughts are not available.";
      if(message.usage)usage.textContent="Reported tokens · input "+
        (message.usage.inputTokens??"—")+" · output "+
        (message.usage.outputTokens??"—")+
        (message.usage.reasoningTokens===undefined?"":" · internal reasoning "+message.usage.reasoningTokens)+
        " (reasoning tokens are not readable text).";
      const completedAnswer=message.status==="completed"?output.textContent:"";
      const model=state.model||document.querySelector("#ai-model")?.value||"";
      const port=state.port;
      running=null;
      if(completedAnswer.trim() && root.WorkspaceConversationUI){
        Promise.resolve(root.WorkspaceConversationUI.record({
          prompt:settings.text,answer:completedAnswer,provider:"openai",model
        })).then(saved=>{
          if(saved && !running && output.textContent===completedAnswer){
            output.replaceChildren();
            const field=document.querySelector("#ai-prompt");
            if(field?.value===settings.text)field.value="";
          }
        }).catch(()=>{});
      }
      try{port?.disconnect();}catch{}
      Promise.resolve(refresh?.()).catch(()=>{});
    }
    function onEvent(message){
      if(state.finished||!message||typeof message.kind!=="string")return;
      if(message.kind==="started"){
        state.model=message.model;
        board.dataset.stage="thinking";
        if(headline)headline.textContent="Thinking…";
        if(hint)hint.textContent="LIVE";
        finishStep("connecting");
        step("accepted","Model: "+message.model+" · reasoning "+message.effort+
          " · "+(message.contextTurns||0)+" prior exchange(s)");
      }else if(message.kind==="phase"){
        for(const [id,item] of state.steps){
          if(id==="accepted"||id.startsWith("phase-"))finishStep(id);
        }
        step("phase-"+state.steps.size,message.name||"Processing");
      }else if(message.kind==="summary"){
        state.hasSummary=true;
        if(hint)hint.textContent=message.done?"UPDATED":"STREAMING";
        const id=message.id||"summary";
        state.summaries.set(id,message.text||"");
        step("summary-"+id,"Provider reasoning summary");
        if(message.done)finishStep("summary-"+id);
        queueSummary();
        summaryInfo.textContent="OpenAI-provided summary · not private chain-of-thought.";
      }else if(message.kind==="answer"){
        if(state.firstAnswerAt===null){
          state.firstAnswerAt=now();
          board.dataset.stage="answering";
          if(headline)headline.textContent="Responding…";
          if(hint)hint.textContent=state.hasSummary?"SUMMARY":"NO SUMMARY";
          flushSummary();
          if(details&&!state.summaryTouched)details.open=false;
        }
        const id=message.id||"answer";
        state.parts.set(id,message.text||"");
        step("answer-"+id,"Writing response");
        if(message.done)finishStep("answer-"+id);
        output.textContent=[...state.parts.values()].join("\n");
      }else if(message.kind==="tool"){
        const id="tool-"+(message.id||message.title);
        const item=step(id,message.title||"Provider tool",message.toolType);
        if(message.state==="done")finishStep(id);
        else item.row.classList.add("active");
      }else if(message.kind==="terminal")finish(message);
    }
    state.timer=setInterval(updateClocks,120);
    step("connecting","Connecting to OpenAI");
    try {
      state.port=browser.runtime.connect({name:PORT});
      state.port.onMessage.addListener(onEvent);
      state.port.onDisconnect.addListener(()=>{
        if(running===state&&!state.finished)finish({
          status:"failed",message:"Streaming channel disconnected before completion."
        });
      });
      state.port.postMessage({type:"start",text:settings.text,
        effort:settings.effort,webSearch:settings.webSearch,
        maxOutputTokens:settings.maxOutputTokens,
        includeHistory:settings.includeHistory,historyLimit:settings.historyLimit});
    }catch{finish({status:"failed",message:"Firefox could not open the streaming channel."});}
    return true;
  }
  function cancel(){
    if(!running||running.finished)return false;
    const button=document.querySelector("#ai-cancel");
    if(button)button.disabled=true;
    try{running.port?.postMessage({type:"cancel"});}catch{}
    return true;
  }
  root.WorkspaceTraceUI={start,cancel,isRunning:()=>Boolean(running)};
  if(typeof module!=="undefined"&&module.exports)module.exports={seconds,renderSummary};
})(globalThis);
