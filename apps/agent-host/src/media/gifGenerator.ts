import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TaskStep } from '@deskhand/shared-protocol';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAPTURES_DIR = path.resolve(__dirname, '../../captures');

export class ReplayGenerator {
  /**
   * Builds an animated replay artifact summarizing each step of a Deskhand task.
   */
  public generateReplayArtifact(taskId: string, steps: TaskStep[]): string {
    fs.mkdirSync(CAPTURES_DIR, { recursive: true });
    const fileName = `${taskId}-replay.svg`;
    const filePath = path.join(CAPTURES_DIR, fileName);

    const stepLines = steps
      .map(
        (s, idx) =>
          `<text x="60" y="${150 + idx * 44}" fill="#e2e8f0" font-family="sans-serif" font-size="18">
            ✅ Step ${s.stepNumber}: ${s.thought.replace(/[<>&]/g, '')}
          </text>`
      )
      .join('\n');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="460" viewBox="0 0 960 460">
      <rect width="960" height="460" rx="16" fill="#0f172a" stroke="#f59e0b" stroke-width="3"/>
      <text x="60" y="75" fill="#f59e0b" font-family="sans-serif" font-size="26" font-weight="bold">
        🎬 Deskhand Session Replay (${steps.length} Steps)
      </text>
      <text x="60" y="108" fill="#94a3b8" font-family="sans-serif" font-size="14">
        Task ID: ${taskId} • Sandboxed Chromium 1280x800
      </text>
      ${stepLines}
    </svg>`;

    fs.writeFileSync(filePath, svg, 'utf-8');
    return `/captures/${fileName}`;
  }
}

