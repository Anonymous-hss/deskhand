import { CallBudgetGuard } from '../budget/callBudget.js';

export class VoiceTranscriber {
  private budget: CallBudgetGuard;

  constructor(budget: CallBudgetGuard) {
    this.budget = budget;
  }

  /**
   * Resolves a voice note into task text.
   * - If the iOS app already transcribed the audio on-device via Apple SFSpeechRecognizer,
   *   0 API calls are consumed!
   * - If raw audio arrives from Slack/Switch without an on-device transcript and VISION_MODE=live,
   *   consumes 1 STT call from the 150-call hard cap.
   */
  public async transcribeVoiceNote(params: {
    onDeviceTranscript?: string;
    audioBase64?: string;
  }): Promise<{ transcript: string; consumedApiCall: boolean }> {
    if (params.onDeviceTranscript && params.onDeviceTranscript.trim().length > 0) {
      return {
        transcript: params.onDeviceTranscript.trim(),
        consumedApiCall: false
      };
    }

    throw new Error('An on-device transcript is required. Raw audio transcription is not configured; no command was created and no STT call was charged.');
  }
}
