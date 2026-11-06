import fs from 'node:fs';
import { TaskRepository } from '../state/taskRepository.js';
import { reportFromEvidence, evidencePacket } from '../evidence/bugReport.js';
import { OperatorAuth } from '../auth/operatorAuth.js';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  ApprovalRequest,
  DeskhandTask,
  GatewayWsMessage,
  HostStatusPayload,
  RemoteTakeoverInput,
  TakeoverSession,
  TaskSource,
  TaskStep,
  TeamRole
} from '@deskhand/shared-protocol';
import { CallBudgetGuard } from '../budget/callBudget.js';
import { SafetyEngine } from '../safety/safetyEngine.js';
import { BrowserRuntime } from '../computer/browserRuntime.js';
import { VisionPlanner } from '../vision/visionPlanner.js';
import { ReplayGenerator } from '../media/gifGenerator.js';
import { SwitchConnector, type SwitchRoomMessageEvent } from '../switch/switchConnector.js';
import { VoiceTranscriber } from '../stt/voiceTranscriber.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAPTURES_DIR = path.resolve(__dirname, '../../captures');

export class DeskhandGatewayServer {
  private port: number;
  private budget: CallBudgetGuard;
  private safety: SafetyEngine;
  private browser: BrowserRuntime;
  private planner: VisionPlanner;
  private replay: ReplayGenerator;
  private switchClient: SwitchConnector;
  private stt: VoiceTranscriber;

  private activeTask: DeskhandTask | null = null;
  private recentTasks: DeskhandTask[] = [];
  private approvalResolvers = new Map<string, (decision: 'approve' | 'reject', actor: string) => void>();
  private takeoverResolvers = new Map<string, () => void>();
  private repository: TaskRepository;
  private auth: OperatorAuth;
  private lastAgentContactAt: string | null = null;
  private taskController: AbortController | null = null;
  private wsClients = new Set<WebSocket>();
  private lastTakeoverFrame: Extract<GatewayWsMessage, { event: 'takeover:frame' }> | null = null;

  private isCurrentTask(task: DeskhandTask): boolean {
    return this.activeTask === task && !['FAILED', 'REJECTED', 'HALTED_BY_BUDGET'].includes(task.status);
  }


  constructor(port = 4100, storageDirectory?: string) {
    this.repository = new TaskRepository(storageDirectory ? path.join(storageDirectory, 'tasks') : undefined);
    this.auth = new OperatorAuth(storageDirectory);
    this.port = port;
    this.recentTasks = this.repository.recent();
    for (const task of this.recentTasks) {
      if (['RUNNING', 'QUEUED', 'AWAITING_APPROVAL', 'HUMAN_TAKEOVER'].includes(task.status)) {
        task.status = 'FAILED'; task.summary = 'Host restarted. The interrupted task was not resumed automatically.';
        if (task.pendingApproval?.status === 'PENDING') task.pendingApproval.status = 'REJECTED';
        this.repository.save(task);
      }
    }
    this.budget = new CallBudgetGuard();
    this.safety = new SafetyEngine();
    this.browser = new BrowserRuntime(this.safety);
    this.planner = new VisionPlanner(
      this.budget,
      process.env.DEMO_APPS_URL || 'http://localhost:4000'
    );
    this.replay = new ReplayGenerator();
    this.switchClient = new SwitchConnector();
    this.stt = new VoiceTranscriber(this.budget);

    this.switchClient.onAddressedMessage((evt) => {
      // Check if this incoming message is answering a pending Safety Switch approval
      if (this.activeTask?.status === 'AWAITING_APPROVAL' && this.activeTask.pendingApproval) {
        const command = evt.text.trim().replace(/^@deskhand\s+/i, '').trim();
        const match = /^(approve|reject|not now)(?::(task-[a-zA-Z0-9-]+))?[.!]?$/i.exec(command);
        if (match) {
          if (match[2] && match[2] !== this.activeTask.taskId) return;
          if (evt.roomId !== this.activeTask.roomId) return;
          this.resolveApproval(this.activeTask.taskId, match[1].toLowerCase() === 'approve' ? 'approve' : 'reject',
            evt.senderName, (evt.senderRole as TeamRole) || 'viewer');
          return;
        }
      }

      void this.startTask({
        prompt: evt.text,
        senderName: evt.senderName,
        senderRole: (evt.senderRole as TeamRole) || 'viewer',
        source: 'switch_chat',
        roomId: evt.roomId
      }).catch((error) => console.warn('[Switch task]', (error as Error).message));
    });
  }

