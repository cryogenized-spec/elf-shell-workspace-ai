/* Session-only display history. This is NOT provider conversation context. */
(function(root){
  "use strict";
  const KEY="elfshell.byok.visibleTranscript.v1";
  const MAX_TURNS=10,MAX_CHARS=50000;
  function clean(raw){
    if(!Array.isArray(raw))return [];
    return raw.filter(item=>item&&typeof item==="object"&&
      typeof item.prompt==="string"&&item.prompt.length>0&&item.prompt.length<=6000&&
      typeof item.answer==="string"&&item.answer.length>0&&item.answer.length<=12000&&
      typeof item.provider==="string"&&/^(openai|anthropic|gemini)$/.test(item.provider)&&
      typeof item.model==="string"&&item.model.length<=90&&
      Number.isSafeInteger(item.at)&&item.at>=0
    ).slice(-MAX_TURNS).map(item=>({...item,truncated:item.truncated===true}));
  }
  async function handle(browserApi,message){
    if(!browserApi.storage?.session)throw Error("Firefox session transcript storage is unavailable");
    const current=clean((await browserApi.storage.session.get(KEY))[KEY]);
    if(message.type==="AI_CONVERSATION_LIST")return {ok:true,entries:current};
    if(message.type==="AI_CONVERSATION_CLEAR"){
      await browserApi.storage.session.remove(KEY);
      return {ok:true,entries:[]};
    }
    if(message.type!=="AI_CONVERSATION_APPEND")throw Error("Unsupported conversation operation");
    const {prompt,answer,provider,model}=message;
    const truncated=message.truncated===true;
    if(typeof prompt!=="string"||!prompt.trim()||prompt.length>6000 ||
       typeof answer!=="string"||!answer.trim()||answer.length>12000 ||
       !["openai","anthropic","gemini"].includes(provider) ||
       typeof model!=="string"||model.length<2||model.length>90 ||
       !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(model))
      throw Error("Invalid local transcript entry");
    const next=[...current,{prompt:prompt.trim(),answer:answer.trim(),provider,model,truncated,at:Date.now()}];
    while(next.length>MAX_TURNS||next.reduce((n,item)=>n+item.prompt.length+item.answer.length,0)>MAX_CHARS)next.shift();
    await browserApi.storage.session.set({[KEY]:next});
    return {ok:true,entries:next};
  }
  root.WorkspaceConversationTranscript={KEY,MAX_TURNS,MAX_CHARS,handle,clean};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.WorkspaceConversationTranscript;
})(globalThis);
