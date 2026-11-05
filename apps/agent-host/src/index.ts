import { DeskhandGatewayServer } from './gateway/server.js';

const PORT = Number(process.env.PORT || 4100);
const gateway = new DeskhandGatewayServer(PORT);

gateway.start().catch((err) => {
  console.error('[Deskhand Agent Host] Fatal startup error:', err);
  process.exit(1);
});

