#!/usr/bin/env node

/**
 * ACP Bridge - Connects Zeroshot to an ACP agent
 * Usage: node bridge.js --prompt "..." --command "npx agent" --transport stdio
 */

const { spawn } = require('child_process');
const { Writable, Readable } = require('stream');

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
      return { outcome: { outcome: 'selected', optionId: params.options[0].optionId } };
    },
    sessionUpdate: async (params) => {
      const update = params.update;
      process.stderr.write(`[BRIDGE] Update received: ${update.sessionUpdate}\n`);
      
      if (update.sessionUpdate === 'agent_message_chunk') {
        if (update.content.type === 'text') {
           // Output to Zeroshot stdout
           process.stdout.write(JSON.stringify({
             type: 'text',
             text: update.content.text
           }) + '\n');
        }
      } else if (update.sessionUpdate === 'agent_thought_chunk') {
        process.stderr.write(`[THOUGHT] ${update.content.text || ''}\n`);
      }
    },
    writeTextFile: async () => ({}),
    readTextFile: async () => ({ content: '' }),
  };

  const stream = ndJsonStream(input, output);
  const connection = new ClientSideConnection(() => client, stream);

  try {
    process.stderr.write(`[BRIDGE] Initializing protocol v${PROTOCOL_VERSION}...
`);
    await connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    process.stderr.write(`[BRIDGE] Creating session...
`);
    const session = await connection.newSession({
      cwd: process.cwd(),
      mcpServers: [] 
    });
    
    process.stderr.write(`[BRIDGE] Sending prompt: ${promptText.slice(0, 50)}...
`);
    const result = await connection.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: 'text', text: promptText }],
    });

    process.stderr.write(`[BRIDGE] Prompt complete. Reason: ${result.stopReason}\n`);

    // Give it a second to flush any remaining updates
    await new Promise(r => setTimeout(r, 1000));

    agentProcess.kill();
    process.exit(0);
    
  } catch (error) {
    process.stderr.write(`[BRIDGE] Error: ${error.message}\n`);
    if (error.data) {
      process.stderr.write(`[BRIDGE] Data: ${JSON.stringify(error.data)}\n`);
    }
    agentProcess.kill();
    process.exit(1);
  }
}

main().catch(err => {
  process.stderr.write(`[BRIDGE] Fatal Error: ${err.stack}\n`);
  process.exit(1);
});