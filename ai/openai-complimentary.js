/* User-selected OpenAI complimentary-token offer catalog; NOT an account-billing API. */
(function(root){
  "use strict";
  const KEY="elfshell.openai.offer.v1";
  const STANDARD=Object.freeze([
    {id:"gpt-5.4",status:"available"},
    {id:"gpt-5.2",status:"available"},
    {id:"gpt-5.1",status:"deprecated"},
    {id:"gpt-5",status:"deprecated"},
    {id:"gpt-4.1",status:"deprecated",nonReasoning:true},
    {id:"gpt-4o",status:"deprecated",nonReasoning:true},
    {id:"o1",status:"shut-down"},
    {id:"o3",status:"deprecated"}
  ].map(x=>Object.freeze(x)));
  const SMALL=Object.freeze([
    {id:"gpt-5.4-mini",status:"available"},
    {id:"gpt-5.4-nano",status:"deprecated"},
    {id:"gpt-5-mini",status:"deprecated"},
    {id:"gpt-5-nano",status:"deprecated"},
    {id:"gpt-4.1-mini",status:"deprecated",nonReasoning:true},
    {id:"gpt-4.1-nano",status:"shut-down",nonReasoning:true},
    {id:"gpt-4o-mini",status:"deprecated",nonReasoning:true},
    {id:"o3-mini",status:"shut-down"},
    {id:"o4-mini",status:"shut-down"}
  ].map(x=>Object.freeze(x)));
  const OTHER=Object.freeze([
    {id:"gpt-6-luna",status:"available"},
    {id:"gpt-6.1-terra",status:"available"},
    {id:"gpt-6.1-sol",status:"available"},
    {id:"gpt-6-astra",status:"available"}
  ].map(x=>Object.freeze(x)));
  const LIMITS=Object.freeze({standard:250000,small:2500000});
  const GROUPS=Object.freeze({standard:STANDARD,small:SMALL,other:OTHER});
  const NOTE="Not a billing guarantee: complimentary usage requires OpenAI organization/project data-sharing enrollment and eligibility, positive API balance, and available quota. This add-on sees only its own reported token usage, not your other projects or API requests. Tool calls and overruns can be billed.";
  function lookup(model){
    if(typeof model!=="string")return null;
    for(const [group,list] of Object.entries(GROUPS)){
      const item=list.find(x=>x.id===model);
      if(item)return {...item,group,limit:LIMITS[group]??null};
    }
    return null;
  }
  function utcDay(at=Date.now()){
    const t=Number(at);
    if(!Number.isFinite(t))throw Error("Invalid usage timestamp");
    return new Date(t).toISOString().slice(0,10);
  }
  function blank(day){return {date:day,standard:0,small:0};}
  function sanitize(saved,day=utcDay()){
    if(!saved||typeof saved!=="object")return {enrolled:false,usage:blank(day)};
    const usage=saved.usage,valid=usage&&usage.date===day;
    const safe=n=>Number.isSafeInteger(n)&&n>=0?n:0;
    return {enrolled:saved.enrolled===true,
      usage:valid?{date:day,standard:safe(usage.standard),small:safe(usage.small)}:blank(day)};
  }
  async function status(browserApi,at=Date.now()){
    const saved=(await browserApi.storage.local.get(KEY))[KEY];
    const state=sanitize(saved,utcDay(at));
    return {date:state.usage.date,enrollmentSelfReported:state.enrolled,
      verifiedByOpenAI:false,remainingIsAuthoritative:false,
      observedTokens:{standard:state.usage.standard,small:state.usage.small},
      limits:{...LIMITS},note:NOTE};
  }
  async function setEnrollment(browserApi,enabled,at=Date.now()){
    if(typeof enabled!=="boolean")throw Error("Enrollment attestation must be a checkbox");
    const saved=(await browserApi.storage.local.get(KEY))[KEY];
    const safe=sanitize(saved,utcDay(at));
    safe.enrolled=enabled;
    await browserApi.storage.local.set({[KEY]:safe});
    return status(browserApi,at);
  }
  // Serialize writes when two sidebar/super-tab streams complete near each other.
  let chain=Promise.resolve();
  async function record(browserApi,model,usage,at=Date.now()){
    const item=lookup(model);
    if(!item||!LIMITS[item.group])return status(browserApi,at);
    const input=usage?.inputTokens,output=usage?.outputTokens;
    if(!Number.isSafeInteger(input)||input<0||!Number.isSafeInteger(output)||output<0)
      return status(browserApi,at);
    const count=input+output;
    if(!Number.isSafeInteger(count))return status(browserApi,at);
    const day=utcDay(at);
    const work=chain.catch(()=>{}).then(async()=>{
      const saved=(await browserApi.storage.local.get(KEY))[KEY];
      const safe=sanitize(saved,day);
      safe.usage[item.group]=Math.min(Number.MAX_SAFE_INTEGER,safe.usage[item.group]+count);
      await browserApi.storage.local.set({[KEY]:safe});
      return status(browserApi,at);
    });
    chain=work.catch(()=>{});
    return work;
  }
  async function handle(browserApi,message){
    switch(message.type){
      case "AI_OFFER_STATUS":return {ok:true,offer:await status(browserApi)};
      case "AI_OFFER_SET_ENROLLMENT":return {ok:true,offer:await setEnrollment(browserApi,message.enrolled)};
      default:throw Error("Unknown model offer request");
    }
  }
  root.WorkspaceOpenAIComplimentary={GROUPS,LIMITS,NOTE,KEY,lookup,utcDay,sanitize,
    status,setEnrollment,record,handle};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.WorkspaceOpenAIComplimentary;
})(globalThis);
