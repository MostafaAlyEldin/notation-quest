/**
 * Lightweight Web Audio API synthesizer for tactile game & stack feedback.
 * Safe in headless/SSR environments and respects user mute toggle.
 */

class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled = true;

  public setEnabled(val: boolean) {
    this.enabled = val;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  private getContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private tone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.06, delay = 0) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playPush() {
    this.tone(420, 0.09, 'triangle', 0.05);
    this.tone(560, 0.08, 'triangle', 0.04, 0.04);
  }

  public playPop() {
    this.tone(540, 0.08, 'sine', 0.05);
    this.tone(380, 0.09, 'sine', 0.04, 0.04);
  }

  public playStep() {
    this.tone(480, 0.06, 'sine', 0.035);
  }

  public playCorrect() {
    this.tone(523.25, 0.12, 'triangle', 0.06, 0);
    this.tone(659.25, 0.12, 'triangle', 0.06, 0.07);
    this.tone(783.99, 0.2, 'triangle', 0.065, 0.14);
  }

  public playWrong() {
    this.tone(220, 0.16, 'sawtooth', 0.045, 0);
    this.tone(185, 0.22, 'sawtooth', 0.045, 0.11);
  }

  public playVictory() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => this.tone(n, 0.22, 'triangle', 0.06, idx * 0.09));
  }
}

export const soundFX = new SoundManager();
