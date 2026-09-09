export interface ArcadeButtonMapping {
  lp: number[];           // 弱パンチ (X): [2]
  mp: number[];           // 中パンチ (Y): [3]
  hp: number[];           // 強パンチ (RB): [5]
  lk: number[];           // 弱キック (A): [0]
  mk: number[];           // 中キック (B): [1]
  hk: number[];           // 強キック (RT): [7]
  driveImpact: number[];  // ドライブインパクト (LB): [4]
  driveParry: number[];   // ドライブパリィ (LT): [6]
  superArt: number[];     // スーパーアーツ: [4, 6] (または HP+HK)
  restart: number[];       // リスタート: [9] (Start / Options)
  toggleCpu: number[];     // 2P CPU切替: [8] (Select / Share)
  toggleDebug: number[];   // 判定表示: [10, 16] (L3 / Touchpad)
  lightAttack: number[];   // 互換用
  heavyAttack: number[];   // 互換用
}

const DEFAULT_MAPPING: ArcadeButtonMapping = {
  lp: [2],
  mp: [3],
  hp: [5],
  lk: [0],
  mk: [1],
  hk: [7],
  driveImpact: [4],
  driveParry: [6],
  superArt: [4, 6],
  restart: [9],
  toggleCpu: [8],
  toggleDebug: [10, 16],
  lightAttack: [2, 0],
  heavyAttack: [5, 7, 3, 1]
};

export class ArcadeControllerManager {
  private static instance: ArcadeControllerManager;

  public connected: boolean = false;
  public gamepadId: string = '';
  public gamepadIndex: number = -1;

  public mapping: ArcadeButtonMapping = { ...DEFAULT_MAPPING };

  // レバー・方向キー状態
  public isLeftDown: boolean = false;
  public isRightDown: boolean = false;
  public isUpDown: boolean = false;
  public isDownDown: boolean = false;
  public isUpJustDown: boolean = false;

  // SF6 6ボタン状態
  public lpJustDown: boolean = false;
  public lpIsDown: boolean = false;
  public mpJustDown: boolean = false;
  public mpIsDown: boolean = false;
  public hpJustDown: boolean = false;
  public hpIsDown: boolean = false;
  public lkJustDown: boolean = false;
  public lkIsDown: boolean = false;
  public mkJustDown: boolean = false;
  public mkIsDown: boolean = false;
  public hkJustDown: boolean = false;
  public hkIsDown: boolean = false;

  // つかみ・通常投げ (X+A 同時押し)
  public throwJustDown: boolean = false;
  public throwIsDown: boolean = false;

  // 特殊システムボタン状態
  public impactJustDown: boolean = false;
  public impactIsDown: boolean = false;
  public parryJustDown: boolean = false;
  public parryIsDown: boolean = false;
  public superArtJustDown: boolean = false;
  public restartJustDown: boolean = false;
  public toggleCpuJustDown: boolean = false;
  public toggleDebugJustDown: boolean = false;

  // 互換性用
  public lightAttackJustDown: boolean = false;
  public lightAttackIsDown: boolean = false;
  public heavyAttackJustDown: boolean = false;
  public heavyAttackIsDown: boolean = false;

  // 入力モニター用
  public stickDirection: string = 'NEUTRAL';
  public stickSymbol: string = '●';
  public pressedButtons: number[] = [];
  public activeLabels: string[] = [];

  // 前フレーム状態記録用
  private prevButtonStates: boolean[] = [];
  private prevUpDown: boolean = false;
  private lastLpTime: number = 0;
  private lastLkTime: number = 0;
  private onConnectCallbacks: ((padName: string) => void)[] = [];

  private constructor() {
    this.loadMapping();
    this.initListeners();
  }

