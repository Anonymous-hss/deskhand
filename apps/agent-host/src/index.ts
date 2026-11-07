import { DeskhandGatewayServer } from './gateway/server.js';

const PORT = Number(process.env.PORT || 4100);
const gateway = new DeskhandGatewayServer(PORT);

gateway.start().catch((err) => {
  console.error('[Deskhand Agent Host] Fatal startup error:', err);
  process.exit(1);
});

let stopping = false;
const stop = async (signal: NodeJS.Signals) => {
  if (stopping) return;
  stopping = true;
  console.log(`[Deskhand Agent Host] ${signal} received; closing browser and connections.`);
  await gateway.shutdown();
  process.exit(0);
};

process.on('SIGINT', () => { void stop('SIGINT'); });
process.on('SIGTERM', () => { void stop('SIGTERM'); });

