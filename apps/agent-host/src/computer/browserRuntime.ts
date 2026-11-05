import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { RemoteTakeoverInput, VisionAction } from '@deskhand/shared-protocol';
import { SafetyEngine } from '../safety/safetyEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAPTURES_DIR = path.resolve(__dirname, '../../captures');

export class BrowserRuntime {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private safety: SafetyEngine;
  public readonly viewport = { width: 1280, height: 800 };

  constructor(safety: SafetyEngine) {
    this.safety = safety;
    fs.mkdirSync(CAPTURES_DIR, { recursive: true });
  }

  public async ensurePage(): Promise<Page | null> {
    if (this.page) return this.page;
    try {
      this.browser = await chromium.launch({
        headless: process.env.HEADLESS !== 'false'
      });
      this.context = await this.browser.newContext({
        viewport: this.viewport,
        acceptDownloads: false
      });
      this.page = await this.context.newPage();
      return this.page;
    } catch (err) {
      console.warn('[BrowserRuntime] Playwright Chromium not launched yet (run `npx playwright install chromium` for real browser). Using synthetic screen fallback.', (err as Error).message);
      return null;
    }
  }

  public getCurrentUrl(): string {
    return this.page?.url() || 'http://localhost:4000/shop';
  }

  public async executeAction(action: VisionAction): Promise<void> {
    if (action.type === 'navigate' && action.url) {
      if (!this.safety.isUrlAllowed(action.url)) {
        throw new Error(`Blocked navigation to non-allowlisted site: ${action.url}`);
      }
    }

    const page = await this.ensurePage();
    if (!page) return;

    switch (action.type) {
      case 'navigate':
        if (action.url) {
          await page.goto(action.url, { waitUntil: 'domcontentloaded' });
        }
        break;
      case 'click':
        if (action.selectorHint) {
          await this.highlightSelector(page, action.selectorHint);
          await page.click(action.selectorHint, { timeout: 4000 });
        } else if (typeof action.x === 'number' && typeof action.y === 'number') {
          await this.drawClickRipple(page, action.x, action.y);
          await page.mouse.click(action.x, action.y);
        }
        break;
      case 'type':
        if (action.selectorHint && typeof action.text === 'string') {
          await this.highlightSelector(page, action.selectorHint);
          await page.fill(action.selectorHint, action.text);
        } else if (typeof action.text === 'string') {
          await page.keyboard.type(action.text);
        }
        break;
      case 'press':
        if (action.key) {
          await page.keyboard.press(action.key);
        }
        break;
      case 'wait':
        await page.waitForTimeout(500);
        break;
      case 'complete':
        break;
    }
  }

  /**
   * Injects remote touch/keyboard input from the iOS Touch Takeover Canvas or Web Takeover link.
   */
  public async injectTakeoverInput(input: RemoteTakeoverInput): Promise<void> {
    const page = await this.ensurePage();
    if (!page) return;

    if (input.type === 'tap' && typeof input.x === 'number' && typeof input.y === 'number') {
      await this.drawClickRipple(page, input.x, input.y);
      await page.mouse.click(input.x, input.y);
    } else if (input.type === 'type' && input.text) {
      await page.keyboard.type(input.text);
    } else if (input.type === 'otp_submit' && input.text) {
      const otpInput = await page.$('#otp-input');
      if (otpInput) {
        await page.fill('#otp-input', input.text);
        await page.click('#verify-otp-btn');
      } else {
        await page.keyboard.type(input.text);
      }
    }
  }

  public async captureStepScreenshot(
    taskId: string,
    stepNumber: number,
    caption: string
  ): Promise<string> {
    const fileName = `${taskId}-step-${stepNumber}.png`;
    const filePath = path.join(CAPTURES_DIR, fileName);
    const page = await this.ensurePage();

    if (page) {
      await page.screenshot({ path: filePath, fullPage: false });
      return `/captures/${fileName}`;
    }

    // Fallback SVG if Chromium binary is not yet downloaded
    const svgName = `${taskId}-step-${stepNumber}.svg`;
    const svgPath = path.join(CAPTURES_DIR, svgName);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
      <rect width="1280" height="800" fill="#0f172a"/>
      <rect x="40" y="40" width="1200" height="720" rx="16" fill="#1e293b" stroke="#334155" stroke-width="2"/>
      <text x="80" y="110" fill="#f59e0b" font-family="sans-serif" font-size="28" font-weight="bold">Deskhand Sandboxed Viewport (Step ${stepNumber})</text>
      <text x="80" y="170" fill="#f8fafc" font-family="sans-serif" font-size="22">${caption.replace(/[<>&]/g, '')}</text>
      <circle cx="640" cy="420" r="26" fill="rgba(239,68,68,0.35)" stroke="#ef4444" stroke-width="4"/>
    </svg>`;
    fs.writeFileSync(svgPath, svg, 'utf-8');
    return `/captures/${svgName}`;
  }

  private async highlightSelector(page: Page, selector: string): Promise<void> {
    try {
      await page.$eval(selector, (el) => {
        (el as HTMLElement).style.outline = '4px solid #ef4444';
        (el as HTMLElement).style.outlineOffset = '3px';
      });
    } catch {
      // ignore if selector not found
    }
  }

  private async drawClickRipple(page: Page, x: number, y: number): Promise<void> {
    try {
      await page.evaluate(
        ({ cx, cy }) => {
          const dot = document.createElement('div');
          dot.style.position = 'fixed';
          dot.style.left = `${cx - 16}px`;
          dot.style.top = `${cy - 16}px`;
          dot.style.width = '32px';
          dot.style.height = '32px';
          dot.style.borderRadius = '50%';
          dot.style.border = '4px solid #ef4444';
          dot.style.background = 'rgba(239, 68, 68, 0.28)';
          dot.style.zIndex = '999999';
          dot.style.pointerEvents = 'none';
          document.body.appendChild(dot);
          setTimeout(() => dot.remove(), 1200);
        },
        { cx: x, cy: y }
      );
    } catch {
      // ignore
    }
  }

  public async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}