  public loadMapping(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('agy_arcade_mapping');
        if (saved) {
          this.mapping = { ...DEFAULT_MAPPING, ...JSON.parse(saved) };
        }
      }
    } catch (e) {
      // ignore
    }
  }

  public saveMapping(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('agy_arcade_mapping', JSON.stringify(this.mapping));
      }
    } catch (e) {
      // ignore
    }
  }

  public resetMapping(): void {
    this.mapping = { ...DEFAULT_MAPPING };
    this.saveMapping();
  }

  public static getInstance(): ArcadeControllerManager {
    if (!ArcadeControllerManager.instance) {
      ArcadeControllerManager.instance = new ArcadeControllerManager();
    }
    return ArcadeControllerManager.instance;
  }

  private initListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('gamepadconnected', (e: GamepadEvent) => {
      this.connected = true;
      this.gamepadId = e.gamepad.id;
      this.gamepadIndex = e.gamepad.index;
      this.notifyConnect(this.gamepadId);
    });

    window.addEventListener('gamepaddisconnected', (e: GamepadEvent) => {
      if (e.gamepad.index === this.gamepadIndex) {
        this.connected = false;
        this.gamepadId = '';
        this.gamepadIndex = -1;
      }
    });
  }

  public onConnect(callback: (padName: string) => void): void {
    this.onConnectCallbacks.push(callback);
    if (this.connected && this.gamepadId) {
      callback(this.gamepadId);
    }
  }

  private notifyConnect(name: string): void {
    for (const cb of this.onConnectCallbacks) {
      cb(name);
    }
  }

  // 毎フレーム呼ばれる更新処理
  public update(): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;

    const gamepads = navigator.getGamepads();
    let activePad: Gamepad | null = null;

    // 接続されているゲームパッドを探索（アケコン/ゲームパッド）
    for (let i = 0; i < gamepads.length; i++) {
      const pad = gamepads[i];
      if (pad && pad.connected) {
        activePad = pad;
        if (!this.connected) {
          this.connected = true;
          this.gamepadId = pad.id;
          this.gamepadIndex = pad.index;
          this.notifyConnect(this.gamepadId);
        }
        break;
      }
    }

    if (!activePad) {
      this.resetStates();
      return;
    }

    // 1. ボタン状態の収集
    const currentBtnStates: boolean[] = [];
    const justDownMap: boolean[] = [];
    this.pressedButtons = [];

    for (let i = 0; i < activePad.buttons.length; i++) {
      const btn = activePad.buttons[i];
      const isDown = btn.pressed || btn.value > 0.45;
      currentBtnStates[i] = isDown;
      justDownMap[i] = isDown && !this.prevButtonStates[i];
      if (isDown) {
        this.pressedButtons.push(i);
      }
    }

    // 2. レバー / D-Pad 入力判定 (D-pad & 左スティックの両方を合算)
    // 物理アケコンのDP/LS切替スイッチがどちらでも動くように対応
    // 斜め入力（↙ ↘ ↖ ↗）を確実に拾うためデッドゾーンを0.26に最適化
    const axisX = activePad.axes[0] ?? 0;
    const axisY = activePad.axes[1] ?? 0;
    const deadzone = 0.26;

    const dpadUp = currentBtnStates[12] ?? false;
    const dpadDown = currentBtnStates[13] ?? false;
    const dpadLeft = currentBtnStates[14] ?? false;
    const dpadRight = currentBtnStates[15] ?? false;

    this.isLeftDown = dpadLeft || axisX < -deadzone;
    this.isRightDown = dpadRight || axisX > deadzone;
    this.isUpDown = dpadUp || axisY < -deadzone;
    this.isDownDown = dpadDown || axisY > deadzone;

    this.isUpJustDown = this.isUpDown && !this.prevUpDown;
    this.prevUpDown = this.isUpDown;

    // レバー方向シンボル（入力モニター用）
    if (this.isUpDown && this.isLeftDown) {
      this.stickDirection = 'UP_LEFT'; this.stickSymbol = '↖';
    } else if (this.isUpDown && this.isRightDown) {
      this.stickDirection = 'UP_RIGHT'; this.stickSymbol = '↗';
    } else if (this.isDownDown && this.isLeftDown) {
      this.stickDirection = 'DOWN_LEFT'; this.stickSymbol = '↙';
    } else if (this.isDownDown && this.isRightDown) {
      this.stickDirection = 'DOWN_RIGHT'; this.stickSymbol = '↘';
    } else if (this.isUpDown) {
      this.stickDirection = 'UP'; this.stickSymbol = '⬆';
    } else if (this.isDownDown) {
      this.stickDirection = 'DOWN'; this.stickSymbol = '⬇';
    } else if (this.isLeftDown) {
      this.stickDirection = 'LEFT'; this.stickSymbol = '⬅';
    } else if (this.isRightDown) {
      this.stickDirection = 'RIGHT'; this.stickSymbol = '➡';
    } else {
      this.stickDirection = 'NEUTRAL'; this.stickSymbol = '●';
    }

    // 3. アクション判定（SF6 6ボタン ＋ DI ＋ パリィ ＋ SA）
    this.activeLabels = [];

    // 上段パンチ
    this.lpIsDown = this.isAnyDown(this.mapping.lp, currentBtnStates);
    this.lpJustDown = this.isAnyJustDown(this.mapping.lp, justDownMap);
    if (this.lpIsDown) this.activeLabels.push('LP');

    this.mpIsDown = this.isAnyDown(this.mapping.mp, currentBtnStates);
    this.mpJustDown = this.isAnyJustDown(this.mapping.mp, justDownMap);
    if (this.mpIsDown) this.activeLabels.push('MP');

    this.hpIsDown = this.isAnyDown(this.mapping.hp, currentBtnStates);
    this.hpJustDown = this.isAnyJustDown(this.mapping.hp, justDownMap);
    if (this.hpIsDown) this.activeLabels.push('HP');

    // 下段キック
    this.lkIsDown = this.isAnyDown(this.mapping.lk, currentBtnStates);
    this.lkJustDown = this.isAnyJustDown(this.mapping.lk, justDownMap);
    if (this.lkIsDown) this.activeLabels.push('LK');

    this.mkIsDown = this.isAnyDown(this.mapping.mk, currentBtnStates);
    this.mkJustDown = this.isAnyJustDown(this.mapping.mk, justDownMap);
    if (this.mkIsDown) this.activeLabels.push('MK');

    this.hkIsDown = this.isAnyDown(this.mapping.hk, currentBtnStates);
    this.hkJustDown = this.isAnyJustDown(this.mapping.hk, justDownMap);
    if (this.hkIsDown) this.activeLabels.push('HK');

    // つかみ・通常投げ (X+A 同時押し: LP+LK)
    // 人間の指の押しズレ（約70ms猶予）をバッファして100%確実に投げを発動
    const nowTime = performance.now();
    if (this.lpJustDown) this.lastLpTime = nowTime;
    if (this.lkJustDown) this.lastLkTime = nowTime;

    const throwBufferSimultaneous = (nowTime - this.lastLpTime <= 75) && (nowTime - this.lastLkTime <= 75);
    const throwSimultaneous = (this.lpIsDown && this.lkIsDown) || throwBufferSimultaneous;
    const throwSimultaneousJust = (this.lpJustDown && this.lkIsDown) ||
                                  (this.lkJustDown && this.lpIsDown) ||
                                  (this.lpJustDown && this.lkJustDown) ||
                                  (throwBufferSimultaneous && (this.lpJustDown || this.lkJustDown));
    this.throwIsDown = throwSimultaneous;
    this.throwJustDown = throwSimultaneousJust;
    if (this.throwJustDown) {
      this.lastLpTime = 0;
      this.lastLkTime = 0;
    }
    if (this.throwIsDown) this.activeLabels.push('THROW');

    // 互換用
    this.lightAttackIsDown = this.lpIsDown || this.lkIsDown;
    this.lightAttackJustDown = this.lpJustDown || this.lkJustDown;
    this.heavyAttackIsDown = this.hpIsDown || this.hkIsDown || this.mpIsDown || this.mkIsDown;
    this.heavyAttackJustDown = this.hpJustDown || this.hkJustDown || this.mpJustDown || this.mkJustDown;

    // ドライブインパクト (LB専用ボタン または HP+HK 同時押し)
    const diSimultaneous = this.hpIsDown && this.hkIsDown;
    const diSimultaneousJust = (this.hpJustDown && this.hkIsDown) || (this.hkJustDown && this.hpIsDown);

    this.impactIsDown = this.isAnyDown(this.mapping.driveImpact, currentBtnStates) || diSimultaneous;
    this.impactJustDown = this.isAnyJustDown(this.mapping.driveImpact, justDownMap) || diSimultaneousJust;
    if (this.impactIsDown) this.activeLabels.push('DI');

    // ドライブパリィ (LT専用ボタン または MP+MK 同時押し)
    const dpSimultaneous = this.mpIsDown && this.mkIsDown;
    const dpSimultaneousJust = (this.mpJustDown && this.mkIsDown) || (this.mkJustDown && this.mpIsDown);

    this.parryIsDown = this.isAnyDown(this.mapping.driveParry, currentBtnStates) || dpSimultaneous;
    this.parryJustDown = this.isAnyJustDown(this.mapping.driveParry, justDownMap) || dpSimultaneousJust;
    if (this.parryIsDown) this.activeLabels.push('DP');

    // スーパーアーツ (HP+HK同時押し長押し、DI+DP同時押し、または専用)
    const saSimultaneous = (this.impactIsDown && this.parryIsDown);
    this.superArtJustDown = this.isAnyJustDown(this.mapping.superArt, justDownMap) ||
                            (this.impactJustDown && this.parryIsDown) ||
                            (this.parryJustDown && this.impactIsDown);
    if (this.isAnyDown(this.mapping.superArt, currentBtnStates) || saSimultaneous) this.activeLabels.push('SA');

    // システム操作
    this.restartJustDown = this.isAnyJustDown(this.mapping.restart, justDownMap);
    this.toggleCpuJustDown = this.isAnyJustDown(this.mapping.toggleCpu, justDownMap);
    this.toggleDebugJustDown = this.isAnyJustDown(this.mapping.toggleDebug, justDownMap);

    // 状態を前フレーム履歴に保存
    this.prevButtonStates = currentBtnStates;
  }

  private isAnyDown(indices: number[], states: boolean[]): boolean {
    for (const idx of indices) {
      if (states[idx]) return true;
    }
    return false;
  }

  private isAnyJustDown(indices: number[], justDowns: boolean[]): boolean {
    for (const idx of indices) {
      if (justDowns[idx]) return true;
    }
    return false;
  }

  private resetStates(): void {
    this.isLeftDown = false;
    this.isRightDown = false;
    this.isUpDown = false;
    this.isDownDown = false;
    this.isUpJustDown = false;
    this.lpJustDown = false;
    this.lpIsDown = false;
    this.mpJustDown = false;
    this.mpIsDown = false;
    this.hpJustDown = false;
    this.hpIsDown = false;
    this.lkJustDown = false;
    this.lkIsDown = false;
    this.mkJustDown = false;
    this.mkIsDown = false;
    this.hkJustDown = false;
    this.hkIsDown = false;
    this.throwJustDown = false;
    this.throwIsDown = false;
    this.lastLpTime = 0;
    this.lastLkTime = 0;
    this.lightAttackJustDown = false;
    this.lightAttackIsDown = false;
    this.heavyAttackJustDown = false;
    this.heavyAttackIsDown = false;
    this.impactJustDown = false;
    this.impactIsDown = false;
    this.parryJustDown = false;
    this.parryIsDown = false;
    this.superArtJustDown = false;
    this.restartJustDown = false;
    this.toggleCpuJustDown = false;
    this.toggleDebugJustDown = false;
    this.stickDirection = 'NEUTRAL';
    this.stickSymbol = '●';
    this.pressedButtons = [];
    this.activeLabels = [];
  }
}
