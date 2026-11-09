#!/usr/bin/env node
// Stdout belongs exclusively to MCP JSON-RPC, not logs.
import {serveStdio} from "@modelcontextprotocol/server/stdio";
import {createServer} from "./server.js";
void serveStdio(createServer).catch(()=>{
  console.error("ELF//SHELL Google MCP could not start.");
  process.exitCode=1;
});
