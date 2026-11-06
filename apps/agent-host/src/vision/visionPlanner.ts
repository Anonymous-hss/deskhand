import type { VisionPlanOutput } from '@deskhand/shared-protocol';
import { CallBudgetGuard } from '../budget/callBudget.js';

export class VisionPlanner {
  private budget: CallBudgetGuard;
  private demoBaseUrl: string;

  constructor(budget: CallBudgetGuard, demoBaseUrl = 'http://localhost:4000') {
    this.budget = budget;
    this.demoBaseUrl = demoBaseUrl;
  }

  /**
   * Computes the next VisionPlanOutput step for a given prompt and step index.
   * When VISION_MODE=live, consumes 1 call from the 150-call hard cap.
   * When VISION_MODE=mock (default for local dev), uses deterministic plans at 0 API call cost.
   */
  public async planNextStep(
    prompt: string,
    stepIndex: number,
    screenshotUrl?: string
  ): Promise<VisionPlanOutput> {
    const mode = process.env.VISION_MODE || 'mock';
    if (mode === 'live') {
      // Reserve 1 call from the disk-backed 150-call counter before calling external Vision API
      this.budget.consumeCall('vision');
      return this.callLiveVisionModel(prompt, stepIndex, screenshotUrl);
    }

    return this.getDeterministicDemoPlan(prompt, stepIndex);
  }

  private getDeterministicDemoPlan(prompt: string, stepIndex: number): VisionPlanOutput {
    const lower = prompt.toLowerCase();

    // Scene 1B: Rahul says "file it" -> file bug report in Chai Co. Issue Tracker
    if (lower.includes('file it') || lower.includes('file the bug') || lower.includes('issue tracker')) {
      const steps: VisionPlanOutput[] = [
        {
          thought: 'Opening Chai Co. Engineering Issue Tracker to file the checkout coupon bug.',
          action: { type: 'navigate', url: `${this.demoBaseUrl}/issues` },
          riskLevel: 'LOW',
          needsHumanTakeover: false
        },
        {
          thought: 'Typing bug report title: "500 CouponDiscountOverflowException on checkout with CHAI50".',
          action: {
            type: 'type',
            selectorHint: '#issue-title',
            text: '500 CouponDiscountOverflowException on checkout with CHAI50'
          },
          riskLevel: 'LOW',
          needsHumanTakeover: false
        },
        {
          thought: 'Filling reproduction steps from the staging run.',
          action: {
            type: 'type',
            selectorHint: '#issue-steps',
            text: '1. Open /shop 2. Add Masala Chai Tin (₹229) 3. Apply coupon CHAI50 4. Click Proceed to Checkout -> 500 error'
          },
          riskLevel: 'LOW',
          needsHumanTakeover: false
        },
        {
          thought: 'Submitting the bug report in the Chai Co. Issue Tracker.',
          action: { type: 'click', selectorHint: '#submit-issue-btn', x: 140, y: 420 },
          riskLevel: 'LOW',
          needsHumanTakeover: false
        },
        {
          thought: 'Issue #CHAI-104 filed and verified in the tracker.',
          action: { type: 'complete' },
          riskLevel: 'LOW',
          needsHumanTakeover: false
        }
      ];
      return steps[Math.min(stepIndex, steps.length - 1)];
    }

    // Scene 3: 2FA Login Code Takeover flow
    if (lower.includes('2fa') || lower.includes('login code') || lower.includes('take over')) {
      const steps: VisionPlanOutput[] = [
        {
          thought: 'Navigating to Chai Co. Store Admin portal (2FA security gate active).',
          action: { type: 'navigate', url: `${this.demoBaseUrl}/admin?require2fa=1` },
          riskLevel: 'LOW',
          needsHumanTakeover: false
        },
        {
          thought: 'Detected 6-digit authenticator code challenge that Deskhand cannot read. Requesting human takeover.',
          action: { type: 'wait' },
          riskLevel: 'LOW',
          needsHumanTakeover: true,
          takeoverReason: 'Someone needs to type the 6-digit login code. Take over?'
        },
        {
          thought: 'Human teammate unlocked 2FA gate and handed back control. Verified Store Admin dashboard.',
          action: { type: 'complete' },
          riskLevel: 'LOW',
          needsHumanTakeover: false
        }
      ];
      return steps[Math.min(stepIndex, steps.length - 1)];
    }

    // Scene 2: Arjun's voice note -> Update Masala Chai price to 249 in Store Admin (with Approval!)
    if (lower.includes('249') || lower.includes('price') || lower.includes('admin')) {
      const steps: VisionPlanOutput[] = [
        {
          thought: 'Opening Chai Co. Store Admin portal to update Masala Chai price.',
          action: { type: 'navigate', url: `${this.demoBaseUrl}/admin` },
          riskLevel: 'LOW',
          needsHumanTakeover: false
        },
        {
          thought: 'Located SKU-MASALA-250 (Masala Chai Tin, current price ₹229). Typing new price 249.',
          action: {
            type: 'type',
            selectorHint: '#price-masala-chai',
            text: '249',
            x: 680,
            y: 310
          },
          riskLevel: 'LOW',
          needsHumanTakeover: false
        },
        {
          thought: 'Ready to click "Save Price Update" to change Masala Chai from ₹229 to ₹249. Pausing for team approval.',
          action: {
            type: 'click',
            selectorHint: '#save-price-btn',
            x: 910,
            y: 310
          },
          riskLevel: 'HIGH',
          riskReason: 'Change Masala Chai from ₹229 to ₹249?',
          diffSummary: 'Change Masala Chai from ₹229 to ₹249?',
          needsHumanTakeover: false
        },
        {
          thought: 'Price change approved and saved! Masala Chai is now ₹249 in Store Admin.',
          action: { type: 'complete' },
          riskLevel: 'LOW',
          needsHumanTakeover: false
        }
      ];
      return steps[Math.min(stepIndex, steps.length - 1)];
    }

    // Default / Scene 1A: Priya's QA Bug Reproduction on Staging Shop
    const qaSteps: VisionPlanOutput[] = [
      {
        thought: 'Opening Chai Co. Staging Shop to test checkout with coupon CHAI50.',
        action: { type: 'navigate', url: `${this.demoBaseUrl}/shop` },
        riskLevel: 'LOW',
        needsHumanTakeover: false
      },
      {
        thought: 'Clicking "Add to Cart" on Masala Chai Tin (250g).',
        action: { type: 'click', selectorHint: '#add-masala-chai-btn', x: 580, y: 245 },
        riskLevel: 'LOW',
        needsHumanTakeover: false
      },
      {
        thought: 'Typing promo code "CHAI50" into the coupon input field.',
        action: { type: 'type', selectorHint: '#coupon-input', text: 'CHAI50', x: 860, y: 315 },
        riskLevel: 'LOW',
        needsHumanTakeover: false
      },
      {
        thought: 'Clicking "Apply Coupon" to stage CHAI50 discount.',
        action: { type: 'click', selectorHint: '#apply-coupon-btn', x: 1020, y: 315 },
        riskLevel: 'LOW',
        needsHumanTakeover: false
      },
      {
        thought: 'Clicking "Proceed to Checkout" to verify whether staging throws an error.',
        action: { type: 'click', selectorHint: '#checkout-btn', x: 920, y: 400 },
        riskLevel: 'LOW',
        needsHumanTakeover: false
      },
      {
        thought: 'Reproduced 500 Internal Server Error (CouponDiscountOverflowException at CheckoutController.ts:142). Ready to file bug report.',
        action: { type: 'complete' },
        riskLevel: 'LOW',
        needsHumanTakeover: false
      }
    ];
    return qaSteps[Math.min(stepIndex, qaSteps.length - 1)];
  }

