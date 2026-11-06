import type { BugReportDraft, DeskhandTask } from '@deskhand/shared-protocol';
/** Reports are grounded in observed page errors, never inferred from prompt keywords. */
export function reportFromEvidence(task: DeskhandTask): BugReportDraft | undefined {
  const errors = task.observedErrors || [];
  if (!errors.length) return;
  const observed = errors[errors.length - 1];
  return {
    title: observed.errorText.replace(/\s+/g, ' ').slice(0, 180),
    severity: /\b5\d\d\b|exception|crash/i.test(observed.errorText) ? 'HIGH' : 'MEDIUM',
    stepsToReproduce: task.steps.filter(step => step.stepNumber <= observed.stepNumber).map(step => {
      const action = step.action;
      if (action.type === 'navigate') return `Open ${step.pageUrl}`;
      return `${action.type}: ${action.selectorHint || 'browser viewport'}${action.type === 'type' ? ' (enter the requested value)' : ''}`;
    }),
    errorBanner: observed.errorText,
    screenshotUrl: observed.screenshotUrl
  };
}
export function evidencePacket(task: DeskhandTask) {
  return {
    schemaVersion: 1, taskId: task.taskId, roomId: task.roomId, threadId: task.threadId,
    requestedBy: task.senderName, parentTaskId: task.parentTaskId,
    status: task.status, request: task.prompt, createdAt: task.createdAt, updatedAt: task.updatedAt,
    steps: task.steps, observedErrors: task.observedErrors || [], approval: task.pendingApproval,
    verification: task.verification, bugReport: task.bugReport,
    summary: task.summary, replayUrl: task.replayGifUrl, hostModelCalls: task.callsUsed,
    modelUsageScope: 'Azure host calls only; Switch-managed Claude usage is separate.'
  };
}
