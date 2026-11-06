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
  private streamController: AbortController | null = null;
  private seenEvents = new Set<string>();
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
    this.streamController?.abort();
    this.streamController = null;
    if (newMode === 'stream' && this.heartbeatTimer) this.startEventStream();
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
    await this.register();
    this.startHeartbeatLoop();
    if (this.mode === 'stream') this.startEventStream();
  }

  private async register(): Promise<void> {
    try {
      const res = await fetch(`${this.serverUrl}/agents/register`, {
        method: 'POST',
        signal: AbortSignal.timeout(600),
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

  }

  /**
   * Sends a heartbeat every 2000ms (2s) as required by the Switch agent protocol.
   */
  private startHeartbeatLoop(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(async () => {
      if (!this.connected) await this.register();
      this.lastHeartbeatAt = new Date().toISOString();
      try {
        const res = await fetch(`${this.serverUrl}/agents/${this.agentId}/heartbeat`, {
          method: 'POST',
          signal: AbortSignal.timeout(600),
          headers: { Authorization: `Bearer ${this.token}` }
        });
        this.connected = res.ok;
      } catch {
        this.connected = false;
      }
    }, 2000);
  }

  /**
   * Processes an incoming room event from Switch.
   * Strictly enforces the rule: act ONLY when `addressed === true`.
   */
  public handleIncomingSwitchEvent(event: SwitchRoomMessageEvent): boolean {
    if (event?.addressed !== true || typeof event.text !== 'string' || !event.text.trim() ||
        typeof event.roomId !== 'string' || typeof event.senderName !== 'string') {
      return false;
    }
    const eventKey = event.eventId ? `${event.roomId}:${event.eventId}` : undefined;
    if (eventKey && this.seenEvents.has(eventKey)) return false;
    if (eventKey) {
      this.seenEvents.add(eventKey);
      if (this.seenEvents.size > 1000) this.seenEvents.delete(this.seenEvents.values().next().value!);
    }
    if (this.onAddressedCallback) this.onAddressedCallback(event);
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
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(800),
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
      if (!response.ok && this.mode === 'stream') {
        const fallback = await fetch(`${this.serverUrl}/agents/${this.agentId}/message`, {
          method: 'POST', signal: AbortSignal.timeout(800),
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
          body: JSON.stringify({ agentId: this.agentId, ...params })
        });
        if (!fallback.ok) throw new Error('Switch rejected the message');
      } else if (!response.ok) throw new Error('Switch rejected the message');
    } catch {
      // Logged locally when running without Switch Console open
      console.log(`[Switch -> #${params.roomId}] ${params.text}${params.mediaUrl ? ` [Media: ${params.mediaUrl}]` : ''}`);
    }
  }

  /** SSE reconnects independently of the host/iOS WebSocket. Webhooks remain supported. */
  private startEventStream(): void {
    this.streamController?.abort();
    const controller = new AbortController();
    this.streamController = controller;
    const streamPath = process.env.SWITCH_EVENTS_PATH || `/agents/${this.agentId}/events`;
    const endpoint = new URL(streamPath, this.serverUrl);
    if (endpoint.origin !== new URL(this.serverUrl).origin) return;
    void (async () => {
      let delay = 1000;
      while (!controller.signal.aborted) {
        try {
          const response = await fetch(endpoint, {
            headers: { Accept: 'text/event-stream', Authorization: `Bearer ${this.token}` },
            signal: controller.signal
          });
          if (!response.ok || !response.body) throw new Error('Switch event stream unavailable');
          for await (const payload of decodeSSE(response.body)) {
            if (controller.signal.aborted) return;
            try {
              const message = JSON.parse(payload);
              this.handleIncomingSwitchEvent(message.data ?? message);
            } catch { /* Ignore malformed events and keep reading the stream. */ }
          }
          delay = 1000;
        } catch { if (controller.signal.aborted) return; }
        await new Promise<void>((resolve) => {
          const finish = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', finish); resolve(); };
          const timer = setTimeout(finish, delay);
          controller.signal.addEventListener('abort', finish, { once: true });
        });
        delay = Math.min(delay * 2, 16000);
      }
    })();
  }

  public stop(): void {
    this.streamController?.abort(); this.streamController = null;
    this.connected = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}


/** Streaming TextDecoder preserves UTF-8 characters split across network chunks. */
export async function* decodeSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  let eventSize = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line === '') { if (data.length) yield data.join('\n'); data = []; eventSize = 0; }
        else if (line.startsWith('data:')) {
          eventSize += line.length;
          if (eventSize > 1024 * 1024) throw new Error('Switch event exceeds 1 MB');
          data.push(line.slice(5).replace(/^ /, ''));
        }
      }
      if (buffer.length > 1024 * 1024) throw new Error('Switch event exceeds 1 MB');
      if (done) break;
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
