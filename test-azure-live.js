import { CallBudgetGuard } from './apps/agent-host/dist/budget/callBudget.js';
import { VisionPlanner } from './apps/agent-host/dist/vision/visionPlanner.js';

async function testAzureOpenAILive() {
  console.log('--- 🧪 Testing Azure OpenAI Live Vision Call ---');
  console.log(`Endpoint: ${process.env.AZURE_OPENAI_ENDPOINT}`);
  console.log(`Model:    ${process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o'}`);

  const budget = new CallBudgetGuard();
  const planner = new VisionPlanner(budget, 'http://localhost:4000');

  process.env.VISION_MODE = 'live';

  const plan = await planner.planNextStep(
    'update the masala chai price to 249 in the store admin and tell the team',
    0
  );

  console.log('\n✓ Live Plan Output from Azure OpenAI:');
  console.log(`  • Thought:    "${plan.thought}"`);
  console.log(`  • Action:     ${JSON.stringify(plan.action)}`);
  console.log(`  • Risk Level: ${plan.riskLevel}`);

  const status = budget.getStatus();
  console.log(`\n✓ Call Budget Guard Status: ${status.usedCalls}/${status.maxCalls} calls used (Breakdown: vision=${status.breakdown.vision})`);

  if (status.usedCalls !== 1) {
    throw new Error('Expected 1 call consumed from budget.');
  }

  console.log('\n🎉 AZURE OPENAI GPT-4O LIVE CALL VERIFIED SUCCESSFULLY!');
}

testAzureOpenAILive().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
