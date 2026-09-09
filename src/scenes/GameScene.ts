import Phaser from 'phaser';
import { Fighter } from '../objects/Fighter';
import { Projectile } from '../objects/Projectile';
import { ArcadeControllerManager } from '../utils/ArcadeControllerManager';
import { SoundManager } from '../utils/SoundManager';

export const FIGHTER_ROSTER: Array<{
  key: string;
  name: string;
  displayName: string;
  color: string;
  numColor: number;
  nativeFacing: 'left' | 'right';
}> = [
  { key: 'mack', name: 'TOMOE', displayName: 'TOMOE (SAMURAI)', color: '#00f0ff', numColor: 0x00f0ff, nativeFacing: 'right' },
  { key: 'gladiator', name: 'TITUS', displayName: 'TITUS (GLADIATOR)', color: '#f59e0b', numColor: 0xf59e0b, nativeFacing: 'right' },
  { key: 'kenji', name: 'KENJI', displayName: 'KENJI (NINJA)', color: '#ff007f', numColor: 0xff007f, nativeFacing: 'left' },
  { key: 'ayane', name: 'AYANE', displayName: 'AYANE (VALKYRIE)', color: '#10b981', numColor: 0x10b981, nativeFacing: 'right' },
  { key: 'kaizer', name: 'KAIZER', displayName: 'KAIZER (CYBORG)', color: '#ef4444', numColor: 0xef4444, nativeFacing: 'right' },
  { key: 'kunoichi', name: 'KURENAI', displayName: 'KURENAI (KUNOICHI)', color: '#c084fc', numColor: 0xc084fc, nativeFacing: 'right' }
];

export class GameScene extends Phaser.Scene {
  private player1!: Fighter;
  private player2!: Fighter;
  private ground!: Phaser.Physics.Arcade.StaticGroup;
  private backgroundSprite!: Phaser.GameObjects.Image;
  private currentStage: 'cyber' | 'classic' = 'cyber';

  // プレイヤーキャラクター選択
  private p1CharIndex: number = 0; // Samurai Mack
  private p2CharIndex: number = 1; // Titus (Gladiator) デフォルト対戦相手！
  private p1NameText!: Phaser.GameObjects.Text;

  // SF6 スタイル HUD要素
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private showHitboxDebug: boolean = false;
  private hitboxDebugText!: Phaser.GameObjects.Text;
  private btnConfigText!: Phaser.GameObjects.Text;
  private p2NameText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private koOverlay?: Phaser.GameObjects.Container;
  private isGameOver: boolean = false;
  private gameTimer: number = 99;
  private lastTimerUpdate: number = 0;
  private bgmStatusText!: Phaser.GameObjects.Text;
  private currentBgm?: Phaser.Sound.BaseSound;
  private bgmInitialized: boolean = false;
  private isMuted: boolean = false;

  // コンボ表示バナー (SF6スタイル)
  private p1ComboContainer!: Phaser.GameObjects.Container;
  private p1ComboHitsText!: Phaser.GameObjects.Text;
  private p1ComboDmgText!: Phaser.GameObjects.Text;
  private p1ComboTimer?: Phaser.Time.TimerEvent;

  private p2ComboContainer!: Phaser.GameObjects.Container;
  private p2ComboHitsText!: Phaser.GameObjects.Text;
  private p2ComboDmgText!: Phaser.GameObjects.Text;
  private p2ComboTimer?: Phaser.Time.TimerEvent;

  // アケコン（USBコントローラー）HUD & 入力モニター
  private controllerStatusText!: Phaser.GameObjects.Text;
  private stickSymbolText!: Phaser.GameObjects.Text;
  private buttonTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private configModalContainer?: Phaser.GameObjects.Container;
  private isConfigModalOpen: boolean = false;
  private downAltKey?: Phaser.Input.Keyboard.Key;
  private projectiles: Projectile[] = [];

  constructor() {
    super('GameScene');
  }

  private isP2CPUInitial: boolean = true;

  public init(data?: { p1Index?: number; p2Index?: number; stage?: 'cyber' | 'classic'; isP2CPU?: boolean }): void {
    if (data) {
      if (typeof data.p1Index === 'number' && data.p1Index >= 0 && data.p1Index < FIGHTER_ROSTER.length) {
        this.p1CharIndex = data.p1Index;
      }
      if (typeof data.p2Index === 'number' && data.p2Index >= 0 && data.p2Index < FIGHTER_ROSTER.length) {
        this.p2CharIndex = data.p2Index;
      }
      if (data.stage) {
        this.currentStage = data.stage;
      }
      if (typeof data.isP2CPU === 'boolean') {
        this.isP2CPUInitial = data.isP2CPU;
      }
    }
  }

