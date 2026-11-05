import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CallBudgetStatus } from '@deskhand/shared-protocol';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUDGET_FILE = path.resolve(__dirname, '../../../../data/call-budget.json');

export class CallBudgetGuard {
  private filePath: string;

  constructor(customPath?: string) {
    this.filePath = customPath || BUDGET_FILE;
  }

  public getStatus(): CallBudgetStatus {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw) as CallBudgetStatus;
    } catch {
      const initial: CallBudgetStatus = {
        maxCalls: Number(process.env.HARD_CALL_CAP || 150),
        usedCalls: 0,
        breakdown: { vision: 0, stt: 0 },
        halted: false,
        haltReason: null,
        lastUpdatedAt: new Date().toISOString()
      };
      this.saveStatus(initial);
      return initial;
    }
  }

  private saveStatus(status: CallBudgetStatus): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(status, null, 2), 'utf-8');
    fs.renameSync(tmpPath, this.filePath);
  }

  /**
   * Reserves 1 call from the hard cap before an external model call is made.
   * Throws an error if the budget is exhausted or halted.
   */
  public consumeCall(kind: 'vision' | 'stt'): CallBudgetStatus {
    const status = this.getStatus();
    if (status.halted) {
      throw new Error(`[CallBudgetGuard] Service HALTED: ${status.haltReason}`);
    }
    if (status.usedCalls >= status.maxCalls) {
      status.halted = true;
      status.haltReason = `Hard call cap reached (${status.usedCalls}/${status.maxCalls})`;
      status.lastUpdatedAt = new Date().toISOString();
      this.saveStatus(status);
      throw new Error(`[CallBudgetGuard] ${status.haltReason}`);
    }

    status.usedCalls += 1;
    status.breakdown[kind] += 1;
    status.lastUpdatedAt = new Date().toISOString();
    if (status.usedCalls >= status.maxCalls) {
      status.halted = true;
      status.haltReason = `Reached agreed hard call cap (${status.maxCalls})`;
    }
    this.saveStatus(status);
    return status;
  }

  /**
   * Immediately halts the service if an API call returns HTTP 401, 403, or 429.
   */
  public inspectHttpStatus(httpStatus: number): void {
    if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) {
      const status = this.getStatus();
      status.halted = true;
      status.haltReason = `Halted automatically on provider HTTP ${httpStatus}`;
      status.lastUpdatedAt = new Date().toISOString();
      this.saveStatus(status);
      throw new Error(`[CallBudgetGuard] Circuit breaker tripped on HTTP ${httpStatus}`);
    }
  }
}

