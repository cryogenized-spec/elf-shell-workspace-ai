/* Shared, session-only recent replies across Hub and Firefox sidebar. */
(function(root){
  "use strict";
  const KEY="elfshell.byok.visibleTranscript.v1";
  const host=document.querySelector("#ai-conversation-list");
  if(!host) {root.WorkspaceConversationUI={record:async()=>false};return;}
  const count=document.querySelector("#ai-conversation-count");
  const status=document.querySelector("#ai-conversation-status");
  const clear=document.querySelector("#ai-conversation-clear");
  let generation=0;
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
    }catch {tell("Previous replies could not be loaded from Firefox session storage.");}
  }
  async function record({prompt,answer,provider,model}){
    try {
      const result=await request("AI_CONVERSATION_APPEND",{prompt,answer,provider,model});
      ++generation;
      render(result.entries);
      tell("Saved for this Firefox session only; earlier messages are not resent to the model.");
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
    }catch{tell("Could not clear the session conversation.");await reload();}
  });
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
  root.WorkspaceConversationUI={record,reload};
})(globalThis);
