/* Pure URL matching and data validation. No Google API access and no browser dependencies. */
(function (root) {
  "use strict";
  const ALLOWED_HOSTS = new Set([
    "docs.google.com", "drive.google.com", "mail.google.com",
    "calendar.google.com", "tasks.google.com", "slides.google.com"
  ]);
  const DEFAULT_RESOURCES = Object.freeze([
    {name:"Gmail",url:"https://mail.google.com/mail/u/0/#inbox"},
    {name:"Calendar",url:"https://calendar.google.com/calendar/u/0/r"},
    {name:"Drive",url:"https://drive.google.com/drive/u/0/my-drive"},
    {name:"Docs",url:"https://docs.google.com/document/u/0/"},
    {name:"Sheets",url:"https://docs.google.com/spreadsheets/u/0/"},
    {name:"Tasks",url:"https://tasks.google.com/tasks/"}
  ]);
  function parseGoogleUrl(value) {
    if (typeof value !== "string" || value.length > 2048) throw new Error("Invalid Google Workspace URL");
    let url;
    try { url = new URL(value); } catch { throw new Error("Enter a complete HTTPS Google Workspace URL"); }
    if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname) || url.username || url.password || url.port) {
      throw new Error("Only supported Google Workspace HTTPS links are accepted");
    }
    return url;
  }
  function appKind(url) {
    const host = url.hostname, path = url.pathname;
    if (host === "docs.google.com") {
      if (path.startsWith("/spreadsheets/")) return "sheets";
      if (path.startsWith("/document/")) return "docs";
      if (path.startsWith("/presentation/")) return "slides";
    }
    if (host === "slides.google.com") return "slides";
    if (host === "drive.google.com") return "drive";
    if (host === "mail.google.com") return "gmail";
    if (host === "calendar.google.com") return "calendar";
    if (host === "tasks.google.com") return "tasks";
    return null;
  }
  function resourceKey(value) {
    const url = parseGoogleUrl(value);
    const kind = appKind(url);
    const file = url.pathname.match(/^\/(spreadsheets|document|presentation)\/d\/([A-Za-z0-9_-]{5,})(?:\/|$)/);
    if (url.hostname === "docs.google.com" && file) {
      return "file:" + file[1] + ":" + file[2];
    }
    const driveFile = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{5,})(?:\/|$)/);
    if (url.hostname === "drive.google.com" && driveFile) return "file:drive:" + driveFile[1];
    const driveFolder = url.pathname.match(/^\/drive\/folders\/([A-Za-z0-9_-]{5,})(?:\/|$)/);
    if (url.hostname === "drive.google.com" && driveFolder) return "folder:drive:" + driveFolder[1];
    if (kind) return "app:" + kind;
    return "url:" + url.origin + url.pathname.replace(/\/$/, "");
  }
  function normalizeResource(name, rawUrl) {
    const cleanName = String(name || "").trim().replace(/\s+/g, " ");
    if (!cleanName || cleanName.length > 90) throw new Error("Name must contain 1–90 characters");
    const url = parseGoogleUrl(rawUrl);
    return {name:cleanName, url:url.href, key:resourceKey(url.href)};
  }
  function matchesTab(resource, tab) {
    if (!tab || typeof tab.url !== "string") return false;
    try {
      if (resource.key.startsWith("app:")) {
        return resource.key === "app:" + appKind(parseGoogleUrl(tab.url));
      }
      return resource.key === resourceKey(tab.url);
    } catch {
      return false;
    }
  }
  const api = {DEFAULT_RESOURCES, parseGoogleUrl, resourceKey, normalizeResource, matchesTab};
  root.WorkspaceUtils = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);