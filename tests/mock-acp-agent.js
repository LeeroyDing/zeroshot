#!/usr/bin/env node

/**
 * Mock ACP Agent - Minimal implementation for testing
 */

async function main() {
  const { AgentSideConnection, ndJsonStream } = await import('@agentclientprotocol/sdk');
  const { Writable, Readable } = await import('stream');

  const input = Readable.toWeb(process.stdin);
  const output = Writable.toWeb(process.stdout);

  const agent = {
    initialize: async (params) => {
      return {
        protocolVersion: params.protocolVersion,
        capabilities: {},
        agentInfo: { name: 'Mock Agent', version: '1.0.0' }
      };
    },
    newSession: async (params) => {
      return { sessionId: 'test-session' };
    },
    prompt: async (params) => {
      // Send response chunk
      await connection.sessionUpdate({
        sessionId: params.sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: "I'm Pickle Rick! (and an ACP agent) 🥒" }
        }
      });
      
      return { stopReason: 'complete' };
    }
  };

  const stream = ndJsonStream(output, input);
  const connection = new AgentSideConnection(() => agent, stream);
  
  // Keep alive is NOT needed if the SDK handles it, but we need to wait for closure
  // The connection should stay open as long as the stream is open.
}

main().catch(err => {
  console.error('Mock Agent Error:', err);
  process.exit(1);
});
