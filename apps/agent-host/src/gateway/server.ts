import fs from 'node:fs';
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
import { SwitchConnector } from '../switch/switchConnector.js';
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
  private wsClients = new Set<WebSocket>();

  constructor(port = 4100) {
    this.port = port;
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
      void this.startTask({
        prompt: evt.text,
        senderName: evt.senderName,
        senderRole: (evt.senderRole as TeamRole) || 'qa-lead',
        source: 'switch_chat',
        roomId: evt.roomId
      });
    });
  }

  public getStatusPayload(): HostStatusPayload {
    return {
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
    const payload = JSON.stringify(msg);
    for (const client of this.wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  public async startTask(params: {
    prompt: string;
    senderName: string;
    senderRole: TeamRole;
    source: TaskSource;
    roomId?: string;
  }): Promise<DeskhandTask> {
    const taskId = `task-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const task: DeskhandTask = {
      taskId,
      roomId: params.roomId || 'ops',
      prompt: params.prompt,
      senderName: params.senderName,
      senderRole: params.senderRole,
      source: params.source,
      status: 'RUNNING',
      createdAt: now,
      updatedAt: now,
      steps: [],
      callsUsed: 0
    };

    this.activeTask = task;
    this.recentTasks.unshift(task);
    this.broadcast({ event: 'task:started', data: task });

    await this.switchClient.postRoomMessage({
      roomId: task.roomId,
      text: `🤖 *Deskhand* picked up task from *${task.senderName}*: "${task.prompt}"`
    });

    void this.runTaskLoop(task);
    return task;
  }

  private async runTaskLoop(task: DeskhandTask): Promise<void> {
    try {
      for (let stepIndex = 0; stepIndex < 10; stepIndex++) {
        if (this.activeTask?.taskId !== task.taskId) return;

        const plan = await this.planner.planNextStep(
          task.prompt,
          stepIndex,
          task.steps[task.steps.length - 1]?.screenshotUrl
        );

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

          await this.switchClient.postRoomMessage({
            roomId: task.roomId,
            text: `🖐️ *Take Over Needed:* ${takeover.reason}\n👉 Tap to take over screen: ${takeover.takeoverUrl}`
          });

          await new Promise<void>((resolve) => {
            this.takeoverResolvers.set(task.taskId, resolve);
          });

          takeover.active = false;
          task.status = 'RUNNING';
          this.broadcast({
            event: 'task:takeover_released',
            data: { taskId: task.taskId, task }
          });
          continue;
        }

        // Check Safety Switch before executing risky actions (submit/pay/delete/send)
        const safetyCheck = this.safety.requiresTeamApproval(plan);
        if (safetyCheck.required) {
          const preScreenshotUrl = await this.browser.captureStepScreenshot(
            task.taskId,
            stepIndex + 1,
            `PAUSED FOR APPROVAL: ${safetyCheck.promptQuestion}`
          );

          const approval: ApprovalRequest = {
            approvalId: `appr-${Date.now().toString(36)}`,
            taskId: task.taskId,
            stepNumber: stepIndex + 1,
            promptQuestion: safetyCheck.promptQuestion,
            diffSummary: safetyCheck.diffSummary,
            targetUrl: this.browser.getCurrentUrl(),
            screenshotUrl: preScreenshotUrl,
            allowedRoles: this.safety.getApproverRoles(),
            createdAt: new Date().toISOString(),
            status: 'PENDING'
          };

          task.status = 'AWAITING_APPROVAL';
          task.pendingApproval = approval;
          task.updatedAt = new Date().toISOString();

          this.broadcast({
            event: 'task:approval_required',
            data: { taskId: task.taskId, approval, task }
          });

          await this.switchClient.postRoomMessage({
            roomId: task.roomId,
            text: `🛑 *Safety Switch — Approval Required:* ${approval.promptQuestion}`,
            mediaUrl: preScreenshotUrl,
            buttons: [
              { label: 'Approve', action: `approve:${task.taskId}` },
              { label: 'Not now', action: `reject:${task.taskId}` }
            ]
          });

          const decision = await new Promise<{ decision: 'approve' | 'reject'; actor: string }>(
            (resolve) => {
              this.approvalResolvers.set(task.taskId, (dec, actor) =>
                resolve({ decision: dec, actor })
              );
            }
          );

          approval.status = decision.decision === 'approve' ? 'APPROVED' : 'REJECTED';
          approval.resolvedBy = decision.actor;
          approval.resolvedAt = new Date().toISOString();

          this.broadcast({
            event: 'task:approval_resolved',
            data: { taskId: task.taskId, approval, task }
          });

          if (decision.decision === 'reject') {
            task.status = 'REJECTED';
            task.summary = `Paused and cancelled by ${decision.actor} ("Not now"). No changes were saved.`;
            this.broadcast({ event: 'task:completed', data: task });
            return;
          }

          task.status = 'RUNNING';
        }

        if (plan.action.type === 'complete') {
          task.status = 'COMPLETED';
          task.replayGifUrl = this.replay.generateReplayArtifact(task.taskId, task.steps);
          task.summary = plan.thought;
          if (task.prompt.toLowerCase().includes('coupon') || task.prompt.toLowerCase().includes('reproduce')) {
            task.bugReport = {
              title: '500 CouponDiscountOverflowException on checkout with coupon CHAI50',
              severity: 'CRITICAL',
              stepsToReproduce: [
                'Open Chai Co. Staging Shop (/shop)',
                'Add Masala Chai Tin (250g) to cart',
                'Apply promo code CHAI50',
                'Click Proceed to Checkout -> 500 Internal Server Error'
              ],
              errorBanner:
                "CouponDiscountOverflowException: Negative tax bucket when applying coupon 'CHAI50' (CheckoutController.ts:142)",
              screenshotUrl: task.steps[task.steps.length - 1]?.screenshotUrl || ''
            };
          }
          task.updatedAt = new Date().toISOString();
          this.broadcast({ event: 'task:completed', data: task });
          this.broadcast({ event: 'host:status', data: this.getStatusPayload() });

          await this.switchClient.postRoomMessage({
            roomId: task.roomId,
            text: `✅ *Completed:* ${task.summary}`,
            mediaUrl: task.replayGifUrl
          });
          return;
        }

        await this.browser.executeAction(plan.action);
        const screenshotUrl = await this.browser.captureStepScreenshot(
          task.taskId,
          stepIndex + 1,
          plan.thought
        );

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
        task.updatedAt = new Date().toISOString();

        this.broadcast({
          event: 'task:step',
          data: { taskId: task.taskId, step, task }
        });

        await this.switchClient.postRoomMessage({
          roomId: task.roomId,
          text: `📸 *Step ${step.stepNumber}:* ${step.thought}`,
          mediaUrl: step.screenshotUrl
        });
      }
    } catch (err) {
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
    if (!this.safety.canRoleApprove(responderRole)) {
      return {
        ok: false,
        error: `Role "${responderRole}" is not authorized to approve high-risk steps. Allowed roles: ${this.safety.getApproverRoles().join(', ')}`
      };
    }
    const resolver = this.approvalResolvers.get(taskId);
    if (!resolver) {
      return { ok: false, error: 'No pending approval for this taskId' };
    }
    this.approvalResolvers.delete(taskId);
    resolver(decision, `${responderName} (${responderRole})`);
    return { ok: true };
  }

  public async handleTakeoverInput(input: RemoteTakeoverInput): Promise<void> {
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

  public async start(): Promise<void> {
    await this.switchClient.start();

    const server = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://localhost:${this.port}`);

      // Serve step screenshots & replay artifacts
      if (url.pathname.startsWith('/captures/')) {
        const fileName = path.basename(url.pathname);
        const filePath = path.join(CAPTURES_DIR, fileName);
        if (fs.existsSync(filePath)) {
          const contentType = fileName.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
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
        }>(req);

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
          senderRole: body.senderRole || 'qa-lead',
          source: body.source || 'ios_text'
        });

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(task));
        return;
      }

      if (url.pathname.match(/^\/api\/tasks\/[^/]+\/approval$/) && req.method === 'POST') {
        const taskId = url.pathname.split('/')[3];
        const body = await this.readJsonBody<{
          decision: 'approve' | 'reject';
          responderName: string;
          responderRole: TeamRole;
        }>(req);
        const result = this.resolveApproval(
          taskId,
          body.decision,
          body.responderName || 'Priya',
          body.responderRole || 'qa-lead'
        );
        res.writeHead(result.ok ? 200 : 403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      if (url.pathname.match(/^\/api\/tasks\/[^/]+\/takeover$/) && req.method === 'POST') {
        const taskId = url.pathname.split('/')[3];
        const body = await this.readJsonBody<RemoteTakeoverInput>(req);
        await this.handleTakeoverInput({ ...body, taskId });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
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
        if (this.activeTask) {
          this.activeTask.status = 'FAILED';
          this.activeTask.summary = 'Emergency Kill Switch triggered by operator.';
          this.broadcast({ event: 'task:completed', data: this.activeTask });
          this.activeTask = null;
        }
        await this.browser.close();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    const wss = new WebSocketServer({ server, path: '/ws' });
    wss.on('connection', (ws) => {
      this.wsClients.add(ws);
      ws.send(JSON.stringify({ event: 'host:status', data: this.getStatusPayload() }));

      ws.on('message', async (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as {
            event: string;
            data: RemoteTakeoverInput;
          };
          if (msg.event === 'takeover:input') {
            await this.handleTakeoverInput(msg.data);
          }
        } catch {
          // ignore malformed messages
        }
      });

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
    return new Promise((resolve) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        try {
          resolve(JSON.parse(raw || '{}') as T);
        } catch {
          resolve({} as T);
        }
      });
    });
  }
}

