/* Small, explicit Drive and Gmail REST previews: no content bodies, writes or AI calls. */
(function(root){
  "use strict";
  const OAUTH=root.WorkspaceGoogleOAuth;
  const READ=root.WorkspaceGoogleRead;
  const MAX_BYTES=256*1024;
  const DRIVE="https://www.googleapis.com/drive/v3/files";
  const GMAIL="https://gmail.googleapis.com/gmail/v1/users/me/messages";
  const DRIVE_HOSTS=new Set(["drive.google.com","docs.google.com","sheets.google.com"]);
  function safeText(value,max=160){
    return typeof value==="string"?value.slice(0,max):"";
  }
  function safeFileLink(raw){
    try{
      const url=new URL(raw);
      if(url.protocol!=="https:"||url.username||url.password||
         !DRIVE_HOSTS.has(url.hostname)||url.port)return null;
      return url.href.slice(0,2048);
    }catch{return null;}
  }
  async function boundedJSON(response){
    const length=Number(response.headers?.get?.("content-length")||0);
    if(length>MAX_BYTES)throw Error("Google metadata exceeds preview size limit");
    if(response.body?.getReader){
      const reader=response.body.getReader(),chunks=[];
      let size=0;
      try{
        for(;;){
          const {done,value}=await reader.read();
          if(done)break;
          if(!value || !Number.isFinite(value.length))
            throw Error("Google metadata stream is invalid");
          size+=value.length;
          if(size>MAX_BYTES)throw Error("Google metadata exceeds preview size limit");
          chunks.push(value);
        }
      }finally{try{reader.releaseLock();}catch{}}
      const bytes=new Uint8Array(size);
      let index=0;
      for(const part of chunks){bytes.set(part,index);index+=part.length;}
      return JSON.parse(new TextDecoder().decode(bytes));
    }
    // Test fixtures lacking streaming response support.
    return response.json();
  }
  async function getJson(url,accessToken,fetchImpl,allowedHost){
    const parsed=new URL(url);
    if(parsed.protocol!=="https:" || parsed.hostname!==allowedHost ||
       parsed.username || parsed.password || parsed.port)
      throw Error("Unexpected Google metadata destination");
    let response;
    try{
      response=await fetchImpl(parsed.href,{
        method:"GET",headers:{"Authorization":"Bearer "+accessToken,
          "Accept":"application/json"},
        cache:"no-store",credentials:"omit",redirect:"error"
      });
    }catch{
      throw Error("Google metadata network connection failed");
    }
    if(!response || !Number.isInteger(response.status))
      throw Error("Google metadata response was invalid");
    if(!response.ok){
      if(response.status===401)throw Error("Google access token rejected (HTTP 401)");
      if(response.status===403)throw Error("Google scope, API access or policy denied (HTTP 403)");
      if(response.status===429)throw Error("Google metadata request rate limited (HTTP 429)");
      throw Error("Google metadata API returned HTTP "+response.status);
    }
    let result;
    try{result=await boundedJSON(response);}catch{throw Error("Google metadata response unreadable");}
    if(!result||typeof result!=="object"||Array.isArray(result))
      throw Error("Google metadata response has unexpected shape");
    return result;
  }
  async function recentDrive(token,fetchImpl,now=Date.now()){
    const key=READ.requireToken(token,OAUTH.DRIVE_METADATA_READ,now);
    const url=new URL(DRIVE);
    url.searchParams.set("pageSize","20");
    url.searchParams.set("q","trashed = false");
    url.searchParams.set("orderBy","modifiedTime desc");
    url.searchParams.set("fields","nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)");
    const data=await getJson(url.href,key,fetchImpl,"www.googleapis.com");
    const files=(Array.isArray(data.files)?data.files:[]).slice(0,20).map(f=>({
      id:safeText(f?.id,180),name:safeText(f?.name||"Untitled file",180),
      mimeType:safeText(f?.mimeType,120),modified:safeText(f?.modifiedTime,45),
      link:safeFileLink(f?.webViewLink)
    }));
    return {kind:"drive",files,limited:Boolean(data.nextPageToken),
      note:"First 20 recent files; metadata only, not a complete Drive inventory."};
  }
  function header(payload,name){
    const headers=Array.isArray(payload?.headers)?payload.headers:[];
    const entry=headers.find(h=>typeof h?.name==="string"&&
      h.name.toLowerCase()===name.toLowerCase());
    return safeText(entry?.value,name==="Subject"?180:160);
  }
  async function inboxGmail(token,fetchImpl,now=Date.now()){
    const key=READ.requireToken(token,OAUTH.GMAIL_METADATA_READ,now);
    const url=new URL(GMAIL);
    url.searchParams.set("maxResults","8");
    url.searchParams.append("labelIds","INBOX");
    url.searchParams.set("fields","nextPageToken,messages(id,threadId)");
    const index=await getJson(url.href,key,fetchImpl,"gmail.googleapis.com");
    const ids=(Array.isArray(index.messages)?index.messages:[]).slice(0,8)
      .map(item=>safeText(item?.id,100)).filter(id=>/^[a-zA-Z0-9_-]{4,100}$/.test(id));
    const messages=[];
    for(const id of ids){
      const resource=new URL(GMAIL+"/"+encodeURIComponent(id));
      resource.searchParams.set("format","metadata");
      resource.searchParams.append("metadataHeaders","From");
      resource.searchParams.append("metadataHeaders","Subject");
      resource.searchParams.append("metadataHeaders","Date");
      resource.searchParams.set("fields",
        "id,threadId,labelIds,internalDate,payload(headers(name,value))");
      const item=await getJson(resource.href,key,fetchImpl,"gmail.googleapis.com");
      messages.push({
        from:header(item.payload,"From"),subject:header(item.payload,"Subject")||"(No subject)",
        date:header(item.payload,"Date"),
        unread:Array.isArray(item.labelIds)&&item.labelIds.includes("UNREAD")
      });
    }
    return {kind:"gmail",messages,limited:Boolean(index.nextPageToken),
      note:"At most eight inbox headers. No body, attachments, full mailbox search or email actions."};
  }
  root.WorkspaceGoogleCatalog={recentDrive,inboxGmail,safeFileLink,header};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.WorkspaceGoogleCatalog;
})(globalThis);
