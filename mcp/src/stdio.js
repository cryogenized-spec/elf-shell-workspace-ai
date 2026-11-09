#!/usr/bin/env node
// stdout belongs exclusively to MCP JSON-RPC, not logs.
// SDK v2 serveStdio manages its own lifecycle and returns void.
import {serveStdio} from "@modelcontextprotocol/server/stdio";
import {createServer} from "./server.js";
serveStdio(createServer);