  private async postRoomMessage(params: Parameters<SwitchConnector['postRoomMessage']>[0]): Promise<void> {
    if (process.env.SWITCH_TRANSPORT === 'direct_legacy') await this.switchClient.postRoomMessage(params);
  }

  public getStatusPayload(): HostStatusPayload {
    return {
      coordination: {
        mode: process.env.SWITCH_TRANSPORT === 'direct_legacy' ? 'direct_legacy' : 'console_managed',
        hostLinkRequired: process.env.SWITCH_TRANSPORT === 'direct_legacy',
        lastAgentContactAt: this.lastAgentContactAt,
        description: process.env.SWITCH_TRANSPORT === 'direct_legacy' ? 'Legacy connector; not verified with current Switch.' : 'Slack → Switch Console-managed agent → authenticated browser host. Host does not claim a direct Switch session.'
      },
      switchConnected: this.switchClient.isConnected(),
      switchMode: this.switchClient.getMode(),
      lastHeartbeatAt: this.switchClient.getLastHeartbeatAt(),
      viewport: this.browser.viewport,
      budget: this.budget.getStatus(),
      allowlist: this.safety.getAllowedHosts(),
      activeTask: this.activeTask,
      recentTasks: this.recentTasks.slice(0, 10)
    };
  }

  private broadcast(msg: GatewayWsMessage): void {
    if (msg.event.startsWith('task:')) {
      const data = msg.data as DeskhandTask | { task: DeskhandTask };
      const task = 'task' in data ? data.task : data as DeskhandTask;
      task.updatedAt = new Date().toISOString(); this.repository.save(task);
    }
    const payload = JSON.stringify(msg);
    for (const client of this.wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        if (msg.event !== 'takeover:frame' || client.bufferedAmount < 1024 * 1024) client.send(payload);
      }
    }
  }

  public async startTask(params: {
    prompt: string;
    senderName: string;
    senderRole: TeamRole;
    source: TaskSource;
    roomId?: string;
    audioBase64?: string;
    threadId?: string;
    requestId?: string;
    parentTaskId?: string;
  }): Promise<DeskhandTask> {
    if (params.requestId) {
      const existing = this.repository.recent().find(task => task.requestId === params.requestId && task.roomId === params.roomId);
      if (existing) return existing;
    }
    if (this.activeTask && ['RUNNING', 'QUEUED', 'AWAITING_APPROVAL', 'HUMAN_TAKEOVER'].includes(this.activeTask.status)) {
      throw new Error('A task is already running. Finish or stop it before starting another.');
    }
    const filing = /^file(?: it| the bug| the report)?(?: in (?:the )?issue tracker)?[.!]?$/i.test(params.prompt.trim());
    const parent = params.parentTaskId ? this.repository.get(params.parentTaskId) : filing ? this.repository.resolveParent(params.roomId || 'ops', params.threadId) : undefined;
    if (filing && (!parent?.bugReport || parent.roomId !== (params.roomId || 'ops') || parent.threadId !== params.threadId)) {
      throw new Error('No observed bug report exists in this conversation. Reproduce the issue first or supply the matching source task.');
    }
    const taskId = `task-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const task: DeskhandTask = {
      taskId,
      roomId: params.roomId || process.env.SWITCH_ROOM_ID || 'ops',
      prompt: params.prompt,
      senderName: params.senderName,
      senderRole: params.senderRole,
      source: params.source,
      status: 'RUNNING',
      createdAt: now,
      updatedAt: now,
      steps: [],
      callsUsed: 0,
      threadId: params.threadId,
      requestId: params.requestId,
      parentTaskId: parent?.taskId,
      intent: filing ? 'file_issue' : undefined,
      bugReport: filing ? parent?.bugReport : undefined,
      observedErrors: [],
      evidenceUrl: `/api/tasks/${taskId}/evidence`
    };

    if (params.audioBase64) {
      const bytes = Buffer.from(params.audioBase64, 'base64');
      if (bytes.length > 5 * 1024 * 1024) throw new Error('Voice note exceeds the 5 MB limit');
      fs.mkdirSync(CAPTURES_DIR, { recursive: true });
      fs.writeFileSync(path.join(CAPTURES_DIR, `${taskId}-voice.m4a`), bytes);
      task.voiceNoteUrl = `/captures/${taskId}-voice.m4a`;
    }
    this.taskController = new AbortController();
    this.activeTask = task;
    this.recentTasks.unshift(task);
    this.broadcast({ event: 'task:started', data: task });

    await this.postRoomMessage({
      roomId: task.roomId,
      text: `🤖 *Deskhand* picked up task from *${task.senderName}*: "${task.prompt}"`,
      mediaUrl: task.voiceNoteUrl
    });

    void this.runTaskLoop(task);
    return task;
  }

  private async runTaskLoop(task: DeskhandTask): Promise<void> {
    try {
      const defaultMaxSteps = process.env.GENERALIZED_AGENT === 'true' ? 30 : 10;
      const configuredSteps = Number(process.env.MAX_TASK_STEPS || defaultMaxSteps);
      const maxSteps = Number.isInteger(configuredSteps) ? Math.min(Math.max(configuredSteps, 1), 30) : defaultMaxSteps;
      const callsAtStart = this.budget.getStatus().usedCalls;
      for (let stepIndex = 0; stepIndex < maxSteps; stepIndex++) {
        if (!this.isCurrentTask(task)) return;

        const pageSnapshot = await this.browser.getPageSnapshot();
        if (!this.isCurrentTask(task)) return;


        const plan = await this.planner.planNextStep(
          task.intent === 'file_issue' ? `${task.prompt}. File the observed report below in ${process.env.DEMO_APPS_URL || 'http://localhost:4000'}/issues. Use exactly this observed title and reproduction steps. Verify the created issue in the page before completing. Report: ${JSON.stringify(task.bugReport)}` : task.prompt,
          stepIndex,
          task.steps[task.steps.length - 1]?.screenshotUrl,
          pageSnapshot,
          task.steps,
          this.taskController?.signal,
          task.bugReport
        );


        if (!this.isCurrentTask(task)) return;
        task.callsUsed = this.budget.getStatus().usedCalls - callsAtStart;
        this.broadcast({ event: 'host:status', data: this.getStatusPayload() });

        // Check if Human Takeover is needed (e.g. 2FA Login Code screen)
        if (plan.needsHumanTakeover) {
          const takeover: TakeoverSession = {
            taskId: task.taskId,
            reason: plan.takeoverReason || 'Someone needs to type the login code. Take over?',
            pageUrl: this.browser.getCurrentUrl(),
            viewport: this.browser.viewport,
            takeoverUrl: `http://localhost:${this.port}/takeover/${task.taskId}`,
            takeoverWsPath: `/ws`,
            active: true,
            startedAt: new Date().toISOString()
          };
          task.status = 'HUMAN_TAKEOVER';
          task.takeover = takeover;
          task.updatedAt = new Date().toISOString();
          this.broadcast({
            event: 'task:takeover_requested',
            data: { taskId: task.taskId, takeover, task }
          });

          const released = new Promise<void>((resolve) => this.takeoverResolvers.set(task.taskId, resolve));
          await this.postRoomMessage({
            roomId: task.roomId,
            text: `🖐️ *Take Over Needed:* ${takeover.reason}\n👉 Tap to take over screen: ${takeover.takeoverUrl}`
          });

          if (!this.isCurrentTask(task)) return;
          await this.browser.startScreencast((jpegBase64) => {
            if (!this.isCurrentTask(task) || task.status !== 'HUMAN_TAKEOVER') return;
            this.lastTakeoverFrame = { event: 'takeover:frame', data: { taskId: task.taskId, jpegBase64, ...this.browser.viewport } };
            this.broadcast(this.lastTakeoverFrame);
          });
          await released;
          await this.browser.stopScreencast();
          this.lastTakeoverFrame = null;
          if (!this.isCurrentTask(task)) return;

          takeover.active = false;
          task.status = 'RUNNING';
          this.broadcast({
            event: 'task:takeover_released',
            data: { taskId: task.taskId, task }
          });
          continue;
        }

        // Check Safety Switch before executing risky actions (submit/pay/delete/send)
        const safetyCheck = this.safety.requiresTeamApproval(plan, this.browser.getCurrentUrl());
        if (safetyCheck.required) {
          const preScreenshotUrl = await this.browser.captureStepScreenshot(
            `${task.taskId}-approval`,
            stepIndex + 1,
            `PAUSED FOR APPROVAL: ${safetyCheck.promptQuestion}`
          );

          if (!this.isCurrentTask(task)) return;
          const context = await this.browser.approvalContext();
          const approval: ApprovalRequest = {
            approvalId: `appr-${crypto.randomUUID()}`,
            taskId: task.taskId,
            stepNumber: stepIndex + 1,
            promptQuestion: safetyCheck.promptQuestion,
            diffSummary: safetyCheck.diffSummary,
            targetUrl: this.browser.getCurrentUrl(),
            screenshotUrl: preScreenshotUrl,
            allowedRoles: this.safety.getApproverRoles(),
            createdAt: new Date().toISOString(),
            status: 'PENDING',
            expiresAt: new Date(Date.now() + 300000).toISOString(),
            actionDigest: context.digest,
            observedDiff: context.price
          };

          task.status = 'AWAITING_APPROVAL';
          task.pendingApproval = approval;
          task.updatedAt = new Date().toISOString();

          this.broadcast({
            event: 'task:approval_required',
            data: { taskId: task.taskId, approval, task }
          });

          const decisionPromise = new Promise<{ decision: 'approve' | 'reject'; actor: string }>((resolve) => {
            this.approvalResolvers.set(task.taskId, (decision, actor) => resolve({ decision, actor }));
          });
          await this.postRoomMessage({
            roomId: task.roomId,
            text: `🛑 *Safety Switch — Approval Required:* ${approval.promptQuestion}`,
            mediaUrl: preScreenshotUrl,
            buttons: [
              { label: 'Approve', action: `approve:${task.taskId}` },
              { label: 'Not now', action: `reject:${task.taskId}` }
            ]
          });

          const expiryTimer = setTimeout(() => this.resolveApproval(task.taskId, 'reject', 'Approval expired', 'admin'), Math.max(1, Date.parse(approval.expiresAt!) - Date.now()));
          let decision: { decision: 'approve' | 'reject'; actor: string };
          try { decision = await decisionPromise; } finally { clearTimeout(expiryTimer); }

          if (!this.isCurrentTask(task)) return;
          approval.status = decision.decision === 'approve' ? 'APPROVED' : 'REJECTED';
          approval.resolvedBy = decision.actor;
          approval.resolvedAt = new Date().toISOString();

          this.broadcast({
            event: 'task:approval_resolved',
            data: { taskId: task.taskId, approval, task }
          });

          if (decision.decision === 'reject') {
            task.status = 'REJECTED';
            task.summary = `Cancelled by ${decision.actor}. The pending action was not executed.`;
            if (approval.observedDiff) {
              const unchanged = await this.browser.verifyPrice(approval.observedDiff.before);
              if (unchanged) {
                task.verification = { kind: 'price_unchanged', verifiedAt: new Date().toISOString(), pageUrl: unchanged.url, expectedValue: approval.observedDiff.before, observedValue: unchanged.value };
                task.summary += ` Verified saved price remains ${unchanged.value}.`;
              }
            }
            this.broadcast({ event: 'task:completed', data: task });
            return;
          }

          const current = await this.browser.approvalContext();
          if (current.digest !== approval.actionDigest) throw new Error('The page or form changed after the approval preview. No save was performed; request a new approval.');
          task.status = 'RUNNING';
        }

        if (plan.action.type === 'complete') {
          task.status = 'COMPLETED';
          task.replayGifUrl = this.replay.generateReplayArtifact(task.taskId, task.steps);
          task.summary = plan.result || plan.thought;
          if (task.intent === 'file_issue') {
            const created = await this.browser.verifyIssue(task.bugReport!.title);
            if (!created) throw new Error('The issue tracker did not show a matching created issue. Filing is not verified.');
            task.bugReport = { ...task.bugReport!, issueId: created.issueId, filedUrl: created.url };
            task.verification = { kind: 'issue_created', verifiedAt: new Date().toISOString(), pageUrl: created.url, observedValue: created.issueId };
            task.summary = `Verified issue ${created.issueId}: ${created.url}`;
          } else task.bugReport = reportFromEvidence(task);
          const approvedPrice = task.pendingApproval?.status === 'APPROVED' ? task.pendingApproval.observedDiff : undefined;
          if (approvedPrice) {
            const verified = await this.browser.verifyPrice(approvedPrice.after);
            if (!verified) throw new Error('The saved price could not be verified on the page. Do not treat the update as complete.');
            task.verification = { kind: 'price_saved', verifiedAt: new Date().toISOString(), pageUrl: verified.url, expectedValue: approvedPrice.after, observedValue: verified.value };
            task.summary = `Verified saved ${approvedPrice.field}: ${approvedPrice.before} → ${verified.value}.`;
          }
          task.updatedAt = new Date().toISOString();
          this.broadcast({ event: 'task:completed', data: task });
          this.broadcast({ event: 'host:status', data: this.getStatusPayload() });

          await this.postRoomMessage({
            roomId: task.roomId,
            text: `✅ *Completed:* ${task.summary}`,
            mediaUrl: task.replayGifUrl
          });
          return;
        }

        if (!this.isCurrentTask(task)) return;
        await this.browser.executeAction(plan.action);
        if (!this.isCurrentTask(task)) return;
        const screenshotUrl = await this.browser.captureStepScreenshot(
          task.taskId,
          stepIndex + 1,
          plan.thought
        );


        if (!this.isCurrentTask(task)) return;
        const step: TaskStep = {
          stepNumber: stepIndex + 1,
          timestamp: new Date().toISOString(),
          thought: plan.thought,
          action: plan.action,
          screenshotUrl,
          riskLevel: plan.riskLevel,
          pageUrl: this.browser.getCurrentUrl()
        };

        task.steps.push(step);
        const observed = await this.browser.getPageSnapshot();
        for (const errorText of observed.observedErrors || []) {
          if (!task.observedErrors!.some(error => error.errorText === errorText && error.pageUrl === observed.url)) {
            task.observedErrors!.push({ stepNumber: step.stepNumber, timestamp: step.timestamp, pageUrl: observed.url, screenshotUrl, errorText });
          }
        }
        task.updatedAt = new Date().toISOString();

        this.broadcast({
          event: 'task:step',
          data: { taskId: task.taskId, step, task }
        });

        await this.postRoomMessage({
          roomId: task.roomId,
          text: `📸 *Step ${step.stepNumber}:* ${step.thought}`,
          mediaUrl: step.screenshotUrl
        });
      }
      if (this.isCurrentTask(task)) throw new Error('Task reached the step limit before completion. Review the last screenshot and retry with a narrower goal.');
    } catch (err) {
      await this.browser.stopScreencast();
      this.lastTakeoverFrame = null;
      this.approvalResolvers.delete(task.taskId);
      this.takeoverResolvers.delete(task.taskId);
      if (!this.isCurrentTask(task)) return;
      const msg = (err as Error).message;
      task.status = msg.includes('CallBudgetGuard') ? 'HALTED_BY_BUDGET' : 'FAILED';
      task.summary = msg;
      this.broadcast({ event: 'task:completed', data: task });
      this.broadcast({ event: 'host:status', data: this.getStatusPayload() });
    }
  }

  public resolveApproval(
    taskId: string,
    decision: 'approve' | 'reject',
    responderName: string,
    responderRole: TeamRole
  ): { ok: boolean; error?: string } {
    if (!['approve', 'reject'].includes(decision)) return { ok: false, error: 'Invalid approval decision' };
    if (!this.safety.canRoleApprove(responderRole)) {
      return {
        ok: false,
        error: `Role "${responderRole}" is not authorized to approve high-risk steps. Allowed roles: ${this.safety.getApproverRoles().join(', ')}`
      };
    }
    const pending = this.activeTask?.taskId === taskId ? this.activeTask.pendingApproval : undefined;
    if (decision === 'approve' && pending?.expiresAt && Date.parse(pending.expiresAt) <= Date.now()) return { ok: false, error: 'This approval has expired. No action was executed.' };
    const resolver = this.approvalResolvers.get(taskId);
    if (!resolver) {
      return { ok: false, error: 'No pending approval for this taskId' };
    }
    this.approvalResolvers.delete(taskId);
    resolver(decision, `${responderName} (${responderRole})`);
    return { ok: true };
  }

  public async handleTakeoverInput(input: RemoteTakeoverInput): Promise<void> {
    if (!this.activeTask || this.activeTask.taskId !== input.taskId || this.activeTask.status !== 'HUMAN_TAKEOVER') {
      throw new Error('This task is not awaiting human takeover.');
    }
    if (!['tap', 'type', 'otp_submit', 'hand_back'].includes(input.type)) throw new Error('Invalid takeover input');
    if (input.type === 'tap' && (!Number.isFinite(input.x) || !Number.isFinite(input.y) ||
        input.x! < 0 || input.y! < 0 || input.x! >= 1280 || input.y! >= 800)) throw new Error('Invalid browser coordinates');
    if (input.type === 'otp_submit' && !/^\d{6}$/.test(input.text || '')) throw new Error('Enter a six-digit code');
    if (input.type === 'type' && (!input.text || input.text.length > 4096)) throw new Error('Invalid remote text');
    if (input.type === 'hand_back') {
      const resolver = this.takeoverResolvers.get(input.taskId);
      if (resolver) {
        this.takeoverResolvers.delete(input.taskId);
        resolver();
      }
      return;
    }

    await this.browser.injectTakeoverInput(input);
    if (input.type === 'otp_submit') {
      const resolver = this.takeoverResolvers.get(input.taskId);
      if (resolver) {
        this.takeoverResolvers.delete(input.taskId);
        resolver();
      }
    }
  }

  public async emergencyStop(): Promise<void> {
        this.taskController?.abort(); this.taskController = null;
        if (this.activeTask) {
          this.activeTask.status = 'FAILED';
          this.activeTask.summary = 'Emergency Kill Switch triggered by operator.';
          this.broadcast({ event: 'task:completed', data: this.activeTask });
          const stopped = this.activeTask;
          this.activeTask = null;
          this.approvalResolvers.get(stopped.taskId)?.('reject', 'Emergency stop');
          this.approvalResolvers.delete(stopped.taskId);
          this.takeoverResolvers.get(stopped.taskId)?.();
          this.takeoverResolvers.delete(stopped.taskId);
          this.lastTakeoverFrame = null;
        }
        await this.browser.close();
  }

  public async start(): Promise<void> {
    if (process.env.SWITCH_TRANSPORT === 'direct_legacy') await this.switchClient.start();

    const server = http.createServer(async (req, res) => {
      const origin = req.headers.origin;
      const allowedOrigins = [`http://localhost:${this.port}`, `http://127.0.0.1:${this.port}`, 'http://localhost:4200', 'http://127.0.0.1:4200'];
      if (origin && !allowedOrigins.includes(origin)) { res.writeHead(403); res.end('Origin not permitted'); return; }
      if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      try {
      const url = new URL(req.url || '/', `http://localhost:${this.port}`);

      const principal = this.auth.authenticate(req.headers.authorization);
      if (principal?.kind === 'bridge') this.lastAgentContactAt = new Date().toISOString();
      if (url.pathname === '/api/auth/session' && req.method === 'GET') {
        if (!principal) throw new Error('Pair this device with Studio before sending tasks or approvals.');
        const { token, ...safe } = principal; res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify(safe)); return;
      }
      if (url.pathname === '/api/pair' && req.method === 'POST') {
        const body = await this.readJsonBody<{ code: string }>(req);
        const paired = this.auth.pair(body.code, req.socket.remoteAddress || 'unknown');
        res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify(paired)); return;
      }
      if (url.pathname === '/api/pairing-code' && req.method === 'POST') {
        if (!this.auth.canApprove(principal)) throw new Error('Authenticated operator required.');
        res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify(this.auth.issueCode())); return;
      }
      const evidenceMatch = /^\/api\/tasks\/(task-[a-zA-Z0-9-]+)(?:\/(evidence))?$/.exec(url.pathname);
      if (evidenceMatch && req.method === 'GET') {
        const task = this.repository.get(evidenceMatch[1]);
        if (!task) { res.writeHead(404); res.end(JSON.stringify({ error: 'Task not found' })); return; }
        res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify(evidenceMatch[2] ? evidencePacket(task) : task)); return;
      }
      if (req.method === 'POST' && !principal) { res.writeHead(401, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ error: 'Authenticated client required. Pair your iPhone through Studio.' })); return; }

      // Serve step screenshots & replay artifacts
      if (url.pathname.startsWith('/captures/')) {
        const fileName = path.basename(url.pathname);
        const filePath = path.join(CAPTURES_DIR, fileName);
        if (fs.existsSync(filePath)) {
          const contentType = fileName.endsWith('.svg') ? 'image/svg+xml' : fileName.endsWith('.gif') ? 'image/gif' : fileName.endsWith('.m4a') ? 'audio/mp4' : 'image/png';
          res.writeHead(200, { 'Content-Type': contentType });
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      }

      // Interactive Takeover Web Screen (works on iPhone Safari, iOS WebView, or Desktop)
      if (url.pathname.startsWith('/takeover/')) {
        const taskId = url.pathname.split('/')[2] || '';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.renderTakeoverWebPage(taskId));
        return;
      }

      if (url.pathname === '/api/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.getStatusPayload()));
        return;
      }

      if (url.pathname === '/api/tasks' && req.method === 'POST') {
        const body = await this.readJsonBody<{
          prompt?: string;
          onDeviceTranscript?: string;
          audioBase64?: string;
          senderName?: string;
          senderRole?: TeamRole;
          source?: TaskSource;
          roomId?: string;
          threadId?: string;
          requestId?: string;
          parentTaskId?: string;
        }>(req);

        if (!body.prompt?.trim() && !body.onDeviceTranscript?.trim() && !body.audioBase64) throw new Error('A prompt is required');
        let finalPrompt = body.prompt || '';
        if (body.source === 'ios_voice' || body.onDeviceTranscript || body.audioBase64) {
          const sttResult = await this.stt.transcribeVoiceNote({
            onDeviceTranscript: body.onDeviceTranscript || body.prompt,
            audioBase64: body.audioBase64
          });
          finalPrompt = sttResult.transcript;
        }

        const task = await this.startTask({
          prompt: finalPrompt,
          senderName: body.senderName || 'Priya',
          senderRole: principal!.role,
          source: body.source || 'ios_text',
          audioBase64: body.audioBase64,
          roomId: body.roomId,
          threadId: body.threadId,
          requestId: body.requestId,
          parentTaskId: body.parentTaskId
        });

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(task));
        return;
      }

      if (url.pathname.match(/^\/api\/tasks\/[^/]+\/approval$/) && req.method === 'POST') {
        const taskId = url.pathname.split('/')[3];
        const body = await this.readJsonBody<{
          approvalId: string;
          decision: 'approve' | 'reject';
          responderName: string;
          responderRole: TeamRole;
        }>(req);
        if (!this.auth.canApprove(principal)) { res.writeHead(403); res.end(JSON.stringify({ error: 'An authenticated operator must decide. Chat coordinators cannot approve.' })); return; }
        if (!body.approvalId || body.approvalId !== this.activeTask?.pendingApproval?.approvalId || taskId !== this.activeTask.taskId) {
          res.writeHead(409); res.end(JSON.stringify({ error: 'Approval does not match the pending action.' })); return;
        }
        const result = this.resolveApproval(
          taskId,
          body.decision,
          principal!.name,
          principal!.role
        );
        res.writeHead(result.ok ? 200 : 403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      if (url.pathname.match(/^\/api\/tasks\/[^/]+\/takeover$/) && req.method === 'POST') {
        if (!this.auth.canApprove(principal)) throw new Error('Only a paired human operator can control takeover.');
        const taskId = url.pathname.split('/')[3];
        const body = await this.readJsonBody<RemoteTakeoverInput>(req);
        await this.handleTakeoverInput({ ...body, taskId });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if ((url.pathname === '/webhook/switch' || url.pathname === '/api/switch/events') && req.method === 'POST') {
        if (process.env.SWITCH_TRANSPORT !== 'direct_legacy' || principal?.kind !== 'operator') throw new Error('Direct legacy Switch events are disabled for Console-managed coordination.');
        const event = await this.readJsonBody<SwitchRoomMessageEvent>(req);
        const handled = this.switchClient.handleIncomingSwitchEvent(event);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, handled }));
        return;
      }

      if (url.pathname === '/api/switch/mode' && req.method === 'POST') {
        const body = await this.readJsonBody<{ mode: 'stream' | 'rest_fallback' }>(req);
        this.switchClient.setMode(body.mode);
        this.broadcast({ event: 'host:status', data: this.getStatusPayload() });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, mode: this.switchClient.getMode() }));
        return;
      }

      if (url.pathname === '/api/kill' && req.method === 'POST') {
        await this.emergencyStop();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      } catch (error) {
        if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
    });

    const wss = new WebSocketServer({ server, path: '/ws' });
    wss.on('connection', (ws) => {
      this.wsClients.add(ws);
      ws.send(JSON.stringify({ event: 'host:status', data: this.getStatusPayload() }));
      if (this.lastTakeoverFrame) ws.send(JSON.stringify(this.lastTakeoverFrame));

      // WebSocket is a read-only feed. All operator input uses authenticated REST.
      ws.on('close', () => {
        this.wsClients.delete(ws);
      });
    });

    server.listen(this.port, () => {
      console.log(`[Deskhand Agent Host] Listening at http://localhost:${this.port}`);
      console.log(`  • WebSocket Gateway: ws://localhost:${this.port}/ws`);
      console.log(`  • Hard Call Budget:  ${this.budget.getStatus().usedCalls}/${this.budget.getStatus().maxCalls}`);
    });
  }

  private renderTakeoverWebPage(taskId: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Deskhand — Live Screen Takeover (${taskId})</title>
  <style>
    body { margin: 0; background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; }
    .box { max-width: 540px; margin: 20px auto; background: #1e293b; border: 2px solid #f59e0b; border-radius: 14px; padding: 24px; }
    input { width: 100%; padding: 14px; font-size: 24px; letter-spacing: 6px; text-align: center; background: #0f172a; color: #fff; border: 1px solid #475569; border-radius: 8px; margin: 14px 0; box-sizing: border-box; }
    button { width: 100%; padding: 14px; font-size: 16px; font-weight: 800; border: none; border-radius: 8px; cursor: pointer; background: #10b981; color: #052e16; }
  </style>
</head>
<body>
  <div class="box">
    <h2 style="margin-top:0;color:#fbbf24">🖐️ Deskhand Live Screen Takeover</h2>
    <p style="color:#cbd5e1">Deskhand paused at the 2FA Login Code challenge on <code>admin.chaico.local</code>. Type the 6-digit code below and hand control back:</p>
    <input id="code" type="text" value="482910" maxlength="6" />
    <button onclick="submitOtp()">Type Code & Hand Back to Deskhand</button>
    <p id="msg" style="color:#34d399;font-weight:700;margin-top:14px"></p>
  </div>
  <script>
    async function submitOtp() {
      const code = document.getElementById('code').value.trim();
      await fetch('/api/tasks/${taskId}/takeover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: '${taskId}', type: 'otp_submit', text: code, actorName: 'Rahul' })
      });
      document.getElementById('msg').textContent = '✅ Code injected! Handed screen back to Deskhand.';
    }
  </script>
</body>
</html>`;
  }

  private readJsonBody<T>(req: http.IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      let raw = '';
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size <= 8 * 1024 * 1024) raw += chunk;
      });
      req.on('error', reject);
      req.on('end', () => {
        if (size > 8 * 1024 * 1024) { reject(new Error('Request exceeds 8 MB')); return; }
        try {
          resolve(JSON.parse(raw || '{}') as T);
        } catch {
          resolve({} as T);
        }
      });
    });
  }
}

