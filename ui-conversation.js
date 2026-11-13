/* Shared, session-only recent replies across Hub and Firefox sidebar. */
(function(root){
  "use strict";
  const KEY="elfshell.byok.visibleTranscript.v1";
  const host=document.querySelector("#ai-conversation-list");
  if(!host) {root.WorkspaceConversationUI={record:async()=>false};return;}
  const count=document.querySelector("#ai-conversation-count");
  const status=document.querySelector("#ai-conversation-status");
  const clear=document.querySelector("#ai-conversation-clear");
  const enable=document.querySelector("#ai-context-enable");
  const limit=document.querySelector("#ai-context-limit");
  const preview=document.querySelector("#ai-context-preview");
  let generation=0,previewGeneration=0,previewReady=false;
  function rawContextOptions(){
    return {includeHistory:enable?.checked===true,historyLimit:Number(limit?.value||2)};
  }
  function contextOptions(){
    const opts=rawContextOptions();
    if(opts.includeHistory&&!previewReady)
      throw Error("Wait for the context preview to finish before sending, or switch context off.");
    return opts;
  }
  async function refreshPreview(){
    const mine=++previewGeneration;
    previewReady=false;
    const opts=rawContextOptions();
    if(!opts.includeHistory){
      previewReady=true;
      if(preview)preview.textContent="Context OFF. Only your new prompt and persona are sent.";
      return;
    }
    if(preview)preview.textContent="Checking recent matching exchanges locally…";
    try{
      const response=await request("AI_CONTEXT_PREVIEW",opts);
      if(mine!==previewGeneration)return;
      const info=response.summary;
      previewReady=true;
      if(preview)preview.textContent=info.turns
        ?info.provider+" / "+info.model+" · "+info.turns+" previous exchange(s) · "+info.characters+
          " characters · roughly "+info.approxTokens+
          " text tokens before the new prompt (estimate only; costs vary by model)."
        :"No recent completed exchanges match this provider and model. Only your new prompt will be sent.";
    }catch{
      if(mine===previewGeneration&&preview)
        preview.textContent="Could not verify context. Disable history or try again before sending.";
    }
  }
  function resetContext(){
    if(enable)enable.checked=false;
    void refreshPreview();
  }
  const node=(tag,className,value)=>{
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(value!==undefined)el.textContent=value;
    return el;
  };
  const tell=(text)=>{if(status)status.textContent=text;};
  function render(entries) {
    const items=Array.isArray(entries)?entries:[];
    host.replaceChildren();
    if(count)count.textContent=items.length+" / 10 exchanges";
    if(clear)clear.disabled=items.length===0;
    if(!items.length){
      host.append(node("p","conversation-empty","No replies in this Firefox session. Ask Ayarime to begin."));
      return;
    }
    for(const item of items){
      const pair=node("div","conversation-exchange");
      for(const [role,text] of [["you",item.prompt],["ayarime",item.answer]]){
        const article=node("article","conversation-bubble "+role);
        const label=node("div","conversation-speaker",role==="you"?"YOU":"AYARIME");
        const body=node("div","conversation-text",text);
        article.append(label,body);
        if(role==="ayarime"&&item.truncated===true)
          article.append(node("small","conversation-truncation",
            "Response preview truncated — the provider returned more than 12,000 characters."));
        pair.append(article);
      }
      const source=node("small","conversation-source",item.provider+" / "+item.model);
      pair.append(source);
      host.append(pair);
    }
    host.scrollTop=host.scrollHeight;
  }
  async function request(type,fields={}) {
    const response=await browser.runtime.sendMessage({type,...fields});
    if(!response?.ok)throw Error(response?.error||"Transcript unavailable");
    return response;
  }
  async function reload(){
    const my=++generation;
    try {
      const result=await request("AI_CONVERSATION_LIST");
      if(my!==generation)return;
      render(result.entries);
      if(enable?.checked)void refreshPreview();
    }catch {tell("Previous replies could not be loaded from Firefox session storage.");}
  }
  async function record({prompt,answer,provider,model,truncated=false}){
    try {
      const result=await request("AI_CONVERSATION_APPEND",{prompt,answer,provider,model,truncated:truncated===true});
      ++generation;
      render(result.entries);
      tell("Saved for this Firefox session only. Previous messages are sent only when you choose to include them.");
      if(enable?.checked)void refreshPreview();
      return true;
    }catch{
      tell("Reply received, but local conversation storage failed. Current output remains visible.");
      return false;
    }
  }
  if(clear)clear.addEventListener("click",async()=>{
    if(root.WorkspaceTraceUI?.isRunning()){
      tell("Stop the current stream before clearing previous replies.");
      return;
    }
    clear.disabled=true;
    try{
      const result=await request("AI_CONVERSATION_CLEAR");
      ++generation;render(result.entries);tell("Session conversation cleared. API keys are unchanged.");
      if(enable?.checked)void refreshPreview();
    }catch{tell("Could not clear the session conversation.");await reload();}
  });
  enable?.addEventListener("change",()=>void refreshPreview());
  limit?.addEventListener("change",()=>void refreshPreview());
  const field=document.querySelector("#ai-prompt");
  field?.addEventListener("keydown",event=>{
    if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)){
      event.preventDefault();
      const send=document.querySelector("#ai-send");
      if(send&&!send.disabled)send.click();
    }
  });
  browser.storage?.onChanged?.addListener((changes,area)=>{
    if(area==="session"&&Object.prototype.hasOwnProperty.call(changes,KEY))void reload();
  });
  void reload();
  root.WorkspaceConversationUI={record,reload,contextOptions,resetContext,refreshPreview};
})(globalThis);
