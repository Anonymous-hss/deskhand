import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import type { TeamRole, VisionPlanOutput } from '@deskhand/shared-protocol';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALLOWLIST_FILE = path.resolve(__dirname, '../../../../data/allowlist.json');

export interface AllowlistConfig {
  allowedHosts: string[];
  highRiskKeywords: string[];
  approverRoles: TeamRole[];
}

export class SafetyEngine {
  private config: AllowlistConfig;

  constructor(customPath?: string) {
    const file = customPath || ALLOWLIST_FILE;
    try {
      this.config = JSON.parse(fs.readFileSync(file, 'utf-8')) as AllowlistConfig;
    } catch {
      this.config = {
        allowedHosts: ['localhost:4000', '127.0.0.1:4000'],
        highRiskKeywords: ['submit', 'pay', 'delete', 'send', 'save price update'],
        approverRoles: ['admin', 'ops-lead', 'qa-lead']
      };
    }
  }

  public getAllowedHosts(): string[] {
    return this.config.allowedHosts;
  }

  public getApproverRoles(): TeamRole[] {
    return this.config.approverRoles;
  }

  public isUrlAllowed(targetUrl: string): boolean {
    try {
      const parsed = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return false;
      return process.env.ALLOW_ALL_DOMAINS === 'true' || this.config.allowedHosts.includes('*') || this.config.allowedHosts.includes(parsed.host);
    } catch {
      return false;
    }
  }

  /**
   * Dual-layer safety check:
   * 1. Deterministic selector/thought inspection for submit/pay/delete/send
   * 2. Vision LLM's own riskLevel classification
   */
  public requiresTeamApproval(plan: VisionPlanOutput, currentUrl?: string): {
    required: boolean;
    promptQuestion: string;
    diffSummary: string;
  } {
    // Only the known local demo tracker has a pre-authorized low-risk submission.
    let isDemoTracker = false;
    try {
      const current = new URL(currentUrl || '');
      const demo = new URL(process.env.DEMO_APPS_URL || 'http://localhost:4000');
      isDemoTracker = current.origin === demo.origin && current.pathname === '/issues';
    } catch { /* No implicit exemption for unknown pages. */ }
    if (plan.action.type === 'complete' || (isDemoTracker && plan.riskLevel === 'LOW' && plan.action.selectorHint === '#submit-issue-btn')) {
      return { required: false, promptQuestion: '', diffSummary: '' };
    }

    const combinedText = `${plan.thought} ${plan.action.selectorHint || ''} ${plan.riskReason || ''}`.toLowerCase();
    const matchedKeyword = this.config.highRiskKeywords.find((kw) =>
      combinedText.includes(kw.toLowerCase())
    );

    const isHighRisk =
      plan.riskLevel === 'HIGH' ||
      plan.action.selectorHint === '#save-price-btn' ||
      (['click', 'press'].includes(plan.action.type) && Boolean(matchedKeyword));

    if (!isHighRisk) {
      return { required: false, promptQuestion: '', diffSummary: '' };
    }

    const diffSummary = plan.diffSummary || plan.riskReason || 'High-impact form submission';
    const promptQuestion =
      plan.diffSummary ||
      plan.riskReason ||
      `Approve risky step (${matchedKeyword || 'submit'}) before Deskhand clicks?`;

    return {
      required: true,
      promptQuestion,
      diffSummary
    };
  }

  public canRoleApprove(role: TeamRole): boolean {
    return this.config.approverRoles.includes(role);
  }
}