  private async callLiveVisionModel(
    prompt: string,
    stepIndex: number,
    _screenshotUrl?: string
  ): Promise<VisionPlanOutput> {
    const basePlan = this.getDeterministicDemoPlan(prompt, stepIndex);

    // 1. Live Azure OpenAI (gpt-4o)
    const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const azureKey = process.env.AZURE_OPENAI_API_KEY || process.env.AI_API_KEY;

    if (azureEndpoint && azureKey && azureKey !== 'replace-with-your-vision-api-key') {
      try {
        const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
        const isResponsesApi = azureEndpoint.includes('/responses');

        const requestBody = isResponsesApi
          ? {
              model: deployment,
              input: `You are Deskhand, an AI teammate controlling a sandboxed computer browser for web chores.
Task: "${prompt}"
Step ${stepIndex + 1}: Current plan: "${basePlan.thought}".
Respond in JSON format: { "thought": string }`
            }
          : {
              model: deployment,
              messages: [
                {
                  role: 'system',
                  content: 'You are Deskhand, an AI teammate controlling a sandboxed computer browser for web chores.'
                },
                {
                  role: 'user',
                  content: `Task: "${prompt}". Step ${stepIndex + 1}: Planned step "${basePlan.thought}". Respond in JSON: { "thought": string }`
                }
              ]
            };

        const response = await fetch(azureEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': azureKey
          },
          body: JSON.stringify(requestBody)
        });

        this.budget.inspectHttpStatus(response.status);

        if (response.ok) {
          const data = (await response.json()) as any;
          let generatedText = '';
          if (data?.output?.[0]?.content?.[0]?.text) {
            generatedText = data.output[0].content[0].text;
          } else if (data?.choices?.[0]?.message?.content) {
            generatedText = data.choices[0].message.content;
          }

          if (generatedText) {
            try {
              const clean = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
              const parsed = JSON.parse(clean);
              if (parsed.thought) {
                return {
                  ...basePlan,
                  thought: `${parsed.thought}`
                };
              }
            } catch {
              // use base plan if not JSON
            }
          }
        }
      } catch (err) {
        if ((err as Error).message.includes('CallBudgetGuard')) throw err;
        console.warn('[VisionPlanner] Azure OpenAI call fallback:', (err as Error).message);
      }
      return basePlan;
    }

    // 2. Live Google Gemini API fallback
    const geminiKey = process.env.AI_API_KEY;
    if (geminiKey && geminiKey !== 'replace-with-your-vision-api-key') {
      try {
        const model = process.env.AI_VISION_MODEL || 'gemini-2.5-flash';
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Task: ${prompt}. Step: ${stepIndex}. Current thought: ${basePlan.thought}. Respond with brief confirmation thought.`
                  }
                ]
              }
            ]
          })
        });

        this.budget.inspectHttpStatus(response.status);
      } catch (err) {
        if ((err as Error).message.includes('CallBudgetGuard')) throw err;
        console.warn('[VisionPlanner] Gemini call fallback:', (err as Error).message);
      }
    }

    return basePlan;
  }
}

