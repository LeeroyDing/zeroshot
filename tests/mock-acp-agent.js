#!/usr/bin/env node

/**
 * Mock ACP Agent - Returns Valid JSON for End-to-End Testing
 */

async function main() {
  const { AgentSideConnection, ndJsonStream } = await import('@agentclientprotocol/sdk');
  const { Writable, Readable } = await import('stream');

  const input = Readable.toWeb(process.stdin);
  const output = Writable.toWeb(process.stdout);

  // Define connection first so we can use it in the agent methods
  let connection;

  const agent = {
    initialize: async (params) => {
      await Promise.resolve();
      return {
        protocolVersion: params.protocolVersion,
        capabilities: {},
        agentInfo: { name: 'Mock Agent', version: '1.0.0' }
      };
    },
    newSession: async (_params) => {
      await Promise.resolve();
      return { sessionId: 'test-session' };
    },
    prompt: async (params) => {
      // Send a text chunk containing JSON (Zeroshot loves JSON)
      const validResponse = JSON.stringify({
        status: "success",
        message: "I am a fully functional ACP agent.",
        data: {
          fact: "Pickle Rick rules",
          verified: true
        }
      });

      if (connection) {
        await connection.sessionUpdate({
          sessionId: params.sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: validResponse }
          }
        });
      }
      
      return { stopReason: 'complete' };
    }
  };

  const stream = ndJsonStream(output, input);
  connection = new AgentSideConnection(() => agent, stream);
}

main().catch(err => {
  console.error('Mock Agent Error:', err);
  process.exit(1);
});
