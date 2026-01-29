#!/usr/bin/env node

/**
 * ACP Bridge - Connects Zeroshot to an ACP agent
 * Usage: node bridge.js --prompt "..." --command "npx agent" --transport stdio
 */

const { spawn } = require('child_process');
const { Writable, Readable } = require('stream');
const fs = require('fs/promises');

async function main() {
  const { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } = await import('@agentclientprotocol/sdk');

  const args = process.argv.slice(2);
  const promptIndex = args.indexOf('--prompt');
  const commandIndex = args.indexOf('--command');
  const transportIndex = args.indexOf('--transport');

  const promptText = promptIndex !== -1 ? args[promptIndex + 1] : '';
  const command = commandIndex !== -1 ? args[commandIndex + 1] : '';
  const transport = transportIndex !== -1 ? args[transportIndex + 1] : 'stdio';

  if (!promptText) {
    process.stderr.write('Error: --prompt required\n');
    process.exit(1);
  }

  process.stderr.write(`[BRIDGE] Connecting to agent: ${command} (${transport})\n`);

  const [cmd, ...cmdArgs] = command.split(' ');
  const agentProcess = spawn(cmd, cmdArgs, {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  const input = Writable.toWeb(agentProcess.stdin);
  const output = Readable.toWeb(agentProcess.stdout);
  
  const client = {
    requestPermission: async (params) => {
      process.stderr.write(`[BRIDGE] Permission requested: ${params.toolCall.title}\n`);
      const allowOption = params.options.find(o => o.kind === 'allow') || params.options[0];
      await Promise.resolve(); // Satisfy require-await
      return { outcome: { outcome: 'selected', optionId: allowOption.optionId } };
    },
    sessionUpdate: async (params) => {
      const update = params.update;
      if (update.sessionUpdate === 'agent_message_chunk') {
        if (update.content.type === 'text') {
           process.stdout.write(JSON.stringify({
             type: 'text',
             text: update.content.text
           }) + '\n');
        }
      } else if (update.sessionUpdate === 'agent_thought_chunk') {
        process.stderr.write(`[THOUGHT] ${update.content.text || ''}\n`);
      }
      await Promise.resolve(); // Satisfy require-await
    },
    writeTextFile: async (params) => {
      process.stderr.write(`[BRIDGE] Writing file: ${params.path}\n`);
      try {
        await fs.writeFile(params.path, params.content, 'utf8');
        return {};
      } catch (err) {
        throw new Error(`Failed to write file: ${err.message}`);
      }
    },
    readTextFile: async (params) => {
      process.stderr.write(`[BRIDGE] Reading file: ${params.path}\n`);
      try {
        const content = await fs.readFile(params.path, 'utf8');
        return { content };
      } catch (err) {
        if (err.code === 'ENOENT') {
            throw new Error(`File not found: ${params.path}`);
        }
        throw new Error(`Failed to read file: ${err.message}`);
      }
    },
    listDirectory: async (params) => {
      process.stderr.write(`[BRIDGE] Listing directory: ${params.path}\n`);
      try {
        const entries = await fs.readdir(params.path, { withFileTypes: true });
        return {
          entries: entries.map(e => ({
            name: e.name,
            isDirectory: e.isDirectory(),
            isFile: e.isFile(),
            isSymlink: e.isSymbolicLink()
          }))
        };
      } catch (err) {
        throw new Error(`Failed to list directory: ${err.message}`);
      }
    },
    getCwd: async () => {
        await Promise.resolve();
        return { cwd: process.cwd() };
    }
  };

  const stream = ndJsonStream(input, output);
  const connection = new ClientSideConnection(() => client, stream);

  try {
    process.stderr.write(`[BRIDGE] Initializing protocol v${PROTOCOL_VERSION}...
`);
    await connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: {
            readTextFile: true,
            writeTextFile: true,
            listDirectory: true,
            getCwd: true
        }
      },
    });

    process.stderr.write(`[BRIDGE] Creating session...
`);
    const session = await connection.newSession({
      cwd: process.cwd(),
      mcpServers: [] 
    });
    
    process.stderr.write(`[BRIDGE] Sending prompt...
`);
    const result = await connection.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: 'text', text: promptText }],
    });

    process.stderr.write(`[BRIDGE] Prompt complete. Reason: ${result.stopReason}\n`);

    await new Promise(r => setTimeout(r, 500));
    agentProcess.kill();
    process.exit(0);
    
  } catch (error) {
    process.stderr.write(`[BRIDGE] Error: ${error.message}\n`);
    agentProcess.kill();
    process.exit(1);
  }
}

main().catch(err => {
  process.stderr.write(`[BRIDGE] Fatal Error: ${err.stack}\n`);
  process.exit(1);
});
