/* Opt-in, bounded, same-extension chat context. No API calls, OAuth or persistence. */
(function(root){
  "use strict";
  const TRANSCRIPT_KEY="elfshell.byok.visibleTranscript.v1";
  const SETTINGS_KEY="elfshell.byok.settings.v1";
  const MAX_TURNS=3, MAX_CHARS=12000;
  function options(message){
    if(!message||typeof message!=="object")throw Error("Invalid context options");
    const include=message.includeHistory===undefined?false:message.includeHistory;
    if(typeof include!=="boolean")throw Error("Conversation context consent must be explicit");
    if(!include)return {includeHistory:false,historyLimit:0};
    const limit=message.historyLimit;
    if(!Number.isInteger(limit)||limit<1||limit>MAX_TURNS)
      throw Error("Choose 1–3 previous exchanges for context");
    return {includeHistory:true,historyLimit:limit};
  }
  function choose(raw,provider,model,consent){
    const settings=options(consent);
    if(!settings.includeHistory)return {turns:[],characters:0,approxTokens:0};
    const valid=root.WorkspaceConversationTranscript.clean(raw);
    const turns=[];
    let characters=0;
    // Only the most recent contiguous exchanges on exactly this provider/model;
    // never reuse old messages separated by conversations using another model.
    for(let i=valid.length-1;i>=0&&turns.length<settings.historyLimit;i--){
      const item=valid[i];
      if(item.provider!==provider||item.model!==model)break;
      const length=item.prompt.length+item.answer.length;
      if(characters+length>MAX_CHARS)break; // Never truncate a turn silently.
      turns.unshift({prompt:item.prompt,answer:item.answer});
      characters+=length;
    }
    return {turns,characters,approxTokens:Math.ceil(characters/4)};
  }
  async function load(browserApi,provider,model,message){
    const consent=options(message);
    if(!consent.includeHistory)return {turns:[],characters:0,approxTokens:0};
    if(!browserApi.storage?.session)throw Error("Firefox session history is unavailable");
    const raw=(await browserApi.storage.session.get(TRANSCRIPT_KEY))[TRANSCRIPT_KEY];
    return choose(raw,provider,model,consent);
  }
  async function preview(browserApi,message){
    const saved=(await browserApi.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
    const model=root.WorkspaceBYOKProviders.normalizedSettings(saved);
    const context=await load(browserApi,model.provider,model.model,message);
    // The UI gets counts, not a second copy of transcript contents.
    return {ok:true,summary:{
      provider:model.provider,model:model.model,turns:context.turns.length,
      characters:context.characters,approxTokens:context.approxTokens,
      maximumTurns:MAX_TURNS,maximumCharacters:MAX_CHARS
    }};
  }
  function orderedMessages(context,prompt){
    const input=root.WorkspaceBYOKProviders.userText(prompt);
    const messages=[];
    for(const turn of context.turns||[]){
      messages.push({role:"user",content:turn.prompt});
      messages.push({role:"assistant",content:turn.answer});
    }
    messages.push({role:"user",content:input});
    return messages;
  }
  root.WorkspaceConversationContext={MAX_TURNS,MAX_CHARS,options,choose,load,preview,orderedMessages};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.WorkspaceConversationContext;
})(globalThis);
