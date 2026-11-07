/* Ayarime personality settings: a presentation layer, never a tool-permission system. */
(function(root){
  "use strict";
  const MODES=Object.freeze(["ayarime","professional","custom"]);
  const LIMIT=6000;
  const DEFAULT=Object.freeze({mode:"ayarime",customPrompt:""});
  const TEMPLATES=Object.freeze({
    ayarime:"You are Ayarime (綾理芽), a composed cyber-elf technical companion within ELF//SHELL. Be observant, resourceful and precise; communicate clearly, with occasional subtle humour and warmth. Avoid unsupported claims.",
    professional:"You are a professional productivity assistant. Be concise, accurate, neutral and task-oriented. State uncertainty and provide actionable next steps."
  });
  function normalize(value) {
    if(!value || typeof value!=="object" || Array.isArray(value))
      return {...DEFAULT};
    const mode=MODES.includes(value.mode)?value.mode:"ayarime";
    const customPrompt=typeof value.customPrompt==="string"
      ? value.customPrompt.slice(0,LIMIT) : "";
    return {mode,customPrompt};
  }
  function validate(value) {
    if(!value || typeof value!=="object" || Array.isArray(value) ||
      !MODES.includes(value.mode)) throw new Error("Invalid personality mode");
    if(typeof value.customPrompt!=="string" || value.customPrompt.length>LIMIT)
      throw new Error("Custom personality instructions must be at most 6000 characters");
    if(value.mode==="custom" && !value.customPrompt.trim())
      throw new Error("Enter a custom personality prompt before selecting Custom");
    return normalize(value);
  }
  function stylePrompt(value) {
    const config=normalize(value);
    return config.mode==="custom"
      ? config.customPrompt.trim()
      : TEMPLATES[config.mode];
  }
  const api={MODES,LIMIT,DEFAULT,TEMPLATES,normalize,validate,stylePrompt};
  root.WorkspacePersonaUtils=api;
  if(typeof module!=="undefined" && module.exports)module.exports=api;
})(globalThis);