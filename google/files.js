/* Bounded, user-initiated read-only previews of saved Google Docs and Sheets.
   This does NOT enumerate Drive files or grant access to pasted URLs. */
(function(root){
  "use strict";
  const DOCS_SCOPE="https://www.googleapis.com/auth/documents.readonly";
  const SHEETS_SCOPE="https://www.googleapis.com/auth/spreadsheets.readonly";
  const MAX_RESPONSE_BYTES=2*1024*1024;
  const MAX_DOC_CHARS=12000, MAX_CELLS=2600;
  const MAX_ROWS=100, MAX_COLS=26;
  const DOCUMENT_ID=/^[a-zA-Z0-9_-]{5,180}$/;
  const A1=/^([A-Z]{1,2})([1-9][0-9]{0,4}):([A-Z]{1,2})([1-9][0-9]{0,4})$/;
  function safeId(id) {
    if(typeof id!=="string" || !DOCUMENT_ID.test(id))throw Error("Invalid saved Google file ID");
    return id;
  }
  function validatedResource(resource) {
    if(!resource || typeof resource.key!=="string" || typeof resource.url!=="string")
      throw Error("Select a saved Google Docs or Sheets resource");
    const url=new URL(resource.url);
    if(url.protocol!=="https:" || url.hostname!=="docs.google.com") throw Error("This preview only supports saved Docs or Sheets");
    const match=url.pathname.match(/^\/(document|spreadsheets)\/d\/([a-zA-Z0-9_-]{5,180})(?:\/|$)/);
    if(!match) throw Error("Select a specific saved Google file, not an app homepage");
    const kind=match[1]==="document"?"docs":"sheets",id=safeId(match[2]);
    if(resource.key!=="file:"+match[1]+":"+id)throw Error("Saved resource ID mismatch");
    const hashParams=new URLSearchParams(url.hash.replace(/^#/,""));
    const tab=kind==="sheets"?(url.searchParams.get("gid")||hashParams.get("gid")):null;
    if(tab!==null && (!/^[0-9]{1,12}$/.test(tab)||!Number.isSafeInteger(Number(tab))))
      throw Error("Invalid spreadsheet sheet identifier");
    return {kind,id,sheetId:tab===null?null:Number(tab)};
  }
  function columnIndex(col) {
    let value=0;
    for(const letter of col)value=value*26+letter.charCodeAt(0)-64;
    return value;
  }
  function validatedRange(value) {
    const range=typeof value==="string"&&value.trim()?value.trim().toUpperCase():"A1:Z50";
    const match=range.match(A1);
    if(!match)throw Error("Specify a bounded A1 range, such as A1:Z50");
    const a=columnIndex(match[1]), b=columnIndex(match[3]);
    const row1=Number(match[2]),row2=Number(match[4]);
    if(a>b||row1>row2||b-a+1>MAX_COLS||row2-row1+1>MAX_ROWS)
      throw Error("Preview may include no more than 26 columns and 100 rows");
    return {a1:range,rows:row2-row1+1,columns:b-a+1};
  }
  function tokenFor(token,scope,now=Date.now()) {
    if(!token||typeof token.accessToken!=="string"||
       !Array.isArray(token.scopes)||!token.scopes.includes(scope)||
       !Number.isFinite(token.expiresAt)||token.expiresAt<=now)
       throw Error("Google session expired or required read-only permission is missing");
    return token.accessToken;
  }
  async function jsonGet(url, bearer, fetchImpl) {
    const dest=new URL(url);
    if(dest.protocol!=="https:" || !["docs.googleapis.com","sheets.googleapis.com"].includes(dest.hostname))
      throw Error("Unapproved Google API destination");
    const response=await fetchImpl(dest.href,{
      method:"GET",redirect:"error",credentials:"omit",cache:"no-store",
      headers:{"Authorization":"Bearer "+bearer,"Accept":"application/json"}
    });
    if(!response || !Number.isInteger(response.status))throw Error("Invalid Google API response");
    if(!response.ok){
      if(response.status===401||response.status===403||response.status===404)
        throw Error("Google could not access that file. Check account, permissions and file ID");
      throw Error("Google API error (HTTP "+response.status+")");
    }
    const declaredSize=Number(response.headers?.get?.("content-length")||0);
    if(declaredSize>MAX_RESPONSE_BYTES)throw Error("Google file is too large for a safe preview");
    let data;
    if(response.body?.getReader) {
      const reader=response.body.getReader();
      const chunks=[];let count=0;
      try{
        for(;;){
          const item=await reader.read();
          if(item.done)break;
          count+=item.value?.byteLength||0;
          if(count>MAX_RESPONSE_BYTES)throw Error("Google file exceeds the preview response-size limit");
          chunks.push(item.value);
        }
      }finally{reader.releaseLock();}
      const raw=new Uint8Array(count);let offset=0;
      for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
      data=JSON.parse(new TextDecoder().decode(raw));
    }else{
      // Test adapters may only provide .json(); real Firefox responses have readable bodies.
      data=await response.json();
    }
    if(!data||typeof data!=="object"||Array.isArray(data))throw Error("Google returned invalid document data");
    return data;
  }
  function collectText(doc) {
    const parts=[],budget={chars:0,nodes:0,truncated:false};
    function add(input){
      if(typeof input!=="string"||!input.length||budget.chars>=MAX_DOC_CHARS)return;
      const remaining=MAX_DOC_CHARS-budget.chars;
      const segment=input.slice(0,remaining);
      budget.chars+=segment.length;
      parts.push(segment);
      if(input.length>remaining)budget.truncated=true;
    }
    function walk(obj,depth=0){
      if(budget.nodes++>15000 || depth>18 || budget.chars>=MAX_DOC_CHARS){
        budget.truncated=true;return;
      }
      if(!obj||typeof obj!=="object")return;
      if(Array.isArray(obj)){for(const el of obj){walk(el,depth+1);if(budget.truncated)break;}return;}
      if(typeof obj.textRun?.content==="string") {add(obj.textRun.content);return;}
      if(typeof obj.paragraph?.elements!=="undefined")walk(obj.paragraph.elements,depth+1);
      if(obj.table?.tableRows)walk(obj.table.tableRows,depth+1);
      if(obj.tableCells)walk(obj.tableCells,depth+1);
      if(obj.content)walk(obj.content,depth+1);
      if(obj.documentTab?.body?.content)walk(obj.documentTab.body.content,depth+1);
      if(obj.childTabs)walk(obj.childTabs,depth+1);
      if(obj.tabs)walk(obj.tabs,depth+1);
      if(obj.body?.content)walk(obj.body.content,depth+1);
    }
    walk(doc);
    return {text:parts.join(""),truncated:budget.truncated};
  }
  async function readDoc(resource,token,fetchImpl,now=Date.now()){
    const selection=validatedResource(resource);
    if(selection.kind!=="docs")throw Error("Selected resource is not a Google Doc");
    const bearer=tokenFor(token,DOCS_SCOPE,now);
    const url=new URL("https://docs.googleapis.com/v1/documents/"+selection.id);
    url.searchParams.set("includeTabsContent","true");
    const result=await jsonGet(url.href,bearer,fetchImpl);
    const preview=collectText(result);
    return {kind:"docs",id:selection.id,title:String(result.title||resource.name).slice(0,180),
      text:preview.text,truncated:preview.truncated,sourceUrl:resource.url};
  }
  function quotedSheet(name) {
    if(typeof name!=="string"||!name.trim()||name.length>150)
      throw Error("Sheet title was missing from Google metadata");
    return "'"+name.replace(/'/g,"''")+"'";
  }
  async function readSheet(resource,rangeInput,token,fetchImpl,now=Date.now()){
    const selection=validatedResource(resource);
    if(selection.kind!=="sheets")throw Error("Selected resource is not a Google Sheet");
    const range=validatedRange(rangeInput);
    const bearer=tokenFor(token,SHEETS_SCOPE,now);
    const metadata=new URL("https://sheets.googleapis.com/v4/spreadsheets/"+selection.id);
    metadata.searchParams.set("fields","spreadsheetId,properties(title),sheets(properties(sheetId,title))");
    const info=await jsonGet(metadata.href,bearer,fetchImpl);
    const tabs=Array.isArray(info.sheets)?info.sheets:[];
    const chosen=selection.sheetId===null?tabs[0]:
      tabs.find(tab=>tab?.properties?.sheetId===selection.sheetId);
    if(!chosen)throw Error("Selected spreadsheet tab could not be found");
    const namedRange=quotedSheet(chosen.properties?.title)+"!"+range.a1;
    const valuesUrl="https://sheets.googleapis.com/v4/spreadsheets/"+
      selection.id+"/values/"+encodeURIComponent(namedRange);
    const data=await jsonGet(valuesUrl,bearer,fetchImpl);
    const rows=Array.isArray(data.values)?data.values.slice(0,range.rows):[];
    const values=rows.map(row=>(Array.isArray(row)?row:[]).slice(0,range.columns)
      .map(cell=>String(cell??"").slice(0,300)));
    if(values.reduce((sum,row)=>sum+row.length,0)>MAX_CELLS)
      throw Error("Google values exceeded preview cell limit");
    return {kind:"sheets",id:selection.id,title:String(info.properties?.title||resource.name).slice(0,180),
      sheet:chosen.properties.title,range:range.a1,rows:values,
      truncated:Boolean(rows.length>range.rows || data.nextPageToken),sourceUrl:resource.url};
  }
  root.WorkspaceGoogleFiles={DOCS_SCOPE,SHEETS_SCOPE,validatedResource,validatedRange,
    collectText,readDoc,readSheet};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.WorkspaceGoogleFiles;
})(globalThis);