// OpenAI Realtime (WebRTC) browser client
// Uses ephemeral client_secret from POST /sessions.
// Exposes window.RealtimeClient for public/index.html.

class RealtimeClient {
  constructor(config) {
    this.config = config;

    this.peerConnection = null;
    this.dataChannel = null;
    this.mediaStream = null;

    this.isConnected = false;
    this.userTranscript = '';
    this.assistantTranscript = '';

    this._audioEl = null;
  }

  async connect() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });

      this.peerConnection = new RTCPeerConnection();

      // Send microphone to the model
      for (const track of this.mediaStream.getTracks()) {
        this.peerConnection.addTrack(track, this.mediaStream);
      }

      // Receive model audio
      this.peerConnection.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;

        if (!this._audioEl) {
          const audio = document.createElement('audio');
          audio.autoplay = true;
          audio.playsInline = true;
          audio.muted = false;
          document.body.appendChild(audio);
          this._audioEl = audio;
        }

        this._audioEl.srcObject = stream;
        const p = this._audioEl.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      };

      // Data channel for JSON events
      this.dataChannel = this.peerConnection.createDataChannel('oai-events');
      this.dataChannel.onopen = () => {
        if (this.config.instructions) {
          this._sendEvent({
            type: 'session.update',
            session: {
              instructions: this.config.instructions,
              modalities: ['text', 'audio'],
            },
          });
        }
      };
      this.dataChannel.onmessage = (event) => this._handleEventMessage(event.data);

      this.peerConnection.onconnectionstatechange = () => {
        const state = this.peerConnection && this.peerConnection.connectionState;
        if (state === 'connected') {
          if (!this.isConnected) {
            this.isConnected = true;
            if (this.config.onConnected) this.config.onConnected();
          }
        }
        if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          if (this.isConnected) {
            this.isConnected = false;
            if (this.config.onDisconnected) this.config.onDisconnected();
          }
        }
      };

      const offer = await this.peerConnection.createOffer({ offerToReceiveAudio: true });
      await this.peerConnection.setLocalDescription(offer);

      const model = this.config.model || 'gpt-4o-realtime-preview-2024-12-17';
      const url = `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.sessionToken}`,
          'Content-Type': 'application/sdp',
          'OpenAI-Beta': 'realtime=v1',
        },
        body: offer.sdp,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Realtime SDP exchange failed (${res.status}): ${text || res.statusText}`);
      }

      const answerSdp = await res.text();
      await this.peerConnection.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      // Some browsers don't flip connectionState immediately.
      if (!this.isConnected) {
        this.isConnected = true;
        if (this.config.onConnected) this.config.onConnected();
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (this.config.onError) this.config.onError(err);
      await this.disconnect().catch(() => {});
      throw err;
    }
  }

  async disconnect() {
    this.isConnected = false;

    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch {}
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch {}
      this.peerConnection = null;
    }

    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((t) => t.stop());
      } catch {}
      this.mediaStream = null;
    }

    if (this._audioEl) {
      try {
        this._audioEl.srcObject = null;
        this._audioEl.remove();
      } catch {}
      this._audioEl = null;
    }

    if (this.config.onDisconnected) this.config.onDisconnected();
  }

  async sendMessage(text) {
    this.userTranscript = text;
    if (this.config.onTranscript) this.config.onTranscript(text, 'user');

    this._sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });

    this._sendEvent({
      type: 'response.create',
      response: {
        modalities: ['text', 'audio'],
        instructions: this.config.instructions,
      },
    });
  }

  // Compatibility no-ops (mic is always live via track)
  async startRecording() {}
  async stopRecording() {}

  isConnecting() {
    return this.isConnected;
  }

  getTranscripts() {
    return { user: this.userTranscript, assistant: this.assistantTranscript };
  }

  _sendEvent(obj) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;
    this.dataChannel.send(JSON.stringify(obj));
  }

  _handleEventMessage(data) {
    try {
      const event = typeof data === 'string' ? JSON.parse(data) : data;
      if (!event || !event.type) return;

      switch (event.type) {
        case 'response.text.delta':
          if (event.delta) this.assistantTranscript += event.delta;
          break;
        case 'response.done':
          if (this.assistantTranscript) {
            if (this.config.onTranscript) this.config.onTranscript(this.assistantTranscript, 'assistant');
            this.assistantTranscript = '';
          }
          break;
        case 'error':
          if (this.config.onError) this.config.onError(new Error(JSON.stringify(event)));
          break;
        default:
          break;
      }
    } catch {
      // ignore
    }
  }
}

window.RealtimeClient = RealtimeClient;
