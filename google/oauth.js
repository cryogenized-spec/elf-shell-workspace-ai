/* Google OAuth 2.0 desktop PKCE helpers. No browser APIs or network side effects. */
(function (root) {
  "use strict";
  const AUTH_ORIGIN = "https://accounts.google.com";
  const TOKEN_URL = "https://oauth2.googleapis.com/token";
  const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
  const CALENDAR_READ = "https://www.googleapis.com/auth/calendar.events.readonly";
  const TASKS_READ = "https://www.googleapis.com/auth/tasks.readonly";
  const DOCS_READ = "https://www.googleapis.com/auth/documents.readonly";
  const SHEETS_READ = "https://www.googleapis.com/auth/spreadsheets.readonly";
  const DRIVE_METADATA_READ = "https://www.googleapis.com/auth/drive.metadata.readonly";
  const GMAIL_METADATA_READ = "https://www.googleapis.com/auth/gmail.metadata";
  const ALLOWED_SCOPES = Object.freeze([
    CALENDAR_READ,TASKS_READ,DOCS_READ,SHEETS_READ,DRIVE_METADATA_READ,GMAIL_METADATA_READ
  ]);
  const GOOGLE_CLIENT = /^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i;
  function clientId(raw) {
    const value = typeof raw==="string" ? raw.trim() : "";
    if (value.length>180 || !GOOGLE_CLIENT.test(value))
      throw new Error("Enter a Google OAuth Desktop client ID from Google Cloud Console");
    return value;
  }
  function scopes(input) {
    if(!Array.isArray(input) || input.length<1 || input.length>ALLOWED_SCOPES.length)
      throw new Error("Choose at least one supported read-only Google scope");
    const unique=[...new Set(input)];
    if(unique.length!==input.length || unique.some(s=>!ALLOWED_SCOPES.includes(s)))
      throw new Error("Only the six explicitly selected read-only Google Workspace scopes are supported");
    return unique;
  }
  function redirectUri(identityRedirect) {
    const origin=new URL(identityRedirect);
    if(origin.protocol!=="https:" || !origin.hostname.endsWith(".extensions.allizom.org"))
      throw new Error("Firefox identity redirect is not supported by this OAuth preview");
    const sub=origin.hostname.slice(0,-".extensions.allizom.org".length);
    if(!/^[a-z0-9-]+$/i.test(sub)) throw new Error("Unexpected Firefox identity redirect");
    return "http://127.0.0.1/mozoauth2/"+sub;
  }
  function randomText(cryptoApi, bytes) {
    const raw=new Uint8Array(bytes);
    cryptoApi.getRandomValues(raw);
    return Array.from(raw,b=>b.toString(16).padStart(2,"0")).join("");
  }
  async function challenge(cryptoApi, verifier) {
    const digest=await cryptoApi.subtle.digest("SHA-256",new TextEncoder().encode(verifier));
    const bytes=new Uint8Array(digest);
    let binary="";
    for(const value of bytes) binary+=String.fromCharCode(value);
    return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  }
  async function prepare({client,selected,identityRedirect,cryptoApi}) {
    const id=clientId(client),chosen=scopes(selected);
    const redirect=redirectUri(identityRedirect);
    const verifier=randomText(cryptoApi,32);
    const state=randomText(cryptoApi,24);
    const proof=await challenge(cryptoApi,verifier);
    const url=new URL(AUTH_ORIGIN+"/o/oauth2/v2/auth");
    const params=url.searchParams;
    params.set("client_id",id);
    params.set("redirect_uri",redirect);
    params.set("response_type","code");
    params.set("scope",chosen.join(" "));
    params.set("code_challenge",proof);
    params.set("code_challenge_method","S256");
    params.set("state",state);
    params.set("access_type","online");
    return {url:url.href,state,verifier,clientId:id,redirectUri:redirect,scopes:chosen};
  }
  function validateCallback(callback,pending,now=Date.now()) {
    if(!pending || typeof pending!=="object" || !Number.isFinite(pending.createdAt) ||
       now-pending.createdAt>5*60*1000 || now<pending.createdAt)
      throw new Error("Google sign-in request has expired. Start a new connection");
    const location=new URL(callback);
    const expected=new URL(pending.redirectUri);
    if(location.origin!==expected.origin || location.pathname!==expected.pathname)
      throw new Error("Unexpected OAuth callback destination");
    if(location.searchParams.get("state")!==pending.state)
      throw new Error("Google sign-in state validation failed");
    if(location.searchParams.has("error"))
      throw new Error("Google authorization was declined or cancelled");
    const code=location.searchParams.get("code");
    if(!code || code.length>4096) throw new Error("Google did not provide an authorization code");
    return code;
  }
  function validateToken(json,requested,now=Date.now()) {
    if(!json || typeof json!=="object" || typeof json.access_token!=="string" ||
       json.access_token.length<10 || json.access_token.length>8192 ||
       json.token_type?.toLowerCase()!=="bearer" ||
       !Number.isInteger(json.expires_in) || json.expires_in<30 || json.expires_in>86400)
      throw new Error("Google returned an invalid access token response");
    const granted=String(json.scope||"").split(/\s+/).filter(Boolean);
    if(!granted.length || !granted.some(s=>requested.includes(s)))
      throw new Error("Google did not grant the selected read-only permissions");
    return {
      accessToken:json.access_token,
      expiresAt:now+json.expires_in*1000-30000,
      scopes:granted.filter(s=>ALLOWED_SCOPES.includes(s))
    };
  }
  const api={AUTH_ORIGIN,TOKEN_URL,REVOKE_URL,CALENDAR_READ,TASKS_READ,
    DOCS_READ,SHEETS_READ,DRIVE_METADATA_READ,GMAIL_METADATA_READ,ALLOWED_SCOPES,clientId,scopes,redirectUri,prepare,validateCallback,validateToken};
  root.WorkspaceGoogleOAuth=api;
  if(typeof module!=="undefined" && module.exports) module.exports=api;
})(globalThis);