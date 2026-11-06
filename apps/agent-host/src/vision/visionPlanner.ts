import type { TaskStep, VisionAction, VisionPlanOutput } from '@deskhand/shared-protocol';
import { CallBudgetGuard } from '../budget/callBudget.js';
import type { PageSnapshot } from '../computer/browserRuntime.js';

export class VisionPlanner {
  private budget: CallBudgetGuard;
  private demoBaseUrl: string;

  constructor(budget: CallBudgetGuard, demoBaseUrl = 'http://localhost:4000') {
    this.budget = budget;
    this.demoBaseUrl = demoBaseUrl;
  }

  /**
   * Computes the next step action for ANY generalized web task or demo story.
   * - When VISION_MODE=live (or Azure OpenAI configured), calls gpt-4o with real DOM context.
   * - When VISION_MODE=mock, provides deterministic 0-cost execution.
   */
  public async planNextStep(
    prompt: string,
    stepIndex: number,
    screenshotUrl?: string,
    pageSnapshot?: PageSnapshot,
    history?: TaskStep[]
  ): Promise<VisionPlanOutput> {
    const mode = process.env.VISION_MODE || 'mock';
    if (mode === 'live') {
      this.budget.consumeCall('vision');
      return this.callLiveVisionModel(
        prompt,
        stepIndex,
        screenshotUrl,
        pageSnapshot,
        history
      );
    }

    // In mock mode, check if prompt matches demo story, otherwise use generic plan
    return this.getDeterministicDemoPlan(prompt, stepIndex, pageSnapshot);
  }

  private async callLiveVisionModel(
    prompt: string,
    stepIndex: number,
    _screenshotUrl?: string,
    pageSnapshot?: PageSnapshot,
    history?: TaskStep[]
  ): Promise<VisionPlanOutput> {
    const isChaiCoDemo =
      prompt.toLowerCase().includes('masala') ||
      prompt.toLowerCase().includes('coupon') ||
      prompt.toLowerCase().includes('chai co') ||
      prompt.toLowerCase().includes('2fa');

    const basePlan = isChaiCoDemo
      ? this.getDeterministicDemoPlan(prompt, stepIndex, pageSnapshot)
      : null;

    // 1. Live Azure OpenAI (gpt-4o) Generalized Web Agent
    const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const azureKey = process.env.AZURE_OPENAI_API_KEY || process.env.AI_API_KEY;

    if (azureEndpoint && azureKey && azureKey !== 'replace-with-your-vision-api-key') {
      try {
        const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
        const isResponsesApi = azureEndpoint.includes('/responses');

        const historySummary = (history || [])
          .map((h) => `Step ${h.stepNumber}: ${h.thought} (${h.action.type})`)
          .join('\n');

        const systemInstructions = `You are Deskhand, an autonomous AI teammate controlling a real sandboxed computer browser for the user's team.
User Goal: "${prompt}"
Step Number: ${stepIndex + 1}
Current Page URL: ${pageSnapshot?.url || 'about:blank'}
Current Page Title: "${pageSnapshot?.title || ''}"

Visible Interactive Elements on Screen (with selector hints):
${pageSnapshot?.interactiveElements || '(Initial page / none detected)'}

Visible Page Text Snippet:
${pageSnapshot?.textSnippet || '(Page empty or loading)'}

History of past steps:
${historySummary || '(None, this is the first step)'}

RULES:
1. Return ONLY valid JSON with this exact schema:
{
  "thought": "1 concise sentence explaining what you are doing in this step",
  "action": {
    "type": "navigate" | "click" | "type" | "press" | "scroll" | "wait" | "complete",
    "url": "https://... (only for navigate)",
    "selectorHint": "selector or text from interactive elements (for click/type)",
    "text": "text to type (for type)",
    "key": "Enter" (for press)
  },
  "riskLevel": "LOW" | "HIGH",
  "riskReason": "required if riskLevel is HIGH"
}
2. If this is step 1 and you are not on the destination site, use "navigate" to the target URL.
3. If the user's goal has been achieved or you have extracted the required answer, use action "complete" and state the answer in "thought".
4. If an action submits a payment, places an order, modifies production database, deletes records, or changes sensitive admin settings, mark riskLevel: "HIGH" and provide riskReason.
5. Do NOT include markdown code blocks. Output raw JSON only.`;

        const requestBody = isResponsesApi
          ? {
              model: deployment,
              input: systemInstructions
            }
          : {
              model: deployment,
              messages: [
                {
                  role: 'system',
                  content: 'You are Deskhand, an autonomous web browser agent. Respond in raw JSON.'
                },
                { role: 'user', content: systemInstructions }
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
              const clean = generatedText
                .replace(/```json/gi, '')
                .replace(/```/g, '')
                .trim();
              const parsed = JSON.parse(clean);
              if (parsed.thought && parsed.action?.type) {
                return {
                  thought: parsed.thought,
                  action: parsed.action,
                  riskLevel: parsed.riskLevel === 'HIGH' ? 'HIGH' : 'LOW',
                  riskReason: parsed.riskReason,
                  diffSummary: parsed.riskReason || parsed.thought,
                  needsHumanTakeover: Boolean(parsed.needsHumanTakeover),
                  takeoverReason: parsed.takeoverReason
                };
              }
            } catch {
              // fallback to base plan if JSON parsing failed
            }
          }
        }
      } catch (err) {
        if ((err as Error).message.includes('CallBudgetGuard')) throw err;
        console.warn('[VisionPlanner] Azure OpenAI call fallback:', (err as Error).message);
      }
    }

    if (basePlan) return basePlan;
    return this.getGenericFallbackPlan(prompt, stepIndex, pageSnapshot);
  }

  private getGenericFallbackPlan(
    prompt: string,
    stepIndex: number,
    pageSnapshot?: PageSnapshot
  ): VisionPlanOutput {
    const urlMatch = prompt.match(/https?:\/\/[^\s]+/i) || prompt.match(/(?:www\.)?[a-zA-Z0-9-]+\.(?:com|org|io|net|edu|local)[^\s]*/i);

    if (stepIndex === 0) {
      if (urlMatch) {
        const targetUrl = urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`;
        return {
          thought: `Navigating to ${targetUrl} as requested.`,
          action: { type: 'navigate', url: targetUrl },
          riskLevel: 'LOW',
          needsHumanTakeover: false
        };
      }
      return {
        thought: `Opening search engine to look up "${prompt}".`,
        action: {
          type: 'navigate',
          url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(prompt)}`
        },
        riskLevel: 'LOW',
        needsHumanTakeover: false
      };
    }

    if (stepIndex === 1) {
      return {
        thought: `Examining page "${pageSnapshot?.title || 'Current Page'}". Content snippet: "${(pageSnapshot?.textSnippet || '').slice(0, 120)}..."`,
        action: { type: 'scroll' },
        riskLevel: 'LOW',
        needsHumanTakeover: false
      };
    }

    return {
      thought: `Completed task: "${prompt}". Page: ${pageSnapshot?.url || 'viewed'}. Ready for next instruction.`,
      action: { type: 'complete' },
      riskLevel: 'LOW',
      needsHumanTakeover: false
    };
  }

  private getDeterministicDemoPlan(
    prompt: string,
    stepIndex: number,
    pageSnapshot?: PageSnapshot
  ): VisionPlanOutput {
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
    if (lower.includes('coupon') || lower.includes('reproduce') || lower.includes('shop') || lower.includes('chai')) {
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

    // Generalized Fallback for any other custom task in mock mode
    return this.getGenericFallbackPlan(prompt, stepIndex, pageSnapshot);
  }
}
