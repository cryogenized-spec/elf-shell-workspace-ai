/* Standalone, opt-in BYOK text calls. No Google files, history or tool execution. */
(function(root){
  "use strict";
  const PROVIDERS=Object.freeze({
    openai:Object.freeze({host:"https://api.openai.com/*",origin:"https://api.openai.com",defaultModel:"gpt-5.4-mini"}),
    anthropic:Object.freeze({host:"https://api.anthropic.com/*",origin:"https://api.anthropic.com",defaultModel:"claude-sonnet-4-5"}),
    gemini:Object.freeze({host:"https://generativelanguage.googleapis.com/*",origin:"https://generativelanguage.googleapis.com",defaultModel:"gemini-3.8-flash"})
  });
  const MAX_PROMPT=6000,MAX_RESPONSE=12000,MAX_OUTPUT_TOKENS=512;
  const PROVIDER_LABELS=Object.freeze({openai:"OpenAI",anthropic:"Anthropic",gemini:"Google Gemini"});
  function providerName(value){
    if(typeof value!=="string"||!Object.prototype.hasOwnProperty.call(PROVIDERS,value))
      throw Error("Choose a supported BYOK provider");
    return value;
  }
  function modelId(value){
    if(typeof value!=="string"||value.length<2||value.length>90||!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value))
      throw Error("Model ID must be 2–90 letters, digits, dots, dashes or underscores");
    return value;
  }
  function keyText(raw){
    if(typeof raw!=="string"||raw.length<10||raw.length>4096||!/^[\x21-\x7e]+$/.test(raw))
      throw Error("Enter a valid provider API key without whitespace or line breaks");
    return raw;
  }
  function userText(input){
    if(typeof input!=="string"||!input.trim()||input.length>MAX_PROMPT)
      throw Error("Enter a prompt of 1–6,000 characters");
    return input.trim();
  }
  function normalizedSettings(raw){
    const name=raw&&Object.hasOwn(PROVIDERS,raw.provider)?raw.provider:"openai";
    let model=PROVIDERS[name].defaultModel;
    try{if(raw&&raw.model)model=modelId(raw.model);}catch{/* fallback on malformed stored config */}
    return {provider:name,model};
  }
  function buildRequest(provider,model,key,system,prompt,history=[]){
    const selected=providerName(provider);
    const id=modelId(model),secret=keyText(key),text=userText(prompt);
    const instructions=typeof system==="string"?system.slice(0,6000):"";
    const messages=history.length
      ? root.WorkspaceConversationContext.orderedMessages({turns:history},text)
      : [{role:"user",content:text}];
    if(selected==="openai")
      return {url:"https://api.openai.com/v1/responses",
        options:{method:"POST",headers:{"Authorization":"Bearer "+secret,"Content-Type":"application/json"},
          body:JSON.stringify(history.length
            ? {model:id,input:messages,instructions,store:false,max_output_tokens:MAX_OUTPUT_TOKENS}
            : {model:id,input:text,instructions,store:false,max_output_tokens:MAX_OUTPUT_TOKENS}),
          redirect:"error",credentials:"omit",cache:"no-store"}};
    if(selected==="anthropic")
      return {url:"https://api.anthropic.com/v1/messages",
        options:{method:"POST",headers:{"x-api-key":secret,"anthropic-version":"2023-06-01",
          "Content-Type":"application/json"},
          body:JSON.stringify({model:id,system:instructions,max_tokens:MAX_OUTPUT_TOKENS,
            messages:history.length?messages:[{role:"user",content:text}]}),redirect:"error",credentials:"omit",cache:"no-store"}};
    return {url:"https://generativelanguage.googleapis.com/v1beta/models/"+
      encodeURIComponent(id)+":generateContent",
      options:{method:"POST",headers:{"x-goog-api-key":secret,"Content-Type":"application/json"},
        body:JSON.stringify({systemInstruction:{parts:[{text:instructions}]},
          contents:history.length?messages.map(item=>({role:item.role==="assistant"?"model":"user",parts:[{text:item.content}]})):[{role:"user",parts:[{text}]}],
          generationConfig:{maxOutputTokens:MAX_OUTPUT_TOKENS}}),
        redirect:"error",credentials:"omit",cache:"no-store"}};
  }
  function extract(provider,json){
    if(!json||typeof json!=="object")throw Error("AI provider returned invalid JSON");
    const p=providerName(provider);
    let raw=[];
    if(p==="openai"){
      if(typeof json.output_text==="string")raw=[json.output_text];
      else if(Array.isArray(json.output))
        for(const item of json.output)for(const part of item.content||[])
          if(part?.type==="output_text"&&typeof part.text==="string")raw.push(part.text);
    }else if(p==="anthropic"){
      if(Array.isArray(json.content))
        raw=json.content.filter(item=>item?.type==="text").map(item=>item.text).filter(x=>typeof x==="string");
    }else{
      const candidate=Array.isArray(json.candidates)?json.candidates[0]:null;
      raw=Array.isArray(candidate?.content?.parts)
        ? candidate.content.parts.map(p=>p?.text).filter(x=>typeof x==="string"):[];
    }
    const combined=raw.join("\n").trim();
    if(!combined)throw Error("AI provider returned no readable text");
    return {text:combined.slice(0,MAX_RESPONSE),truncated:combined.length>MAX_RESPONSE};
  }
  async function infer({provider,model,key,system,prompt,history=[],fetchImpl}){
    const request=buildRequest(provider,model,key,system,prompt,history);
    const response=await fetchImpl(request.url,request.options);
    if(!response||!Number.isInteger(response.status))
      throw Error("AI provider returned an invalid response");
    if(!response.ok){
      // Don't relay response bodies: an error may contain user prompts or credentials.
      if(response.status===401||response.status===403)throw Error("AI provider rejected authentication or model access");
      if(response.status===429)throw Error("AI provider rate or credit limit reached");
      throw Error("AI provider request failed (HTTP "+response.status+")");
    }
    return extract(provider,await response.json());
  }
  root.WorkspaceBYOKProviders={PROVIDERS,PROVIDER_LABELS,MAX_PROMPT,
    providerName,modelId,keyText,userText,normalizedSettings,buildRequest,extract,infer};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.WorkspaceBYOKProviders;
})(globalThis);