  public preload(): void {
    const loadingText = this.add.text(512, 288, 'Loading Assets...', {
      fontFamily: 'monospace',
      fontSize: '24px',
      color: '#00f0ff'
    }).setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      loadingText.setText(`Loading: ${Math.floor(value * 100)}%`);
    });

    this.load.on('complete', () => {
      loadingText.destroy();
    });

    // ステージ背景画像
    this.load.image('cyber_dojo', '/assets/cyber_dojo.jpg');
    this.load.image('classic_stage', '/assets/background.png');
    this.load.image('shop_decor', '/assets/shop.png');

    // Player 1: Tomoe (Samurai)
    this.load.spritesheet('mack_idle', '/assets/samuraiMack/Idle.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('mack_walk', '/assets/samuraiMack/Walk.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('mack_run', '/assets/samuraiMack/Run.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('mack_jump', '/assets/samuraiMack/Jump.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('mack_fall', '/assets/samuraiMack/Fall.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('mack_attack1', '/assets/samuraiMack/Attack1.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('mack_attack2', '/assets/samuraiMack/Attack2.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('mack_kick', '/assets/samuraiMack/Kick.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('mack_impact', '/assets/samuraiMack/Impact.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('mack_crouch', '/assets/samuraiMack/Crouch.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('mack_crouch_walk', '/assets/samuraiMack/CrouchWalk.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('mack_hit', '/assets/samuraiMack/Take Hit.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('mack_death', '/assets/samuraiMack/Death.png', { frameWidth: 200, frameHeight: 200 });

    // Player 2 (Kenji)
    this.load.spritesheet('kenji_idle', '/assets/kenji/Idle.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kenji_run', '/assets/kenji/Run.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kenji_jump', '/assets/kenji/Jump.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kenji_fall', '/assets/kenji/Fall.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kenji_attack1', '/assets/kenji/Attack1.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kenji_attack2', '/assets/kenji/Attack2.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kenji_hit', '/assets/kenji/Take hit.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kenji_death', '/assets/kenji/Death.png', { frameWidth: 200, frameHeight: 200 });

    // New Fighter: Gladiator (Titus)
    this.load.spritesheet('gladiator_idle', '/assets/gladiator/Idle.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('gladiator_run', '/assets/gladiator/Run.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('gladiator_jump', '/assets/gladiator/Jump.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('gladiator_fall', '/assets/gladiator/Fall.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('gladiator_attack1', '/assets/gladiator/Attack1.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('gladiator_attack2', '/assets/gladiator/Attack2.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('gladiator_kick', '/assets/gladiator/Kick.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('gladiator_impact', '/assets/gladiator/Impact.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('gladiator_crouch', '/assets/gladiator/Crouch.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('gladiator_hit', '/assets/gladiator/Take Hit.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('gladiator_death', '/assets/gladiator/Death.png', { frameWidth: 200, frameHeight: 200 });

    // New Fighter: Ayane (Valkyrie)
    this.load.spritesheet('ayane_idle', '/assets/ayane/Idle.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('ayane_run', '/assets/ayane/Run.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('ayane_jump', '/assets/ayane/Jump.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('ayane_fall', '/assets/ayane/Fall.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('ayane_attack1', '/assets/ayane/Attack1.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('ayane_attack2', '/assets/ayane/Attack2.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('ayane_kick', '/assets/ayane/Kick.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('ayane_impact', '/assets/ayane/Impact.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('ayane_crouch', '/assets/ayane/Crouch.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('ayane_hit', '/assets/ayane/Take Hit.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('ayane_death', '/assets/ayane/Death.png', { frameWidth: 200, frameHeight: 200 });

    // New Fighter: Kaizer (Cyborg)
    this.load.spritesheet('kaizer_idle', '/assets/kaizer/Idle.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kaizer_run', '/assets/kaizer/Run.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kaizer_jump', '/assets/kaizer/Jump.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kaizer_fall', '/assets/kaizer/Fall.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kaizer_attack1', '/assets/kaizer/Attack1.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kaizer_attack2', '/assets/kaizer/Attack2.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kaizer_kick', '/assets/kaizer/Kick.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kaizer_impact', '/assets/kaizer/Impact.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kaizer_crouch', '/assets/kaizer/Crouch.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kaizer_hit', '/assets/kaizer/Take Hit.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kaizer_death', '/assets/kaizer/Death.png', { frameWidth: 200, frameHeight: 200 });

    // New Fighter: Kunoichi (Kurenai)
    this.load.spritesheet('kunoichi_idle', '/assets/kunoichi/Idle.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kunoichi_walk', '/assets/kunoichi/Walk.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kunoichi_run', '/assets/kunoichi/Run.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kunoichi_jump', '/assets/kunoichi/Jump.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kunoichi_fall', '/assets/kunoichi/Fall.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kunoichi_attack1', '/assets/kunoichi/Attack1.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kunoichi_attack2', '/assets/kunoichi/Attack2.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kunoichi_kick', '/assets/kunoichi/Kick.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kunoichi_impact', '/assets/kunoichi/Impact.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kunoichi_crouch', '/assets/kunoichi/Crouch.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kunoichi_crouch_walk', '/assets/kunoichi/CrouchWalk.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kunoichi_hit', '/assets/kunoichi/Take Hit.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kunoichi_death', '/assets/kunoichi/Death.png', { frameWidth: 200, frameHeight: 200 });
    this.load.image('kunoichi_kunai', '/assets/kunoichi/kunai.png');
  }

  public create(): void {
    this.isGameOver = false;
    this.gameTimer = 99;
    this.lastTimerUpdate = this.time.now;

    // 1. 背景描画（カメラの微スクロール時にも黒帯が出ないよう少し大きめに配置）
    this.backgroundSprite = this.add.image(512, 288, this.currentStage === 'cyber' ? 'cyber_dojo' : 'classic_stage');
    this.backgroundSprite.setDisplaySize(1140, 640);

    // 2. アニメーション定義
    this.createAnimations();

    // 3. 地面（キャラクターの足裏が地面にピッタリ接地するように配置）
    this.ground = this.physics.add.staticGroup();
    const groundPlatform = this.ground.create(512, 560) as Phaser.Physics.Arcade.Sprite;
    groundPlatform.setVisible(false);
    const groundBody = groundPlatform.body as Phaser.Physics.Arcade.StaticBody;
    groundBody.setSize(1024, 120);

    // 4. キャラクター生成（SF6 ドライブキーのバインド）
    // P1: 初期 Samurai Mack
    const p1Def = FIGHTER_ROSTER[this.p1CharIndex];
    this.player1 = new Fighter(this, {
      id: 'p1',
      name: p1Def.name,
      x: 260,
      y: 400,
      spriteKey: p1Def.key,
      themeColor: p1Def.numColor,
      initialFacingLeft: false,
      nativeFacing: p1Def.nativeFacing,
      isCPU: false,
      keys: {
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        jump: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        // SF6 6ボタン + DI + パリィ
        lp: Phaser.Input.Keyboard.KeyCodes.U,
        mp: Phaser.Input.Keyboard.KeyCodes.I,
        hp: Phaser.Input.Keyboard.KeyCodes.O,
        lk: Phaser.Input.Keyboard.KeyCodes.J,
        mk: Phaser.Input.Keyboard.KeyCodes.K,
        hk: Phaser.Input.Keyboard.KeyCodes.L,
        impact: Phaser.Input.Keyboard.KeyCodes.P,
        parry: Phaser.Input.Keyboard.KeyCodes.SPACE,
        superArt: Phaser.Input.Keyboard.KeyCodes.M,
        attacks: [
          Phaser.Input.Keyboard.KeyCodes.U,
          Phaser.Input.Keyboard.KeyCodes.J
        ],
        heavyAttacks: [
          Phaser.Input.Keyboard.KeyCodes.O,
          Phaser.Input.Keyboard.KeyCodes.L
        ]
      }
    });

    // P2: 初期 Gladiator (Titus) (デフォルトCPU)
    const p2Def = FIGHTER_ROSTER[this.p2CharIndex];
    this.player2 = new Fighter(this, {
      id: 'p2',
      name: p2Def.name,
      x: 764,
      y: 400,
      spriteKey: p2Def.key,
      themeColor: p2Def.numColor,
      initialFacingLeft: true,
      nativeFacing: p2Def.nativeFacing,
      isCPU: this.isP2CPUInitial,
      keys: {
        left: Phaser.Input.Keyboard.KeyCodes.LEFT,
        right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        jump: Phaser.Input.Keyboard.KeyCodes.UP,
        down: Phaser.Input.Keyboard.KeyCodes.DOWN,
        attacks: [
          Phaser.Input.Keyboard.KeyCodes.ENTER,
          Phaser.Input.Keyboard.KeyCodes.NUMPAD_ZERO
        ],
        heavyAttacks: [
          Phaser.Input.Keyboard.KeyCodes.SHIFT,
          Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE
        ],
        impact: Phaser.Input.Keyboard.KeyCodes.P,
        parry: Phaser.Input.Keyboard.KeyCodes.O,
        superArt: Phaser.Input.Keyboard.KeyCodes.L
      }
    });

    this.player1.setOpponent(this.player2);
    this.player2.setOpponent(this.player1);

    // 5. 衝突設定
    this.physics.add.collider(this.player1, this.ground);
    this.physics.add.collider(this.player2, this.ground);

    // 空中飛び越えコライダー
    this.physics.add.collider(
      this.player1,
      this.player2,
      undefined,
      (obj1, obj2) => {
        const p1 = obj1 as Fighter;
        const p2 = obj2 as Fighter;
        const p1Body = p1.body as Phaser.Physics.Arcade.Body;
        const p2Body = p2.body as Phaser.Physics.Arcade.Body;
        if (!p1Body || !p2Body) return true;

        const p1InAir = !p1Body.blocked.down && !p1Body.touching.down;
        const p2InAir = !p2Body.blocked.down && !p2Body.touching.down;

        if (p1InAir || p2InAir) {
          // ジャンプ中、どちらかが相手の胸より上に位置している場合はすり抜けて飛び越え可能
          if (p1Body.bottom < p2Body.center.y + 25 || p2Body.bottom < p1Body.center.y + 25) {
            return false;
          }
        }
        return true;
      },
      this
    );

    // デバッグ判定描画用
    this.debugGraphics = this.add.graphics();
    this.debugGraphics.setDepth(99);

    // 6. SF6 HUD作成
    this.createSF6HUD();

    // 7. イベント
    this.events.on('fighter-ko', (loser: Fighter) => {
      this.handleKO(loser);
    });

    this.events.on('fighter-combo', (data: { attacker: Fighter, hits: number, damage: number }) => {
      this.showComboDisplay(data.attacker, data.hits, data.damage);
    });

    // 8. キー登録
    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.addCapture([
        Phaser.Input.Keyboard.KeyCodes.SPACE,
        Phaser.Input.Keyboard.KeyCodes.UP,
        Phaser.Input.Keyboard.KeyCodes.DOWN,
        Phaser.Input.Keyboard.KeyCodes.LEFT,
        Phaser.Input.Keyboard.KeyCodes.RIGHT,
        Phaser.Input.Keyboard.KeyCodes.H,
        Phaser.Input.Keyboard.KeyCodes.B,
        Phaser.Input.Keyboard.KeyCodes.U,
        Phaser.Input.Keyboard.KeyCodes.I,
        Phaser.Input.Keyboard.KeyCodes.O,
        Phaser.Input.Keyboard.KeyCodes.P,
        Phaser.Input.Keyboard.KeyCodes.J,
        Phaser.Input.Keyboard.KeyCodes.K,
        Phaser.Input.Keyboard.KeyCodes.L,
        Phaser.Input.Keyboard.KeyCodes.M,
        Phaser.Input.Keyboard.KeyCodes.ONE,
        Phaser.Input.Keyboard.KeyCodes.TWO
      ]);

      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE).on('down', () => {
        this.cycleP1Character();
      });

      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO).on('down', () => {
        this.cycleP2Character();
      });

      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B).on('down', () => {
        this.toggleButtonConfigModal();
      });

      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H).on('down', () => {
        this.toggleHitboxDebug();
      });

      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T).on('down', () => {
        this.toggleStage();
      });

      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C).on('down', () => {
        this.toggleP2CPU();
      });

      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R).on('down', () => {
        this.scene.restart();
      });

      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => {
        this.scene.start('SelectScene');
      });

      this.downAltKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    }

    // BGM自動開始（ユーザーの初回操作でWeb Audioを開始）
    const startBgmOnce = () => {
      SoundManager.getInstance().startBGM();
    };
    this.input.once('pointerdown', startBgmOnce);
    if (this.input.keyboard) {
      this.input.keyboard.once('keydown', startBgmOnce);
    }

    // アケコン接続イベント通知
    ArcadeControllerManager.getInstance().onConnect((padName) => {
      this.showControllerConnectedToast(padName);
    });

    // 開始演出：ROUND 1, FIGHT!
    this.createRoundStartVisual();
  }

  public override update(time: number, delta: number): void {
    // アケコン入力の更新
    const arcade = ArcadeControllerManager.getInstance();
    arcade.update();

    // アケコンからのシステム操作
    if (arcade.restartJustDown) {
      this.scene.restart();
      return;
    }
    if (arcade.toggleCpuJustDown) {
      this.toggleP2CPU();
    }
    if (arcade.toggleDebugJustDown) {
      this.toggleHitboxDebug();
    }

    this.player1.update();
    this.player2.update();

    // 飛道具（クナイ等）の更新
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!p.active || !p.isActive) {
        this.projectiles.splice(i, 1);
      } else {
        p.update(time, delta);
      }
    }

    // ★ ダイナミックバトルカメラ追従＆微ズーム
    this.updateBattleCamera();

    // タイマー更新
    if (!this.isGameOver && this.time.now - this.lastTimerUpdate >= 1000) {
      this.lastTimerUpdate = this.time.now;
      this.gameTimer = Math.max(0, this.gameTimer - 1);
      this.timerText.setText(this.gameTimer.toString().padStart(2, '0'));
      if (this.gameTimer <= 0) {
        this.handleTimeOver();
      }
    }

    // SF6 HUDの動的描画（HP、ドライブゲージ、SAゲージ）
    this.renderSF6HUD();

    // 当たり判定デバッグ描画
    if (this.showHitboxDebug) {
      this.debugGraphics.clear();
      this.renderHitboxDebug(this.player1);
      this.renderHitboxDebug(this.player2);
    } else {
      this.debugGraphics.clear();
    }

    // アケコン / キーボード 入力モニター更新（安全に既存Keyプロパティを参照）
    const p1ctrl = this.player1.getControls();
    let stickSym = arcade.stickSymbol;
    let isStickActive = arcade.stickDirection !== 'NEUTRAL';

    if (!isStickActive && p1ctrl) {
      const up = p1ctrl.jump?.isDown ?? false;
      const down = (p1ctrl.down?.isDown ?? false) || (this.downAltKey?.isDown ?? false);
      const left = p1ctrl.left?.isDown ?? false;
      const right = p1ctrl.right?.isDown ?? false;
      if (up && left) { stickSym = '↖'; isStickActive = true; }
      else if (up && right) { stickSym = '↗'; isStickActive = true; }
      else if (down && left) { stickSym = '↙'; isStickActive = true; }
      else if (down && right) { stickSym = '↘'; isStickActive = true; }
      else if (up) { stickSym = '⬆'; isStickActive = true; }
      else if (down) { stickSym = '⬇'; isStickActive = true; }
      else if (left) { stickSym = '⬅'; isStickActive = true; }
      else if (right) { stickSym = '➡'; isStickActive = true; }
      else { stickSym = '●'; }
    }

    if (this.stickSymbolText) {
      this.stickSymbolText.setText(stickSym);
      this.stickSymbolText.setColor(isStickActive ? '#38bdf8' : '#64748b');
    }

    const isLP = arcade.activeLabels.includes('LP') || (p1ctrl?.lp?.isDown ?? false);
    const isMP = arcade.activeLabels.includes('MP') || (p1ctrl?.mp?.isDown ?? false);
    const isHP = arcade.activeLabels.includes('HP') || (p1ctrl?.hp?.isDown ?? false);
    const isLK = arcade.activeLabels.includes('LK') || (p1ctrl?.lk?.isDown ?? false);
    const isMK = arcade.activeLabels.includes('MK') || (p1ctrl?.mk?.isDown ?? false);
    const isHK = arcade.activeLabels.includes('HK') || (p1ctrl?.hk?.isDown ?? false);
    const isDI = arcade.activeLabels.includes('DI') || (p1ctrl?.impact?.isDown ?? false);
    const isDP = arcade.activeLabels.includes('DP') || (p1ctrl?.parry?.isDown ?? false);
    const isSA = arcade.activeLabels.includes('SA') || (p1ctrl?.superArt?.isDown ?? false) || (isHP && isHK);
    const isThrow = arcade.activeLabels.includes('THROW') || (isLP && isLK);

    // アケコン操作時にもBGMが未開始なら開始
    if (arcade.connected && arcade.activeLabels.length > 0) {
      SoundManager.getInstance().startBGM();
    }

    const activeMap: Record<string, boolean> = {
      LP: isLP, MP: isMP, HP: isHP, DI: isDI,
      LK: isLK, MK: isMK, HK: isHK, DP: isDP,
      SA: isSA, THROW: isThrow
    };

    for (const [lbl, txt] of this.buttonTexts.entries()) {
      const active = activeMap[lbl] ?? false;
      txt.setColor(active ? '#facc15' : '#475569');
      txt.setScale(active ? 1.25 : 1.0);
    }
    if (this.controllerStatusText) {
      if (arcade.connected) {
        const cleanName = arcade.gamepadId.length > 24 ? arcade.gamepadId.substring(0, 24) + '...' : arcade.gamepadId;
        this.controllerStatusText.setText(`🕹️ アケコン接続中: ${cleanName}`);
        this.controllerStatusText.setColor('#34d399');
      } else {
        this.controllerStatusText.setText('🕹️ アケコン検知待機中 (ボタンを押すと認識)');
        this.controllerStatusText.setColor('#fbbf24');
      }
    }
  }

  public toggleHitboxDebug(): void {
    this.showHitboxDebug = !this.showHitboxDebug;
    const stateStr = this.showHitboxDebug ? 'ON' : 'OFF';
    if (this.hitboxDebugText) {
      this.hitboxDebugText.setText(`[H] 判定可視化: ${stateStr}`);
      this.hitboxDebugText.setColor(this.showHitboxDebug ? '#ef4444' : '#94a3b8');
    }
  }

  private renderHitboxDebug(fighter: Fighter): void {
    // 1. Pushbox (緑: 身体衝突判定)
    const pushbox = fighter.getPushbox();
    if (pushbox) {
      this.debugGraphics.lineStyle(2, 0x22c55e, 0.9);
      this.debugGraphics.strokeRect(pushbox.x, pushbox.y, pushbox.width, pushbox.height);
    }

    // 2. Hurtbox (青: やられ・被弾判定)
    const hurtbox = fighter.getHurtbox();
    if (hurtbox) {
      this.debugGraphics.lineStyle(2, 0x38bdf8, 0.9);
      this.debugGraphics.fillStyle(0x38bdf8, 0.15);
      this.debugGraphics.fillRect(hurtbox.x, hurtbox.y, hurtbox.width, hurtbox.height);
      this.debugGraphics.strokeRect(hurtbox.x, hurtbox.y, hurtbox.width, hurtbox.height);
    }

    // 3. Attack Hitbox (赤: 攻撃判定)
    const attackHitbox = fighter.getAttackHitbox();
    if (attackHitbox) {
      this.debugGraphics.fillStyle(0xef4444, 0.45);
      this.debugGraphics.fillRect(attackHitbox.x, attackHitbox.y, attackHitbox.width, attackHitbox.height);
      this.debugGraphics.lineStyle(3, 0xff0000, 1);
      this.debugGraphics.strokeRect(attackHitbox.x, attackHitbox.y, attackHitbox.width, attackHitbox.height);
    }
  }

  // アケコン接続トースト通知
  public showControllerConnectedToast(name: string): void {
    this.cameras.main.flash(180, 52, 211, 153);
    const cleanName = name.length > 32 ? name.substring(0, 32) + '...' : name;

    const toast = this.add.container(0, 0);
    toast.setDepth(110).setScrollFactor(0);

    const toastBg = this.add.graphics();
    toastBg.fillStyle(0x020617, 0.95);
    toastBg.fillRoundedRect(512 - 250, 150, 500, 75, 12);
    toastBg.lineStyle(3, 0x34d399, 1);
    toastBg.strokeRoundedRect(512 - 250, 150, 500, 75, 12);
    toast.add(toastBg);

    const title = this.add.text(512, 172, '🕹️ ARCADE STICK CONNECTED!', {
      fontFamily: 'impact, sans-serif',
      fontSize: '24px',
      color: '#34d399',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);
    toast.add(title);

    const sub = this.add.text(512, 202, `${cleanName}  |  入力スタンバイ完了`, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#f8fafc'
    }).setOrigin(0.5);
    toast.add(sub);

    this.tweens.add({
      targets: toast,
      alpha: 0,
      y: -30,
      delay: 2400,
      duration: 600,
      onComplete: () => toast.destroy()
    });
  }

  // アケコンボタン設定モーダル
  public toggleButtonConfigModal(): void {
    if (this.isConfigModalOpen) {
      if (this.configModalContainer) {
        this.configModalContainer.destroy();
        this.configModalContainer = undefined;
      }
      this.isConfigModalOpen = false;
      return;
    }

    this.isConfigModalOpen = true;
    const container = this.add.container(0, 0);
    container.setDepth(120).setScrollFactor(0);

    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x000000, 0.75);
    backdrop.fillRect(0, 0, 1024, 576);
    backdrop.setInteractive(new Phaser.Geom.Rectangle(0, 0, 1024, 576), Phaser.Geom.Rectangle.Contains);
    container.add(backdrop);

    const modalBg = this.add.graphics();
    modalBg.fillStyle(0x0a0f1d, 0.97);
    modalBg.fillRoundedRect(512 - 280, 80, 560, 410, 16);
    modalBg.lineStyle(3, 0x38bdf8, 1);
    modalBg.strokeRoundedRect(512 - 280, 80, 560, 410, 16);
    container.add(modalBg);

    const title = this.add.text(512, 115, '🕹️ ARCADE STICK BUTTON CONFIG', {
      fontFamily: 'impact, sans-serif',
      fontSize: '26px',
      color: '#38bdf8',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);
    container.add(title);

    const info = this.add.text(512, 145, '標準8ボタン アケコン（HORI / Qanba / Leverless / PS / Xbox）完全対応', {
      fontFamily: 'sans-serif',
      fontSize: '12px',
      color: '#94a3b8'
    }).setOrigin(0.5);
    container.add(info);

    // レイアウト解説
    const layoutText = this.add.text(512, 255,
      '【上段4ボタン】\n' +
      ' [弱P (LP / X)]   [中P (MP / Y)]   [強P (HP / RB)]   [インパクト (DI / LB)]\n' +
      '  Button 2         Button 3         Button 5 (RB)     Button 4 (LB)\n\n' +
      '【下段4ボタン】\n' +
      ' [弱K (LK / A)]   [中K (MK / B)]   [強K (HK / RT)]   [パリィ (DP / LT)]\n' +
      '  Button 0         Button 1         Button 7 (RT)     Button 6 (LT)\n\n' +
      '【SF6 特殊入力＆システム仕様】\n' +
      ' ・X + A (LP+LK) = つかみ・背負い投げ (ガード不能＆叩きつけ！)\n' +
      ' ・レバー ↙ (下後ろ) = しゃがみガード (完全静止＆青シールド防御)\n' +
      ' ・技の空振り・ガード時に明確な後隙 (硬直) が発生し差し返しが可能！\n' +
      ' ・Start (Btn 9) = リスタート  |  Select (Btn 8) = 2P CPU切替',
      {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#e2e8f0',
        align: 'center',
        lineSpacing: 5
      }
    ).setOrigin(0.5);
    container.add(layoutText);

    // デフォルトに戻すボタン
    const resetBtn = this.add.text(420, 440, '[ デフォルト配置にリセット ]', {
      fontFamily: 'impact, sans-serif',
      fontSize: '15px',
      color: '#facc15',
      backgroundColor: '#1e293b',
      padding: { x: 12, y: 6 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    resetBtn.on('pointerdown', () => {
      ArcadeControllerManager.getInstance().resetMapping();
      resetBtn.setText('✓ リセット完了！');
      this.time.delayedCall(1000, () => resetBtn.setText('[ デフォルト配置にリセット ]'));
    });
    container.add(resetBtn);

    // 閉じるボタン
    const closeBtn = this.add.text(610, 440, '[ 閉じる (B) ]', {
      fontFamily: 'impact, sans-serif',
      fontSize: '15px',
      color: '#f43f5e',
      backgroundColor: '#1e293b',
      padding: { x: 16, y: 6 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => {
      this.toggleButtonConfigModal();
    });
    container.add(closeBtn);

    this.configModalContainer = container;
  }

  // ★ 1Pキャラクター切り替え（クリック or [1]キー）
  public cycleP1Character(): void {
    this.p1CharIndex = (this.p1CharIndex + 1) % FIGHTER_ROSTER.length;
    const c = FIGHTER_ROSTER[this.p1CharIndex];
    this.player1.setCharacter(c.key, c.name, c.numColor, c.nativeFacing);
    this.p1NameText.setText(`1P : ${c.displayName} [1]`);
    this.p1NameText.setColor(c.color);
    this.showCharacterSwitchToast(`1P -> ${c.displayName}`, c.color);
  }

  // ★ 2Pキャラクター切り替え（クリック or [2]キー）
  public cycleP2Character(): void {
    this.p2CharIndex = (this.p2CharIndex + 1) % FIGHTER_ROSTER.length;
    const c = FIGHTER_ROSTER[this.p2CharIndex];
    this.player2.setCharacter(c.key, c.name, c.numColor, c.nativeFacing);
    const modeStr = this.player2.isCPU ? 'CPU' : 'MANUAL';
    this.p2NameText.setText(`2P : ${c.displayName} (${modeStr}) [2]`);
    this.p2NameText.setColor(c.color);
    this.showCharacterSwitchToast(`2P -> ${c.displayName}`, c.color);
  }

  private showCharacterSwitchToast(text: string, color: string): void {
    const toast = this.add.text(512, 115, `FIGHTER: ${text}`, {
      fontFamily: 'impact, sans-serif',
      fontSize: '24px',
      color: color,
      stroke: '#020617',
      strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0).setDepth(115);

    this.cameras.main.flash(100, 255, 255, 255, false);

    this.tweens.add({
      targets: toast,
      y: 90,
      alpha: 0,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 850,
      ease: 'Quad.easeOut',
      onComplete: () => toast.destroy()
    });
  }

  public hasActiveProjectile(owner: Fighter): boolean {
    return this.projectiles.some(p => p.owner === owner && p.isActive);
  }

  public spawnProjectile(owner: Fighter): void {
    const target = (owner === this.player1) ? this.player2 : this.player1;
    const dir = owner.attackFacing;
    const startX = dir === 'right' ? owner.x + 35 : owner.x - 35;
    const startY = owner.y - 12;

    const proj = new Projectile({
      scene: this,
      owner,
      target,
      x: startX,
      y: startY,
      direction: dir,
      speed: 760,
      damage: 45, // 弱パンチ（75）よりも控えめな牽制ダメージ
      textureKey: 'kunoichi_kunai'
    });
    this.projectiles.push(proj);
  }

  private toggleP2CPU(): void {
    this.player2.isCPU = !this.player2.isCPU;
    const modeStr = this.player2.isCPU ? 'CPU' : 'MANUAL';
    const p2Def = FIGHTER_ROSTER[this.p2CharIndex];
    this.p2NameText.setText(`2P : ${p2Def.displayName} (${modeStr}) [2]`);

    const notice = this.add.text(512, 115, `2P MODE: ${modeStr}`, {
      fontFamily: 'impact, sans-serif',
      fontSize: '22px',
      color: this.player2.isCPU ? '#f87171' : '#34d399'
    }).setOrigin(0.5);

    this.tweens.add({
      targets: notice,
      y: 95,
      alpha: 0,
      duration: 800,
      onComplete: () => notice.destroy()
    });
  }

  private toggleStage(): void {
    if (this.currentStage === 'cyber') {
      this.currentStage = 'classic';
      this.backgroundSprite.setTexture('classic_stage');
      this.backgroundSprite.setDisplaySize(1140, 640);
    } else {
      this.currentStage = 'cyber';
      this.backgroundSprite.setTexture('cyber_dojo');
      this.backgroundSprite.setDisplaySize(1140, 640);
    }
  }

  private createAnimations(): void {
    // Tomoe (Samurai)
    this.anims.create({ key: 'mack_idle', frames: this.anims.generateFrameNumbers('mack_idle', { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'mack_walk', frames: this.anims.generateFrameNumbers('mack_walk', { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'mack_run', frames: this.anims.generateFrameNumbers('mack_run', { start: 0, end: 5 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: 'mack_jump', frames: this.anims.generateFrameNumbers('mack_jump', { start: 0, end: 1 }), frameRate: 6, repeat: 0 });
    this.anims.create({ key: 'mack_fall', frames: this.anims.generateFrameNumbers('mack_fall', { start: 0, end: 1 }), frameRate: 6, repeat: 0 });
    this.anims.create({ key: 'mack_attack1', frames: this.anims.generateFrameNumbers('mack_attack1', { start: 0, end: 3 }), frameRate: 14, repeat: 0 });
    this.anims.create({ key: 'mack_attack2', frames: this.anims.generateFrameNumbers('mack_attack2', { start: 0, end: 5 }), frameRate: 14, repeat: 0 });
    this.anims.create({ key: 'mack_kick', frames: this.anims.generateFrameNumbers('mack_kick', { start: 0, end: 3 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: 'mack_impact', frames: this.anims.generateFrameNumbers('mack_impact', { start: 0, end: 3 }), frameRate: 10, repeat: 0 });
    this.anims.create({ key: 'mack_crouch', frames: this.anims.generateFrameNumbers('mack_crouch', { start: 0, end: 1 }), frameRate: 4, repeat: -1 });
    this.anims.create({ key: 'mack_crouch_walk', frames: this.anims.generateFrameNumbers('mack_crouch_walk', { start: 0, end: 5 }), frameRate: 7, repeat: -1 });
    this.anims.create({ key: 'mack_hit', frames: this.anims.generateFrameNumbers('mack_hit', { start: 0, end: 2 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: 'mack_death', frames: this.anims.generateFrameNumbers('mack_death', { start: 0, end: 5 }), frameRate: 8, repeat: 0 });

    // Kenji
    this.anims.create({ key: 'kenji_idle', frames: this.anims.generateFrameNumbers('kenji_idle', { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'kenji_run', frames: this.anims.generateFrameNumbers('kenji_run', { start: 0, end: 7 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: 'kenji_jump', frames: this.anims.generateFrameNumbers('kenji_jump', { start: 0, end: 1 }), frameRate: 6, repeat: 0 });
    this.anims.create({ key: 'kenji_fall', frames: this.anims.generateFrameNumbers('kenji_fall', { start: 0, end: 1 }), frameRate: 6, repeat: 0 });
    this.anims.create({ key: 'kenji_attack1', frames: this.anims.generateFrameNumbers('kenji_attack1', { start: 0, end: 3 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: 'kenji_attack2', frames: this.anims.generateFrameNumbers('kenji_attack2', { start: 0, end: 3 }), frameRate: 14, repeat: 0 });
    this.anims.create({ key: 'kenji_hit', frames: this.anims.generateFrameNumbers('kenji_hit', { start: 0, end: 2 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: 'kenji_death', frames: this.anims.generateFrameNumbers('kenji_death', { start: 0, end: 6 }), frameRate: 8, repeat: 0 });

    // Gladiator (Titus)
    this.anims.create({ key: 'gladiator_idle', frames: this.anims.generateFrameNumbers('gladiator_idle', { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'gladiator_run', frames: this.anims.generateFrameNumbers('gladiator_run', { start: 0, end: 7 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: 'gladiator_jump', frames: this.anims.generateFrameNumbers('gladiator_jump', { start: 0, end: 1 }), frameRate: 6, repeat: 0 });
    this.anims.create({ key: 'gladiator_fall', frames: this.anims.generateFrameNumbers('gladiator_fall', { start: 0, end: 1 }), frameRate: 6, repeat: 0 });
    this.anims.create({ key: 'gladiator_attack1', frames: this.anims.generateFrameNumbers('gladiator_attack1', { start: 0, end: 3 }), frameRate: 13, repeat: 0 });
    this.anims.create({ key: 'gladiator_attack2', frames: this.anims.generateFrameNumbers('gladiator_attack2', { start: 0, end: 5 }), frameRate: 14, repeat: 0 });
    this.anims.create({ key: 'gladiator_kick', frames: this.anims.generateFrameNumbers('gladiator_kick', { start: 0, end: 3 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: 'gladiator_impact', frames: this.anims.generateFrameNumbers('gladiator_impact', { start: 0, end: 3 }), frameRate: 10, repeat: 0 });
    this.anims.create({ key: 'gladiator_crouch', frames: this.anims.generateFrameNumbers('gladiator_crouch', { start: 0, end: 1 }), frameRate: 4, repeat: -1 });
    this.anims.create({ key: 'gladiator_hit', frames: this.anims.generateFrameNumbers('gladiator_hit', { start: 0, end: 2 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: 'gladiator_death', frames: this.anims.generateFrameNumbers('gladiator_death', { start: 0, end: 5 }), frameRate: 8, repeat: 0 });

    // Ayane (Valkyrie)
    this.anims.create({ key: 'ayane_idle', frames: this.anims.generateFrameNumbers('ayane_idle', { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'ayane_run', frames: this.anims.generateFrameNumbers('ayane_run', { start: 0, end: 7 }), frameRate: 11, repeat: -1 });
    this.anims.create({ key: 'ayane_jump', frames: this.anims.generateFrameNumbers('ayane_jump', { start: 0, end: 1 }), frameRate: 6, repeat: 0 });
    this.anims.create({ key: 'ayane_fall', frames: this.anims.generateFrameNumbers('ayane_fall', { start: 0, end: 1 }), frameRate: 6, repeat: 0 });
    this.anims.create({ key: 'ayane_attack1', frames: this.anims.generateFrameNumbers('ayane_attack1', { start: 0, end: 3 }), frameRate: 14, repeat: 0 });
    this.anims.create({ key: 'ayane_attack2', frames: this.anims.generateFrameNumbers('ayane_attack2', { start: 0, end: 5 }), frameRate: 15, repeat: 0 });
    this.anims.create({ key: 'ayane_kick', frames: this.anims.generateFrameNumbers('ayane_kick', { start: 0, end: 3 }), frameRate: 13, repeat: 0 });
    this.anims.create({ key: 'ayane_impact', frames: this.anims.generateFrameNumbers('ayane_impact', { start: 0, end: 3 }), frameRate: 10, repeat: 0 });
    this.anims.create({ key: 'ayane_crouch', frames: this.anims.generateFrameNumbers('ayane_crouch', { start: 0, end: 1 }), frameRate: 4, repeat: -1 });
    this.anims.create({ key: 'ayane_hit', frames: this.anims.generateFrameNumbers('ayane_hit', { start: 0, end: 2 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: 'ayane_death', frames: this.anims.generateFrameNumbers('ayane_death', { start: 0, end: 5 }), frameRate: 8, repeat: 0 });

    // Kaizer (Cyborg)
    this.anims.create({ key: 'kaizer_idle', frames: this.anims.generateFrameNumbers('kaizer_idle', { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'kaizer_run', frames: this.anims.generateFrameNumbers('kaizer_run', { start: 0, end: 7 }), frameRate: 9, repeat: -1 });
    this.anims.create({ key: 'kaizer_jump', frames: this.anims.generateFrameNumbers('kaizer_jump', { start: 0, end: 1 }), frameRate: 6, repeat: 0 });
    this.anims.create({ key: 'kaizer_fall', frames: this.anims.generateFrameNumbers('kaizer_fall', { start: 0, end: 1 }), frameRate: 6, repeat: 0 });
    this.anims.create({ key: 'kaizer_attack1', frames: this.anims.generateFrameNumbers('kaizer_attack1', { start: 0, end: 3 }), frameRate: 13, repeat: 0 });
    this.anims.create({ key: 'kaizer_attack2', frames: this.anims.generateFrameNumbers('kaizer_attack2', { start: 0, end: 5 }), frameRate: 13, repeat: 0 });
    this.anims.create({ key: 'kaizer_kick', frames: this.anims.generateFrameNumbers('kaizer_kick', { start: 0, end: 3 }), frameRate: 11, repeat: 0 });
    this.anims.create({ key: 'kaizer_impact', frames: this.anims.generateFrameNumbers('kaizer_impact', { start: 0, end: 3 }), frameRate: 9, repeat: 0 });
    this.anims.create({ key: 'kaizer_crouch', frames: this.anims.generateFrameNumbers('kaizer_crouch', { start: 0, end: 1 }), frameRate: 4, repeat: -1 });
    this.anims.create({ key: 'kaizer_hit', frames: this.anims.generateFrameNumbers('kaizer_hit', { start: 0, end: 2 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: 'kaizer_death', frames: this.anims.generateFrameNumbers('kaizer_death', { start: 0, end: 5 }), frameRate: 8, repeat: 0 });

    // Kunoichi (Kurenai)
    this.anims.create({ key: 'kunoichi_idle', frames: this.anims.generateFrameNumbers('kunoichi_idle', { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'kunoichi_walk', frames: this.anims.generateFrameNumbers('kunoichi_walk', { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'kunoichi_run', frames: this.anims.generateFrameNumbers('kunoichi_run', { start: 0, end: 5 }), frameRate: 11, repeat: -1 });
    this.anims.create({ key: 'kunoichi_jump', frames: this.anims.generateFrameNumbers('kunoichi_jump', { start: 0, end: 1 }), frameRate: 6, repeat: 0 });
    this.anims.create({ key: 'kunoichi_fall', frames: this.anims.generateFrameNumbers('kunoichi_fall', { start: 0, end: 1 }), frameRate: 6, repeat: 0 });
    this.anims.create({ key: 'kunoichi_attack1', frames: this.anims.generateFrameNumbers('kunoichi_attack1', { start: 0, end: 3 }), frameRate: 14, repeat: 0 });
    this.anims.create({ key: 'kunoichi_attack2', frames: this.anims.generateFrameNumbers('kunoichi_attack2', { start: 0, end: 3 }), frameRate: 14, repeat: 0 });
    this.anims.create({ key: 'kunoichi_kick', frames: this.anims.generateFrameNumbers('kunoichi_kick', { start: 0, end: 3 }), frameRate: 13, repeat: 0 });
    this.anims.create({ key: 'kunoichi_impact', frames: this.anims.generateFrameNumbers('kunoichi_impact', { start: 0, end: 3 }), frameRate: 10, repeat: 0 });
    this.anims.create({ key: 'kunoichi_crouch', frames: this.anims.generateFrameNumbers('kunoichi_crouch', { start: 0, end: 1 }), frameRate: 4, repeat: -1 });
    this.anims.create({ key: 'kunoichi_crouch_walk', frames: this.anims.generateFrameNumbers('kunoichi_crouch_walk', { start: 0, end: 5 }), frameRate: 7, repeat: -1 });
    this.anims.create({ key: 'kunoichi_hit', frames: this.anims.generateFrameNumbers('kunoichi_hit', { start: 0, end: 2 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: 'kunoichi_death', frames: this.anims.generateFrameNumbers('kunoichi_death', { start: 0, end: 5 }), frameRate: 8, repeat: 0 });
  }

  // ★ SF6 スタイル HUD
  private createSF6HUD(): void {
    this.hudGraphics = this.add.graphics();
    this.hudGraphics.setScrollFactor(0).setDepth(70);

    // 中央 SF6 タイマー数字
    this.timerText = this.add.text(512, 38, '99', {
      fontFamily: 'impact, sans-serif',
      fontSize: '34px',
      color: '#facc15',
      stroke: '#000000',
      strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0).setDepth(71);

    this.add.text(512, 14, 'ROUND 1', {
      fontFamily: 'impact, sans-serif',
      fontSize: '12px',
      color: '#94a3b8'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(71);

    // プレイヤーネーム（SF6グラフィティ調 & クリックまたは[1][2]キーで即時切替！）
    const p1Def = FIGHTER_ROSTER[this.p1CharIndex];
    this.p1NameText = this.add.text(42, 68, `1P : ${p1Def.displayName} [1]`, {
      fontFamily: 'impact, sans-serif',
      fontSize: '17px',
      color: p1Def.color,
      stroke: '#000000',
      strokeThickness: 3
    }).setScrollFactor(0).setDepth(71).setInteractive({ useHandCursor: true });
    this.p1NameText.on('pointerdown', () => this.cycleP1Character());

    const p2Def = FIGHTER_ROSTER[this.p2CharIndex];
    const p2Mode = this.player2.isCPU ? 'CPU' : 'MANUAL';
    this.p2NameText = this.add.text(982, 68, `2P : ${p2Def.displayName} (${p2Mode}) [2]`, {
      fontFamily: 'impact, sans-serif',
      fontSize: '17px',
      color: p2Def.color,
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(71).setInteractive({ useHandCursor: true });
    this.p2NameText.on('pointerdown', () => this.cycleP2Character());

    // アケコン接続ステータス表示（中央上部）
    this.controllerStatusText = this.add.text(512, 80, '🕹️ アケコン検知待機中 (ボタンを押すと認識)', {
      fontFamily: 'impact, sans-serif',
      fontSize: '14px',
      color: '#fbbf24',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setScrollFactor(0).setDepth(71);

    // 判定可視化バッジ（左）
    this.hitboxDebugText = this.add.text(340, 105, '[H] 判定: OFF', {
      fontFamily: 'impact, sans-serif',
      fontSize: '13px',
      color: '#94a3b8',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setScrollFactor(0).setDepth(71).setInteractive({ useHandCursor: true });
    this.hitboxDebugText.on('pointerdown', () => {
      this.toggleHitboxDebug();
    });

    // BGM ON/OFF トグルバッジ（中央）
    this.bgmStatusText = this.add.text(512, 105, '🎵 BGM: ON (Click)', {
      fontFamily: 'impact, sans-serif',
      fontSize: '13px',
      color: '#38bdf8',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setScrollFactor(0).setDepth(71).setInteractive({ useHandCursor: true });
    this.bgmStatusText.on('pointerdown', () => {
      const enabled = SoundManager.getInstance().toggleBGM();
      this.bgmStatusText.setText(enabled ? '🎵 BGM: ON (Click)' : '🔇 BGM: OFF (Click)');
      this.bgmStatusText.setColor(enabled ? '#38bdf8' : '#64748b');
    });

    // アケコンボタン設定バッジ（右）
    this.btnConfigText = this.add.text(684, 105, '[B] アケコン設定', {
      fontFamily: 'impact, sans-serif',
      fontSize: '13px',
      color: '#38bdf8',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setScrollFactor(0).setDepth(71).setInteractive({ useHandCursor: true });
    this.btnConfigText.on('pointerdown', () => {
      this.toggleButtonConfigModal();
    });

    // キャラセレクト画面へ遷移バッジ
    const selectBtn = this.add.text(840, 105, '[ESC] キャラセレクト', {
      fontFamily: 'impact, sans-serif',
      fontSize: '13px',
      color: '#c084fc',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setScrollFactor(0).setDepth(71).setInteractive({ useHandCursor: true });
    selectBtn.on('pointerdown', () => {
      this.scene.start('SelectScene');
    });

    // リアルタイム入力モニター（左下、SAゲージの上）
    const monitorBg = this.add.graphics();
    monitorBg.fillStyle(0x020617, 0.88);
    monitorBg.fillRoundedRect(35, 444, 285, 42, 6);
    monitorBg.lineStyle(1, 0x334155, 0.85);
    monitorBg.strokeRoundedRect(35, 444, 285, 42, 6);
    monitorBg.setScrollFactor(0).setDepth(71);

    this.add.text(42, 449, 'PAD', {
      fontFamily: 'impact, sans-serif',
      fontSize: '10px',
      color: '#64748b'
    }).setScrollFactor(0).setDepth(72);

    this.stickSymbolText = this.add.text(52, 467, '●', {
      fontFamily: 'sans-serif',
      fontSize: '16px',
      color: '#94a3b8'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(72);

    // 上段: LP(弱P), MP(中P), HP(強P), DI(インパクト), SA
    const topRow = [
      { id: 'LP', label: 'LP', x: 80, y: 454 },
      { id: 'MP', label: 'MP', x: 114, y: 454 },
      { id: 'HP', label: 'HP', x: 148, y: 454 },
      { id: 'DI', label: 'DI', x: 182, y: 454 },
      { id: 'SA', label: 'SA', x: 236, y: 454 }
    ];
    // 下段: LK(弱K), MK(中K), HK(強K), DP(パリィ), THROW(投げ)
    const botRow = [
      { id: 'LK', label: 'LK', x: 80, y: 472 },
      { id: 'MK', label: 'MK', x: 114, y: 472 },
      { id: 'HK', label: 'HK', x: 148, y: 472 },
      { id: 'DP', label: 'DP', x: 182, y: 472 },
      { id: 'THROW', label: 'THROW', x: 236, y: 472 }
    ];

    for (const item of [...topRow, ...botRow]) {
      const t = this.add.text(item.x, item.y, item.label, {
        fontFamily: 'impact, sans-serif',
        fontSize: item.id === 'THROW' ? '10px' : (item.id === 'SA' ? '12px' : '11px'),
        color: '#475569'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(72);
      this.buttonTexts.set(item.id, t);
    }

    // 操作ガイド（画面最下部：SF6ネオン風）
    const guideBg = this.add.graphics();
    guideBg.fillStyle(0x0a0f1d, 0.92);
    guideBg.fillRoundedRect(20, 526, 984, 44, 8);
    guideBg.lineStyle(2, 0xff007f, 0.9);
    guideBg.strokeRoundedRect(20, 526, 984, 44, 8);
    guideBg.setScrollFactor(0).setDepth(71);

    this.add.text(512, 537, '【アケコン】上段: X(弱P) Y(中P) RB(強P) LB(DI) | 下段: A(弱K) B(中K) RT(強K) LT(パリィ) | X+A: つかみ投げ | HP+HK: SA', {
      fontFamily: 'sans-serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#38bdf8'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(72);

    this.add.text(512, 555, '【キーボード】U:弱P I:中P O:強P P:DI | J:弱K K:中K L:強K Space:パリィ | U+J:つかみ || [1] 1P切替 [2] 2P切替 [B]設定 [H]判定 [C]CPU [R]再戦', {
      fontFamily: 'sans-serif',
      fontSize: '11px',
      color: '#e2e8f0'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(72);

    // ★ P1 コンボカウンターHUDコンテナ（左上）
    this.p1ComboContainer = this.add.container(90, 145);
    this.p1ComboContainer.setScrollFactor(0).setDepth(85).setVisible(false);

    const p1ComboBg = this.add.graphics();
    p1ComboBg.fillStyle(0x020617, 0.85);
    p1ComboBg.fillRoundedRect(0, 0, 195, 68, 8);
    p1ComboBg.lineStyle(2, 0x00f0ff, 1);
    p1ComboBg.strokeRoundedRect(0, 0, 195, 68, 8);

    this.p1ComboHitsText = this.add.text(12, 8, '2 HITS!', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '27px',
      color: '#facc15',
      stroke: '#0f172a',
      strokeThickness: 5
    });
    this.p1ComboDmgText = this.add.text(14, 40, 'DAMAGE: 1200', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '15px',
      color: '#00f0ff',
      stroke: '#0f172a',
      strokeThickness: 3
    });
    this.p1ComboContainer.add([p1ComboBg, this.p1ComboHitsText, this.p1ComboDmgText]);

    // ★ P2 コンボカウンターHUDコンテナ（右上）
    this.p2ComboContainer = this.add.container(739, 145);
    this.p2ComboContainer.setScrollFactor(0).setDepth(85).setVisible(false);

    const p2ComboBg = this.add.graphics();
    p2ComboBg.fillStyle(0x020617, 0.85);
    p2ComboBg.fillRoundedRect(0, 0, 195, 68, 8);
    p2ComboBg.lineStyle(2, 0xff007f, 1);
    p2ComboBg.strokeRoundedRect(0, 0, 195, 68, 8);

    this.p2ComboHitsText = this.add.text(183, 8, '2 HITS!', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '27px',
      color: '#facc15',
      stroke: '#0f172a',
      strokeThickness: 5
    }).setOrigin(1, 0);
    this.p2ComboDmgText = this.add.text(181, 40, 'DAMAGE: 1200', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '15px',
      color: '#ff007f',
      stroke: '#0f172a',
      strokeThickness: 3
    }).setOrigin(1, 0);
    this.p2ComboContainer.add([p2ComboBg, this.p2ComboHitsText, this.p2ComboDmgText]);
  }

  // ★ SF6 HUDの動的描画（毎フレーム更新）
  private renderSF6HUD(): void {
    this.hudGraphics.clear();

    // ----------------- 1. HPバー (P1 & P2) -----------------
    // P1枠
    this.hudGraphics.fillStyle(0x0f172a, 0.9);
    this.hudGraphics.fillRect(40, 20, 420, 26);
    this.hudGraphics.lineStyle(2, 0x475569, 1);
    this.hudGraphics.strokeRect(40, 20, 420, 26);

    // P1 HP
    const p1HpRatio = Math.max(0, this.player1.hp / this.player1.maxHp);
    const p1HpWidth = 414 * p1HpRatio;
    this.hudGraphics.fillStyle(p1HpRatio > 0.25 ? FIGHTER_ROSTER[this.p1CharIndex].numColor : 0xef4444, 1);
    this.hudGraphics.fillRect(43, 23, p1HpWidth, 20);

    // P2枠
    this.hudGraphics.fillStyle(0x0f172a, 0.9);
    this.hudGraphics.fillRect(564, 20, 420, 26);
    this.hudGraphics.lineStyle(2, 0x475569, 1);
    this.hudGraphics.strokeRect(564, 20, 420, 26);

    // P2 HP (右から左へ)
    const p2HpRatio = Math.max(0, this.player2.hp / this.player2.maxHp);
    const p2HpWidth = 414 * p2HpRatio;
    this.hudGraphics.fillStyle(p2HpRatio > 0.25 ? FIGHTER_ROSTER[this.p2CharIndex].numColor : 0xef4444, 1);
    this.hudGraphics.fillRect(981 - p2HpWidth, 23, p2HpWidth, 20);

    // ----------------- 2. ★ SF6 ドライブゲージ (6本ストック) -----------------
    // P1 ドライブゲージ (40〜460pxの間、幅66px x 6個)
    this.renderDriveStocks(40, 50, this.player1, false);
    // P2 ドライブゲージ (564〜984pxの間、幅66px x 6個、右詰)
    this.renderDriveStocks(564, 50, this.player2, true);

    // ----------------- 3. ★ SF6 スーパーアーツ (SA) ゲージ (画面下部) -----------------
    // P1 SAゲージ（左下）
    this.renderSAGauge(40, 492, this.player1, false);
    // P2 SAゲージ（右下）
    this.renderSAGauge(744, 492, this.player2, true);
  }

  // ドライブゲージの6本ストック描画
  private renderDriveStocks(startX: number, y: number, fighter: Fighter, isP2: boolean): void {
    const stockCount = 6;
    const stockWidth = 66;
    const stockHeight = 12;
    const gap = 4;

    for (let i = 0; i < stockCount; i++) {
      const idx = isP2 ? (stockCount - 1 - i) : i;
      const x = startX + i * (stockWidth + gap);

      // 枠線
      this.hudGraphics.fillStyle(0x0f172a, 0.85);
      this.hudGraphics.fillRect(x, y, stockWidth, stockHeight);
      this.hudGraphics.lineStyle(1, 0x334155, 1);
      this.hudGraphics.strokeRect(x, y, stockWidth, stockHeight);

      // ストック残量判定
      const stockFill = Math.max(0, Math.min(1, fighter.driveGauge - idx));
      if (stockFill > 0) {
        if (fighter.isBurnout) {
          // バーンアウト時は灰色
          this.hudGraphics.fillStyle(0x64748b, 0.9);
        } else {
          // 通常は鮮やかなエメラルドグリーン (SF6仕様)
          this.hudGraphics.fillStyle(0x22c55e, 1);
        }
        const currentW = (stockWidth - 2) * stockFill;
        const fillX = isP2 ? (x + stockWidth - 1 - currentW) : (x + 1);
        this.hudGraphics.fillRect(fillX, y + 1, currentW, stockHeight - 2);
      }
    }
  }

  // SAゲージ描画
  private renderSAGauge(x: number, y: number, fighter: Fighter, isP2: boolean): void {
    const width = 240;
    const height = 18;

    this.hudGraphics.fillStyle(0x0b0f19, 0.9);
    this.hudGraphics.fillRect(x, y, width, height);
    this.hudGraphics.lineStyle(2, 0xeab308, 0.9);
    this.hudGraphics.strokeRect(x, y, width, height);

    const ratio = Math.max(0, Math.min(1, fighter.saGauge / fighter.maxSaGauge));
    const fillW = (width - 4) * ratio;

    // ゴールド・オレンジグラデーション風
    this.hudGraphics.fillStyle(0xf59e0b, 1);
    const fillX = isP2 ? (x + width - 2 - fillW) : (x + 2);
    this.hudGraphics.fillRect(fillX, y + 2, fillW, height - 4);
  }

  // 開始演出：ROUND 1, FIGHT!
  private createRoundStartVisual(): void {
    const rText = this.add.text(512, 240, 'ROUND 1', {
      fontFamily: 'impact, sans-serif',
      fontSize: '64px',
      color: '#facc15',
      stroke: '#000000',
      strokeThickness: 8,
      shadow: { offsetX: 0, offsetY: 0, color: '#f59e0b', blur: 30, fill: true, stroke: true }
    }).setOrigin(0.5);

    this.tweens.add({
      targets: rText,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 700,
      onComplete: () => {
        rText.setText('FIGHT!!');
        rText.setColor('#ff007f');
        this.cameras.main.flash(120, 255, 0, 128);
        this.tweens.add({
          targets: rText,
          scaleX: 1.6,
          scaleY: 1.6,
          alpha: 0,
          duration: 600,
          onComplete: () => rText.destroy()
        });
      }
    });
  }

  private handleKO(loser: Fighter): void {
    if (this.isGameOver) return;
    this.isGameOver = true;

    SoundManager.getInstance().playKO();

    const winnerDef = loser.fighterId === 'p1' ? FIGHTER_ROSTER[this.p2CharIndex] : FIGHTER_ROSTER[this.p1CharIndex];
    const winnerTag = loser.fighterId === 'p1' ? '2P' : '1P';
    const winnerName = `${winnerTag}: ${winnerDef.name}`;
    const winnerColor = winnerDef.color;

    this.koOverlay = this.add.container(512, 230);
    this.koOverlay.setScrollFactor(0).setDepth(100);

    const koText = this.add.text(0, -25, 'K. O.', {
      fontFamily: 'impact, sans-serif',
      fontSize: '88px',
      fontStyle: 'italic',
      color: '#ff0055',
      stroke: '#ffffff',
      strokeThickness: 8,
      shadow: { offsetX: 0, offsetY: 0, color: '#ff007f', blur: 35, stroke: true, fill: true }
    }).setOrigin(0.5);

    const winText = this.add.text(0, 60, `${winnerName} WINS!`, {
      fontFamily: 'impact, sans-serif',
      fontSize: '38px',
      color: winnerColor,
      stroke: '#000000',
      strokeThickness: 6
    }).setOrigin(0.5);

    const restartText = this.add.text(0, 115, 'Press [R] to Rematch', {
      fontFamily: 'sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#facc15'
    }).setOrigin(0.5);

    this.koOverlay.add([koText, winText, restartText]);

    this.koOverlay.setScale(0.2);
    this.koOverlay.setAlpha(0);
    this.tweens.add({
      targets: this.koOverlay,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 350,
      ease: 'Back.easeOut'
    });

    this.cameras.main.flash(200, 255, 255, 255);
  }

  private handleTimeOver(): void {
    if (this.isGameOver) return;
    this.isGameOver = true;

    let winner = 'DRAW';
    if (this.player1.hp > this.player2.hp) winner = `1P: ${FIGHTER_ROSTER[this.p1CharIndex].name} WINS!`;
    else if (this.player2.hp > this.player1.hp) winner = `2P: ${FIGHTER_ROSTER[this.p2CharIndex].name} WINS!`;

    const toText = this.add.text(512, 240, `TIME UP!\n${winner}`, {
      fontFamily: 'impact, sans-serif',
      fontSize: '48px',
      align: 'center',
      color: '#facc15',
      stroke: '#000000',
      strokeThickness: 6
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100);

    this.add.text(512, 340, 'Press [R] to Rematch', {
      fontFamily: 'sans-serif',
      fontSize: '18px',
      color: '#ffffff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100);
  }

  // ★ ダイナミックバトルカメラ制御（距離による微ズーム＆中心追従）
  private updateBattleCamera(): void {
    if (!this.player1 || !this.player2) return;

    const midX = (this.player1.x + this.player2.x) / 2;
    const midY = (this.player1.y + this.player2.y) / 2;
    const dist = Math.abs(this.player1.x - this.player2.x);

    // 近接時は迫力の1.05倍ズーム、離れると1.0倍
    const targetZoom = dist < 320 ? 1.05 : (dist > 650 ? 1.0 : 1.0 + (1 - (dist - 320) / 330) * 0.05);
    const clampedZoom = Phaser.Math.Clamp(targetZoom, 1.0, 1.05);
    this.cameras.main.zoom = Phaser.Math.Linear(this.cameras.main.zoom, clampedZoom, 0.05);

    // 中心追従（ステージ背景の範囲内に収まるようクランプ）
    const targetScrollX = Phaser.Math.Clamp(midX - 512, -40, 40);
    const targetScrollY = Phaser.Math.Clamp(midY - 410, -25, 20);
    this.cameras.main.scrollX = Phaser.Math.Linear(this.cameras.main.scrollX, targetScrollX, 0.05);
    this.cameras.main.scrollY = Phaser.Math.Linear(this.cameras.main.scrollY, targetScrollY, 0.05);
  }

  // ★ SF6風 コンボカウンターHUD表示
  private showComboDisplay(attacker: Fighter, hits: number, damage: number): void {
    if (hits < 2) return;

    const isP1 = attacker === this.player1;
    const container = isP1 ? this.p1ComboContainer : this.p2ComboContainer;
    const hitsText = isP1 ? this.p1ComboHitsText : this.p2ComboHitsText;
    const dmgText = isP1 ? this.p1ComboDmgText : this.p2ComboDmgText;

    hitsText.setText(`${hits} HITS!`);
    dmgText.setText(`DAMAGE: ${Math.floor(damage)}`);

    container.setVisible(true);
    container.setAlpha(1);
    container.setScale(1.35);

    this.tweens.add({
      targets: container,
      scaleX: 1.0,
      scaleY: 1.0,
      duration: 110,
      ease: 'Back.easeOut'
    });

    if (isP1) {
      if (this.p1ComboTimer) this.p1ComboTimer.remove();
      this.p1ComboTimer = this.time.delayedCall(850, () => {
        this.tweens.add({
          targets: this.p1ComboContainer,
          alpha: 0,
          y: 130,
          duration: 250,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            this.p1ComboContainer.setVisible(false);
            this.p1ComboContainer.y = 145;
          }
        });
      });
    } else {
      if (this.p2ComboTimer) this.p2ComboTimer.remove();
      this.p2ComboTimer = this.time.delayedCall(850, () => {
        this.tweens.add({
          targets: this.p2ComboContainer,
          alpha: 0,
          y: 130,
          duration: 250,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            this.p2ComboContainer.setVisible(false);
            this.p2ComboContainer.y = 145;
          }
        });
      });
    }
  }
}
