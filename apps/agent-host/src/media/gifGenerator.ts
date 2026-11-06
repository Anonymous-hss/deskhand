import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;
import { PNG } from 'pngjs';
import type { TaskStep } from '@deskhand/shared-protocol';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAPTURES_DIR = path.resolve(__dirname, '../../captures');

export class ReplayGenerator {
  /**
   * Builds an animated replay artifact summarizing each step of a Deskhand task.
   */
  public generateReplayArtifact(taskId: string, steps: TaskStep[]): string {
    fs.mkdirSync(CAPTURES_DIR, { recursive: true });
    const encoder = GIFEncoder();
    let frameCount = 0;
    for (const step of steps) {
      const inputPath = path.join(CAPTURES_DIR, path.basename(step.screenshotUrl));
      if (!inputPath.endsWith('.png') || !fs.existsSync(inputPath)) continue;
      const input = PNG.sync.read(fs.readFileSync(inputPath));
      const width = 640;
      const height = 400;
      const pixels = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const source = (Math.floor(y * input.height / height) * input.width + Math.floor(x * input.width / width)) * 4;
          pixels.set(input.data.subarray(source, source + 4), (y * width + x) * 4);
        }
      }
      const palette = quantize(pixels, 128);
      encoder.writeFrame(applyPalette(pixels, palette), width, height, { palette, delay: 1000, repeat: 0 });
      frameCount++;
    }
    if (frameCount > 0) {
      encoder.finish();
      const gifName = `${taskId}-replay.gif`;
      fs.writeFileSync(path.join(CAPTURES_DIR, gifName), encoder.bytes());
      return `/captures/${gifName}`;
    }
    // Keep an honest summary fallback when Chromium produced synthetic SVG captures.
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

