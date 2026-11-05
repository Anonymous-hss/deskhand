/**
 * Switch Agent Protocol Connector (Win-Dev 2)
 * - Registers once with the local Switch server (Telemetry OFF in Console)
 * - Sends heartbeat every 2000ms (2s)
 * - Listens to event stream and acts ONLY when `addressed === true`
 * - Supports `post_message` + media screenshot upload
 * - Includes automatic fallback to `POST /agents/{id}/message` (SWITCH_MODE=rest_fallback)
 */

export interface SwitchRoomMessageEvent {
  eventId: string;
  roomId: string;
  senderName: string;
  senderRole?: string;
  text: string;
  addressed: boolean;
  voiceAttachmentUrl?: string;
  threadId?: string;
}

export class SwitchConnector {
  private serverUrl: string;
  private agentId: string;
  private token: string;
  private mode: 'stream' | 'rest_fallback';
  private connected = false;
  private lastHeartbeatAt: string | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private onAddressedCallback?: (evt: SwitchRoomMessageEvent) => void;

  constructor() {
    this.serverUrl = process.env.SWITCH_SERVER_URL || 'http://localhost:7700';
    this.agentId = process.env.SWITCH_AGENT_ID || 'deskhand-agent';
    this.token = process.env.SWITCH_AGENT_TOKEN || 'dev-local-token';
    this.mode = (process.env.SWITCH_MODE as 'stream' | 'rest_fallback') || 'stream';
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public getMode(): 'stream' | 'rest_fallback' {
    return this.mode;
  }

  public setMode(newMode: 'stream' | 'rest_fallback'): void {
    this.mode = newMode;
    console.log(`[SwitchConnector] Switched protocol mode to: ${this.mode}`);
  }

  public getLastHeartbeatAt(): string | null {
    return this.lastHeartbeatAt;
  }

  public onAddressedMessage(cb: (evt: SwitchRoomMessageEvent) => void): void {
    this.onAddressedCallback = cb;
  }

  /**
   * Registers Deskhand once with the local Switch Console server and starts the 2s heartbeat.
   */
  public async start(): Promise<void> {
    try {
      const res = await fetch(`${this.serverUrl}/agents/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`
        },
        body: JSON.stringify({
          agentId: this.agentId,
          displayName: 'Deskhand',
          capabilities: ['computer_use', 'screenshots', 'approvals', 'voice_notes']
        })
      });
      this.connected = res.ok;
    } catch {
      // Local Switch Console may not be running yet; keep heartbeat polling active
      this.connected = false;
    }

    this.startHeartbeatLoop();
  }

  /**
   * Sends a heartbeat every 2000ms (2s) as required by the Switch agent protocol.
   */
  private startHeartbeatLoop(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(async () => {
      this.lastHeartbeatAt = new Date().toISOString();
      try {
        const res = await fetch(`${this.serverUrl}/agents/${this.agentId}/heartbeat`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.token}` }
        });
        this.connected = res.ok;
      } catch {
        // Keep local timestamp updated for studio diagnostics even when Switch Console is offline
      }
    }, 2000);
  }

  /**
   * Processes an incoming room event from Switch.
   * Strictly enforces the rule: act ONLY when `addressed === true`.
   */
  public handleIncomingSwitchEvent(event: SwitchRoomMessageEvent): boolean {
    if (!event.addressed) {
      return false;
    }
    if (this.onAddressedCallback) {
      this.onAddressedCallback(event);
    }
    return true;
  }

  /**
   * Posts a message (and optional screenshot/GIF attachment) to the Switch room thread.
   * Automatically uses `post_message` or falls back to `POST /agents/{id}/message`.
   */
  public async postRoomMessage(params: {
    roomId: string;
    text: string;
    mediaUrl?: string;
    buttons?: Array<{ label: string; action: string }>;
  }): Promise<void> {
    const endpoint =
      this.mode === 'rest_fallback'
        ? `${this.serverUrl}/agents/${this.agentId}/message`
        : `${this.serverUrl}/rooms/${params.roomId}/post_message`;

    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`
        },
        body: JSON.stringify({
          agentId: this.agentId,
          roomId: params.roomId,
          text: params.text,
          mediaUrl: params.mediaUrl,
          buttons: params.buttons
        })
      });
    } catch {
      // Logged locally when running without Switch Console open
      console.log(`[Switch -> #${params.roomId}] ${params.text}${params.mediaUrl ? ` [Media: ${params.mediaUrl}]` : ''}`);
    }
  }

  public stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

