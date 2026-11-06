/**
 * @deskhand/shared-protocol
 * Shared contract across Windows Agent Host, Windows Desktop Studio, Switch Connector, and iOS Companion App.
 */

export type TeamRole = 'qa-lead' | 'ops-lead' | 'ops-member' | 'admin' | 'viewer';

export interface TeamPersona {
  id: string;
  name: string;
  handle: string;
  role: TeamRole;
  canApproveRiskySteps: boolean;
  avatarEmoji: string;
}

export const DEMO_PERSONAS: Record<string, TeamPersona> = {
  priya: {
    id: 'priya',
    name: 'Priya',
    handle: '@priya',
    role: 'qa-lead',
    canApproveRiskySteps: true,
    avatarEmoji: '👩‍💻'
  },
  arjun: {
    id: 'arjun',
    name: 'Arjun',
    handle: '@arjun',
    role: 'ops-member',
    canApproveRiskySteps: false,
    avatarEmoji: '📱'
  },
  rahul: {
    id: 'rahul',
    name: 'Rahul',
    handle: '@rahul',
    role: 'admin',
    canApproveRiskySteps: true,
    avatarEmoji: '🛡️'
  }
};

export type RiskLevel = 'LOW' | 'HIGH';

export type TaskStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'AWAITING_APPROVAL'
  | 'HUMAN_TAKEOVER'
  | 'COMPLETED'
  | 'REJECTED'
  | 'FAILED'
  | 'HALTED_BY_BUDGET';

export type TaskSource = 'switch_chat' | 'ios_voice' | 'ios_text' | 'windows_studio';

export interface VisionAction {
  type: 'navigate' | 'click' | 'type' | 'press' | 'wait' | 'complete' | 'scroll';
  url?: string;
  x?: number;
  y?: number;
  selectorHint?: string;
  text?: string;
  key?: string;
}

export interface VisionPlanOutput {
  thought: string;
  result?: string;
  action: VisionAction;
  riskLevel: RiskLevel;
  riskReason?: string;
  diffSummary?: string;
  needsHumanTakeover: boolean;
  takeoverReason?: string;
}

export interface TaskStep {
  stepNumber: number;
  timestamp: string;
  thought: string;
  action: VisionAction;
  screenshotUrl: string;
  riskLevel: RiskLevel;
  pageUrl: string;
}

export interface ApprovalRequest {
  approvalId: string;
  taskId: string;
  stepNumber: number;
  promptQuestion: string;
  diffSummary: string;
  targetUrl: string;
  screenshotUrl: string;
  allowedRoles: TeamRole[];
  createdAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  expiresAt?: string;
  actionDigest?: string;
  observedDiff?: { before: string; after: string; field: string };
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface TakeoverSession {
  taskId: string;
  reason: string;
  pageUrl: string;
  viewport: { width: number; height: number };
  takeoverUrl: string;
  takeoverWsPath: string;
  active: boolean;
  startedAt: string;
}

export interface BugReportDraft {
  issueId?: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  stepsToReproduce: string[];
  errorBanner: string;
  screenshotUrl: string;
  filedUrl?: string;
}

export interface ObservedError {
  stepNumber: number;
  timestamp: string;
  pageUrl: string;
  screenshotUrl: string;
  errorText: string;
}
export interface OutcomeVerification {
  kind: 'issue_created' | 'price_saved' | 'price_unchanged';
  verifiedAt: string;
  pageUrl: string;
  observedValue: string;
  expectedValue?: string;
}
export interface DeskhandTask {
  taskId: string;
  roomId: string;
  threadId?: string;
  requestId?: string;
  parentTaskId?: string;
  intent?: 'file_issue';
  observedErrors?: ObservedError[];
  verification?: OutcomeVerification;
  evidenceUrl?: string;
  prompt: string;
  senderName: string;
  senderRole: TeamRole;
  source: TaskSource;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  steps: TaskStep[];
  pendingApproval?: ApprovalRequest;
  takeover?: TakeoverSession;
  bugReport?: BugReportDraft;
  summary?: string;
  replayGifUrl?: string;
  voiceNoteUrl?: string;
  callsUsed: number;
}

export interface CallBudgetStatus {
  maxCalls: number;
  usedCalls: number;
  breakdown: {
    vision: number;
    stt: number;
  };
  halted: boolean;
  haltReason: string | null;
  lastUpdatedAt: string;
}

export interface HostStatusPayload {
  coordination?: {
    mode: 'console_managed' | 'direct_legacy';
    hostLinkRequired: boolean;
    lastAgentContactAt: string | null;
    description: string;
  };
  switchConnected: boolean;
  switchMode: 'stream' | 'rest_fallback';
  lastHeartbeatAt: string | null;
  viewport: { width: number; height: number };
  budget: CallBudgetStatus;
  allowlist: string[];
  activeTask: DeskhandTask | null;
  recentTasks: DeskhandTask[];
}

export type GatewayWsMessage =
  | { event: 'host:status'; data: HostStatusPayload }
  | { event: 'task:started'; data: DeskhandTask }
  | { event: 'task:step'; data: { taskId: string; step: TaskStep; task: DeskhandTask } }
  | { event: 'task:approval_required'; data: { taskId: string; approval: ApprovalRequest; task: DeskhandTask } }
  | { event: 'task:approval_resolved'; data: { taskId: string; approval: ApprovalRequest; task: DeskhandTask } }
  | { event: 'task:takeover_requested'; data: { taskId: string; takeover: TakeoverSession; task: DeskhandTask } }
  | { event: 'task:takeover_released'; data: { taskId: string; task: DeskhandTask } }
  | { event: 'task:completed'; data: DeskhandTask }
  | { event: 'takeover:frame'; data: { taskId: string; jpegBase64: string; width: number; height: number } };

export interface RemoteTakeoverInput {
  taskId: string;
  type: 'tap' | 'type' | 'otp_submit' | 'hand_back';
  x?: number;
  y?: number;
  text?: string;
  actorName?: string;
}

