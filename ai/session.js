/* Browser-session-only BYOK credential controller; no auto-run and no Google data access. */
(function(root){
  "use strict";
  const PROVIDERS=root.WorkspaceBYOKProviders;
  const SETTINGS_KEY="elfshell.byok.settings.v1";
  const KEY_SESSION="elfshell.byok.apiKey.v1";
  const DATA_TYPES=Object.freeze(["authenticationInfo","personalCommunications","websiteContent","personallyIdentifyingInfo"]);
  async function settings(browserApi){
    const saved=(await browserApi.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
    return PROVIDERS.normalizedSettings(saved);
  }
  async function allowed(browserApi,provider){
    return Boolean(await browserApi.permissions.contains({
      origins:[PROVIDERS.PROVIDERS[provider].host],data_collection:[...DATA_TYPES]
    }));
  }
  async function status(browserApi){
    const config=await settings(browserApi);
    const saved=(await browserApi.storage.session.get(KEY_SESSION))[KEY_SESSION];
    return {provider:config.provider,model:config.model,
      hasSessionKey:Boolean(saved&&saved.provider===config.provider&&saved.key),
      hostGranted:await allowed(browserApi,config.provider),
      dataConsentRequired:[...DATA_TYPES],
      maxPrompt:PROVIDERS.MAX_PROMPT,
      googleDataIncluded:false};
  }
  async function saveSettings(browserApi,message){
    const provider=PROVIDERS.providerName(message.provider),model=PROVIDERS.modelId(message.model);
    const previous=await settings(browserApi);
    await browserApi.storage.local.set({[SETTINGS_KEY]:{provider,model}});
    if(previous.provider!==provider)
      await browserApi.storage.session.remove(KEY_SESSION);
    return status(browserApi);
  }
  async function setKey(browserApi,message){
    const cfg=await settings(browserApi);
    if(!await allowed(browserApi,cfg.provider))
      throw Error("Allow this provider and optional data-sharing consent in Firefox first");
    const key=PROVIDERS.keyText(message.key);
    await browserApi.storage.session.set({[KEY_SESSION]:{provider:cfg.provider,key}});
    return status(browserApi);
  }
  async function dropKey(browserApi){
    await browserApi.storage.session.remove(KEY_SESSION);
    return status(browserApi);
  }
  async function send(browserApi,fetchImpl,personaLoader,message,signal){
    const config=await settings(browserApi);
    if(!await allowed(browserApi,config.provider))
      throw Error("AI provider network or data-sharing permission is not granted");
    const saved=(await browserApi.storage.session.get(KEY_SESSION))[KEY_SESSION];
    if(!saved || saved.provider!==config.provider)
      throw Error("Enter your provider API key for this Firefox session");
    const prompt=PROVIDERS.userText(message.text);
    // The checkbox is reset after each send; server rereads bounded current
    // session history only when this individual request explicitly opts in.
    if(message.includeHistory!==undefined&&typeof message.includeHistory!=="boolean")
      throw Error("Conversation context consent must be a boolean");
    const context=message.includeHistory===true
      ? await root.WorkspaceConversationContext.load(browserApi,config.provider,config.model,message)
      : {turns:[]};
    const persona=await personaLoader();
    const system=root.WorkspacePersonaUtils.stylePrompt(persona);
    const result=await PROVIDERS.infer({
      provider:config.provider,model:config.model,key:saved.key,
      system,prompt,history:context.turns,fetchImpl,signal
    });
    // Only the generated assistant text is returned. No tokens or raw provider payload.
    return {provider:config.provider,model:config.model,
      text:result.text,truncated:result.truncated,contextTurns:context.turns.length};
  }
  async function testModel(browserApi,fetchImpl){
    const cfg=await settings(browserApi);
    if(!await allowed(browserApi,cfg.provider))
      throw Error("Allow the provider and its optional data-sharing consent first");
    const saved=(await browserApi.storage.session.get(KEY_SESSION))[KEY_SESSION];
    if(!saved || saved.provider!==cfg.provider || !saved.key)
      throw Error("Enter a session API key before checking model availability");
    // This request retrieves only model metadata. It does not generate tokens,
    // include a prompt, fetch Google content or store a test transcript.
    return root.WorkspaceConnectionDiagnostics.modelProbe({
      provider:cfg.provider,model:cfg.model,key:saved.key,fetchImpl
    });
  }
  async function handle(browserApi,fetchImpl,personaLoader,message,signal){
    switch(message.type){
      case "AI_STATUS":return {ok:true,ai:await status(browserApi)};
      case "AI_SAVE_SETTINGS":return {ok:true,ai:await saveSettings(browserApi,message)};
      case "AI_SET_SESSION_KEY":return {ok:true,ai:await setKey(browserApi,message)};
      case "AI_CLEAR_SESSION_KEY":return {ok:true,ai:await dropKey(browserApi)};
      case "AI_CHECK_MODEL":return {ok:true,result:await testModel(browserApi,fetchImpl)};
      case "AI_SEND_PROMPT":return {ok:true,result:await send(browserApi,fetchImpl,personaLoader,message,signal)};
      default:throw Error("Unknown BYOK request");
    }
  }
  root.WorkspaceBYOKSession={SETTINGS_KEY,KEY_SESSION,DATA_TYPES,handle,settings,status};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.WorkspaceBYOKSession;
})(globalThis);