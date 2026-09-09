export class SoundManager {
  private static instance: SoundManager;
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private bgmPlaying: boolean = false;
  private schedulerTimer: number | null = null;
  private nextNoteTime: number = 0;
  private bgmStep: number = 0;
  private bgmBar: number = 0;

  public bgmEnabled: boolean = true;
  public seEnabled: boolean = true;
  public masterVolume: number = 0.5;

  private constructor() {
    this.setupAutoResume();
  }

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  private initContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      if (!this.noiseBuffer) {
        // 2秒分のホワイトノイズを事前生成（毎拍のGC破棄・メモリ確保によるカクつきを完全根絶）
        const len = this.ctx.sampleRate * 2;
        this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) {
          data[i] = Math.random() * 2 - 1;
        }
      }
    }
    return this.ctx;
  }

  private setupAutoResume(): void {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.initContext();
      if (this.ctx && this.ctx.state === 'running') {
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('pointerdown', unlock);
      }
    };
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('pointerdown', unlock, { passive: true });
  }

  // ===================== BGM SYSTEM (Lookahead Precision Scheduler) =====================
  public startBGM(): void {
    if (!this.bgmEnabled) return;
    const ctx = this.initContext();
    if (!ctx) return;

    if (this.bgmPlaying && this.schedulerTimer !== null) {
      return;
    }

    this.bgmPlaying = true;
    this.bgmStep = 0;
    this.bgmBar = 0;
    this.nextNoteTime = ctx.currentTime + 0.05;

    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }

    const tempo = 132; // BPM
    const stepDuration = (60 / tempo) / 4; // ~0.1136秒 (16分音符)
    const lookahead = 0.20; // 200ミリ秒先まで事前キューイングしてリズムのヨレ・カクつきをゼロ化

    this.schedulerTimer = window.setInterval(() => {
      if (!this.bgmPlaying || !this.bgmEnabled) {
        this.stopBGM();
        return;
      }

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
        return;
      }

      // 画面スリープや別タブ切り替えで時計が遅れた場合の自動再同期
      if (this.nextNoteTime < ctx.currentTime) {
        this.nextNoteTime = ctx.currentTime + 0.03;
      }

      try {
        // 先行200ms以内の音符をAudioThreadに事前予約（どんな高負荷でもカクつきゼロ！）
        while (this.nextNoteTime < ctx.currentTime + lookahead) {
          this.playBGMStep(ctx, this.nextNoteTime, this.bgmStep, this.bgmBar);
          this.nextNoteTime += stepDuration;
          this.bgmStep++;
          if (this.bgmStep >= 16) {
            this.bgmStep = 0;
            this.bgmBar = (this.bgmBar + 1) % 8;
          }
        }
      } catch (e) {
        console.warn('BGM scheduling error:', e);
      }
    }, 25);
  }

  public stopBGM(): void {
    this.bgmPlaying = false;
    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  public toggleBGM(): boolean {
    this.bgmEnabled = !this.bgmEnabled;
    if (this.bgmEnabled) {
      this.startBGM();
    } else {
      this.stopBGM();
    }
    return this.bgmEnabled;
  }

  private playBGMStep(ctx: AudioContext, t: number, step: number, bar: number): void {
    const vol = 0.28 * this.masterVolume;

    // 1. ドラムパート (Kick on 0, 4, 8, 12, 14, Snare on 4, 12, Hi-hat every step)
    if (step === 0 || step === 4 || step === 8 || step === 12 || (bar % 2 === 1 && step === 14)) {
      this.synthKick(ctx, t, vol * 1.1);
    }
    if (step === 4 || step === 12) {
      this.synthSnare(ctx, t, vol * 0.9);
    }
    // Hi-hat
    const hatVol = (step % 2 === 0 ? 0.35 : 0.18) * vol;
    this.synthHiHat(ctx, t, hatVol, step === 2 || step === 10);

    // 2. ベースライン (Dマイナーの力強いドライブベース)
    // コード進行: Dm -> F -> Bb -> A (2小節ずつ)
    const baseFreqs = [73.42, 87.31, 58.27, 55.0]; // D2, F2, Bb1, A1
    const chordIdx = Math.floor(bar / 2);
    const rootFreq = baseFreqs[chordIdx];

    // 16分音符のローリングベース
    if (step % 2 === 0 || step === 3 || step === 7 || step === 11 || step === 15) {
      let f = rootFreq;
      if (step === 3 || step === 11) f = rootFreq * 1.5; // 5度
      if (step === 15) f = rootFreq * 2; // オクターブ上
      this.synthBass(ctx, t, f, vol * 0.85);
    }

    // 3. シンセアルペジオ / メロディ
    if (step % 2 === 0) {
      const scaleDMinor = [146.83, 174.61, 196.00, 220.00, 261.63, 293.66, 349.23, 392.00]; // D3〜G4
      const arpNote = scaleDMinor[(step / 2 + bar * 2) % scaleDMinor.length];
      this.synthLead(ctx, t, arpNote, vol * 0.45);
    }
  }

  private synthKick(ctx: AudioContext, t: number, vol: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.1);

    gain.gain.setValueAtTime(vol * 1.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  private synthSnare(ctx: AudioContext, t: number, vol: number): void {
    if (!this.noiseBuffer) return;
    const dur = 0.12;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1200, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + dur);

    const osc = ctx.createOscillator();
    const toneGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.08);
    toneGain.gain.setValueAtTime(vol * 0.6, t);
    toneGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(toneGain);
    toneGain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  private synthHiHat(ctx: AudioContext, t: number, vol: number, open: boolean): void {
    if (!this.noiseBuffer) return;
    const dur = open ? 0.08 : 0.035;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + dur);
  }

  private synthBass(ctx: AudioContext, t: number, freq: number, vol: number): void {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(480, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.08);

    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  private synthLead(ctx: AudioContext, t: number, freq: number, vol: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  // ===================== SOUND EFFECTS (SE) =====================

  public playSwing(isHeavy: boolean = false): void {
    if (!this.seEnabled) return;
    const ctx = this.initContext();
    if (!ctx || !this.noiseBuffer) return;
    const t = ctx.currentTime;

    const dur = isHeavy ? 0.16 : 0.09;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(isHeavy ? 600 : 1100, t);
    filter.frequency.exponentialRampToValueAtTime(isHeavy ? 200 : 350, t + dur);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35 * this.masterVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + dur);
  }

  public playHit(intensity: 'light' | 'medium' | 'heavy' | 'sweep'): void {
    if (!this.seEnabled) return;
    const ctx = this.initContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    // 1. 打撃コンタクト時の激しいノイズ破裂音 (Punch / Slash Transient)
    if (this.noiseBuffer) {
      const nDur = intensity === 'heavy' ? 0.09 : (intensity === 'medium' ? 0.06 : 0.04);
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const nFilter = ctx.createBiquadFilter();
      nFilter.type = 'bandpass';
      nFilter.frequency.setValueAtTime(intensity === 'heavy' ? 1800 : (intensity === 'medium' ? 2400 : 3200), t);
      nFilter.Q.setValueAtTime(2.0, t);

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime((intensity === 'heavy' ? 0.8 : 0.5) * this.masterVolume, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + nDur);

      noise.connect(nFilter);
      nFilter.connect(nGain);
      nGain.connect(ctx.destination);
      noise.start(t);
      noise.stop(t + nDur);
    }

    // 2. 肉体・骨・刀にめり込む芯のあるピッチ降下トーン
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (intensity === 'light') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, t);
      osc.frequency.exponentialRampToValueAtTime(70, t + 0.08);
      gain.gain.setValueAtTime(0.7 * this.masterVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.09);
    } else if (intensity === 'medium') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.12);
      gain.gain.setValueAtTime(0.85 * this.masterVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.13);
    } else if (intensity === 'sweep') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(35, t + 0.22);
      gain.gain.setValueAtTime(0.95 * this.masterVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    } else {
      // 強打撃（Heavy Hit）: ドスンと腹に響くサブベース＋衝撃波
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.22);
      gain.gain.setValueAtTime(1.0 * this.masterVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(95, t);
      sub.frequency.exponentialRampToValueAtTime(30, t + 0.22);
      subGain.gain.setValueAtTime(0.85 * this.masterVolume, t);
      subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      sub.connect(subGain);
      subGain.connect(ctx.destination);
      sub.start(t);
      sub.stop(t + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    }
  }

  // ★ 連続コンボチャイム（コンボ数に応じてピッチが上昇！）
  public playCombo(hitCount: number): void {
    if (!this.seEnabled) return;
    const ctx = this.initContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const baseFreq = 523.25; // C5
    const pitchMult = Math.min(2.0, 1 + (hitCount - 1) * 0.12);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq * pitchMult, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * pitchMult * 1.5, t + 0.08);

    gain.gain.setValueAtTime(0.45 * this.masterVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  // ★ カウンターヒット重低音
  public playCounterHit(): void {
    if (!this.seEnabled) return;
    const ctx = this.initContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.3);

    gain.gain.setValueAtTime(1.0 * this.masterVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  public playGuard(): void {
    if (!this.seEnabled) return;
    const ctx = this.initContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    // 刀・盾が弾かれる高周波の金属クラッシュ音
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const nFilter = ctx.createBiquadFilter();
      nFilter.type = 'highpass';
      nFilter.frequency.setValueAtTime(3500, t);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.45 * this.masterVolume, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      noise.connect(nFilter);
      nFilter.connect(nGain);
      nGain.connect(ctx.destination);
      noise.start(t);
      noise.stop(t + 0.06);
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(450, t + 0.1);

    gain.gain.setValueAtTime(0.6 * this.masterVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.11);
  }

  public playParry(): void {
    if (!this.seEnabled) return;
    const ctx = this.initContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    [1760, 2640].forEach(f => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.4 * this.masterVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.28);
    });
  }

  public playJustParry(): void {
    if (!this.seEnabled) return;
    const ctx = this.initContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const bass = ctx.createOscillator();
    const bgain = ctx.createGain();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(90, t);
    bass.frequency.exponentialRampToValueAtTime(30, t + 0.35);
    bgain.gain.setValueAtTime(0.9 * this.masterVolume, t);
    bgain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    bass.connect(bgain);
    bgain.connect(ctx.destination);
    bass.start(t);
    bass.stop(t + 0.35);

    [1046.5, 1318.5, 2093].forEach(freq => {
      const bell = ctx.createOscillator();
      const gain = ctx.createGain();
      bell.type = 'sine';
      bell.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.45 * this.masterVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      bell.connect(gain);
      gain.connect(ctx.destination);
      bell.start(t);
      bell.stop(t + 0.5);
    });
  }

  public playImpact(hit: boolean = false): void {
    if (!this.seEnabled) return;
    const ctx = this.initContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(hit ? 160 : 280, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + (hit ? 0.35 : 0.2));

    gain.gain.setValueAtTime(0.95 * this.masterVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (hit ? 0.38 : 0.22));

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + (hit ? 0.38 : 0.22));
  }

  public playThrowGrab(): void {
    if (!this.seEnabled) return;
    const ctx = this.initContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.1);
    gain.gain.setValueAtTime(0.8 * this.masterVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.11);
  }

  public playThrowSlam(): void {
    if (!this.seEnabled) return;
    const ctx = this.initContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.28);
    gain.gain.setValueAtTime(1.0 * this.masterVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  public playSuperArt(): void {
    if (!this.seEnabled) return;
    const ctx = this.initContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(1600, t + 0.3);
    gain.gain.setValueAtTime(0.85 * this.masterVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  public playKO(): void {
    if (!this.seEnabled) return;
    const ctx = this.initContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.6);
    gain.gain.setValueAtTime(1.0 * this.masterVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.65);
  }
}
