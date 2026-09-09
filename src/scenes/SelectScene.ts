import Phaser from 'phaser';
import { FIGHTER_ROSTER } from './GameScene';
import { SoundManager } from '../utils/SoundManager';
import { CHARACTER_SCALE_PROFILES } from '../objects/Fighter';

interface CharacterBio {
  role: string;
  style: string;
  special: string;
  speed: string;
  power: string;
}

const BIOS: Record<string, CharacterBio> = {
  mack: {
    role: '居合抜刀剣士 (Samurai)',
    style: '素早い間合い管理と鋭利な抜刀術',
    special: '居合一閃 (Attack1) / 二天唐竹割り (Attack2)',
    speed: '★★★★☆',
    power: '★★★☆☆',
  },
  gladiator: {
    role: '重装グラディエーター (Gladiator)',
    style: '圧倒的アーマー耐久と破壊的豪腕',
    special: 'スパルタンキック (Kick) / メガトン打撃 (Attack2)',
    speed: '★★☆☆☆',
    power: '★★★★★',
  },
  kotaro: {
    role: '魔導術士 (Arcane Mage)',
    style: '【中遠距離】青水晶の魔導弾と空間制圧の秘術バースト',
    special: '魔導弾 (Attack1) / エーテルバースト (Attack2) / 秘術障壁 (Impact)',
    speed: '★★★☆☆',
    power: '★★★★☆',
  },
  ayane: {
    role: '戦乙女・武闘家 (Valkyrie)',
    style: '華麗な空中機動と百裂キックコンボ',
    special: 'サマーソルトキック (Kick) / 鳳凰旋風掌 (Attack2)',
    speed: '★★★★☆',
    power: '★★★★☆',
  },
  kaizer: {
    role: 'サイボーグ重装兵 (Cyborg)',
    style: 'バーニア推進力と高出力プラズマ兵装',
    special: 'ロケットピストン (Attack1) / プラズマハンマー (Attack2)',
    speed: '★★★☆☆',
    power: '★★★★★',
  },
  kunoichi: {
    role: '紫影のくのいち (Kunoichi) ★新登場',
    style: '【飛び道具】遠距離クナイ投擲と機動力のハイブリッド',
    special: '苦無投擲 (Attack2/HP) / 苦無斬撃 (Attack1) / 旋風脚 (Kick)',
    speed: '★★★★★',
    power: '★★★★☆',
  }
};

export class SelectScene extends Phaser.Scene {
  private p1Index: number = 0;
  private p2Index: number = 5; // デフォルトで新キャラKunoichiと対戦！
  private isP2CPU: boolean = true;
  private currentStage: 'cyber' | 'classic' = 'cyber';

  private p1Sprite!: Phaser.GameObjects.Sprite;
  private p2Sprite!: Phaser.GameObjects.Sprite;

  private p1NameText!: Phaser.GameObjects.Text;
  private p1RoleText!: Phaser.GameObjects.Text;
  private p1StyleText!: Phaser.GameObjects.Text;
  private p1SpecialText!: Phaser.GameObjects.Text;
  private p1StatsText!: Phaser.GameObjects.Text;

  private p2NameText!: Phaser.GameObjects.Text;
  private p2RoleText!: Phaser.GameObjects.Text;
  private p2StyleText!: Phaser.GameObjects.Text;
  private p2SpecialText!: Phaser.GameObjects.Text;
  private p2StatsText!: Phaser.GameObjects.Text;

  private p2ModeBtn!: Phaser.GameObjects.Text;
  private stageBtn!: Phaser.GameObjects.Text;

  private cardContainers: Phaser.GameObjects.Container[] = [];
  private p1CursorBox!: Phaser.GameObjects.Graphics;
  private p2CursorBox!: Phaser.GameObjects.Graphics;

  constructor() {
    super('SelectScene');
  }

  public preload(): void {
    // 背景
    this.load.image('cyber_dojo', '/assets/cyber_dojo.jpg');
    this.load.image('classic_stage', '/assets/background.png');

    // 立ち構えアニメ用スプライトシート
    this.load.spritesheet('mack_idle', '/assets/samuraiMack/Idle.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('gladiator_idle', '/assets/gladiator/Idle.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kotaro_idle', '/assets/kotaro/Idle.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('ayane_idle', '/assets/ayane/Idle.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kaizer_idle', '/assets/kaizer/Idle.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('kunoichi_idle', '/assets/kunoichi/Idle.png', { frameWidth: 200, frameHeight: 200 });
  }

  public create(): void {
    // アニメーション登録（未登録の場合のみ）
    if (!this.anims.exists('mack_idle')) {
      this.anims.create({ key: 'mack_idle', frames: this.anims.generateFrameNumbers('mack_idle', { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
    }
    if (!this.anims.exists('gladiator_idle')) {
      this.anims.create({ key: 'gladiator_idle', frames: this.anims.generateFrameNumbers('gladiator_idle', { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
    }
    if (!this.anims.exists('kotaro_idle')) {
      this.anims.create({ key: 'kotaro_idle', frames: this.anims.generateFrameNumbers('kotaro_idle', { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
    }
    if (!this.anims.exists('ayane_idle')) {
      this.anims.create({ key: 'ayane_idle', frames: this.anims.generateFrameNumbers('ayane_idle', { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
    }
    if (!this.anims.exists('kaizer_idle')) {
      this.anims.create({ key: 'kaizer_idle', frames: this.anims.generateFrameNumbers('kaizer_idle', { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
    }
    if (!this.anims.exists('kunoichi_idle')) {
      this.anims.create({ key: 'kunoichi_idle', frames: this.anims.generateFrameNumbers('kunoichi_idle', { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
    }

    // 1. 背景（サイバー道場）＋ ダークオーバーレイ
    const bg = this.add.image(512, 288, this.currentStage === 'cyber' ? 'cyber_dojo' : 'classic_stage');
    bg.setDisplaySize(1024, 576);
    bg.setTint(0x475569);

    const overlay = this.add.graphics();
    overlay.fillStyle(0x090d16, 0.78);
    overlay.fillRect(0, 0, 1024, 576);

    // 2. タイトルヘッダー
    const title = this.add.text(512, 34, 'STREET STRIKER', {
      fontFamily: 'impact, sans-serif',
      fontSize: '38px',
      color: '#facc15',
      stroke: '#000000',
      strokeThickness: 6
    }).setOrigin(0.5);

    this.tweens.add({
      targets: title,
      scaleX: 1.03,
      scaleY: 1.03,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.add.text(512, 66, '— SELECT YOUR FIGHTER —', {
      fontFamily: 'impact, sans-serif',
      fontSize: '16px',
      color: '#00f0ff'
    }).setOrigin(0.5);

    // 3. 1P プレビューパネル（左側）
    this.createP1Preview();

    // 4. 2P プレビューパネル（右側）
    this.createP2Preview();

    // 5. 中央 キャラクター選択グリッド (2行 × 3列)
    this.createRosterGrid();

    // 6. 下部 ステージ & CPU切り替え & スタートボタン
    this.createBottomBar();

    // 7. キー入力受付
    this.setupInputs();

    // 初期プレビュー表示更新
    this.updatePreview();
  }

  private createP1Preview(): void {
    const bg = this.add.graphics();
    bg.fillStyle(0x0f172a, 0.88);
    bg.fillRoundedRect(30, 92, 230, 400, 10);
    bg.lineStyle(2, 0x00f0ff, 0.85);
    bg.strokeRoundedRect(30, 92, 230, 400, 10);

    this.add.text(45, 104, '1P FIGHTER', {
      fontFamily: 'impact, sans-serif',
      fontSize: '18px',
      color: '#00f0ff'
    });

    // 1P キャラクタースプライト
    this.p1Sprite = this.add.sprite(145, 235, 'mack_idle');
    this.p1Sprite.setScale(2.1);

    // 情報テキスト
    this.p1NameText = this.add.text(145, 305, '', {
      fontFamily: 'impact, sans-serif',
      fontSize: '22px',
      color: '#00f0ff',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    this.p1RoleText = this.add.text(145, 335, '', {
      fontFamily: 'sans-serif',
      fontSize: '12px',
      color: '#facc15',
      align: 'center',
      wordWrap: { width: 210 }
    }).setOrigin(0.5);

    this.p1StyleText = this.add.text(145, 375, '', {
      fontFamily: 'sans-serif',
      fontSize: '11px',
      color: '#94a3b8',
      align: 'center',
      wordWrap: { width: 210 }
    }).setOrigin(0.5);

    this.p1SpecialText = this.add.text(145, 425, '', {
      fontFamily: 'sans-serif',
      fontSize: '11px',
      color: '#c084fc',
      align: 'center',
      wordWrap: { width: 210 }
    }).setOrigin(0.5);

    this.p1StatsText = this.add.text(145, 465, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#38bdf8',
      align: 'center'
    }).setOrigin(0.5);
  }

  private createP2Preview(): void {
    const bg = this.add.graphics();
    bg.fillStyle(0x0f172a, 0.88);
    bg.fillRoundedRect(764, 92, 230, 400, 10);
    bg.lineStyle(2, 0xef4444, 0.85);
    bg.strokeRoundedRect(764, 92, 230, 400, 10);

    this.add.text(779, 104, '2P FIGHTER', {
      fontFamily: 'impact, sans-serif',
      fontSize: '18px',
      color: '#ef4444'
    });

    // 2P キャラクタースプライト
    this.p2Sprite = this.add.sprite(879, 235, 'kunoichi_idle');
    this.p2Sprite.setScale(2.1);
    this.p2Sprite.setFlipX(true);

    // 情報テキスト
    this.p2NameText = this.add.text(879, 305, '', {
      fontFamily: 'impact, sans-serif',
      fontSize: '22px',
      color: '#ef4444',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    this.p2RoleText = this.add.text(879, 335, '', {
      fontFamily: 'sans-serif',
      fontSize: '12px',
      color: '#facc15',
      align: 'center',
      wordWrap: { width: 210 }
    }).setOrigin(0.5);

    this.p2StyleText = this.add.text(879, 375, '', {
      fontFamily: 'sans-serif',
      fontSize: '11px',
      color: '#94a3b8',
      align: 'center',
      wordWrap: { width: 210 }
    }).setOrigin(0.5);

    this.p2SpecialText = this.add.text(879, 425, '', {
      fontFamily: 'sans-serif',
      fontSize: '11px',
      color: '#c084fc',
      align: 'center',
      wordWrap: { width: 210 }
    }).setOrigin(0.5);

    this.p2StatsText = this.add.text(879, 465, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#38bdf8',
      align: 'center'
    }).setOrigin(0.5);
  }

  private createRosterGrid(): void {
    const startX = 295;
    const startY = 100;
    const cardW = 135;
    const cardH = 175;
    const gapX = 14;
    const gapY = 16;

    this.cardContainers = [];

    FIGHTER_ROSTER.forEach((fighter, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);

      const container = this.add.container(x, y);

      // カード背景
      const cardBg = this.add.graphics();
      cardBg.fillStyle(0x1e293b, 0.92);
      cardBg.fillRoundedRect(0, 0, cardW, cardH, 8);
      cardBg.lineStyle(2, fighter.numColor, 0.75);
      cardBg.strokeRoundedRect(0, 0, cardW, cardH, 8);
      container.add(cardBg);

      // サムネイル用スプライト（中央）
      const thumbKey = `${fighter.key}_idle`;
      const thumb = this.add.sprite(cardW / 2, 75, thumbKey, 0);
      const profile = CHARACTER_SCALE_PROFILES[fighter.key] || CHARACTER_SCALE_PROFILES['mack'];
      thumb.setScale(1.2 * (profile.scale / 2.8));
      if (fighter.nativeFacing === 'left') {
        thumb.setFlipX(true);
      }
      container.add(thumb);

      // キャラ名
      const name = this.add.text(cardW / 2, 134, fighter.name, {
        fontFamily: 'impact, sans-serif',
        fontSize: '16px',
        color: fighter.color,
        stroke: '#000000',
        strokeThickness: 3
      }).setOrigin(0.5);
      container.add(name);

      // 特徴バッジ
      const badgeText = idx === 5 ? '★飛び道具' : (idx === 0 ? '抜刀剣士' : (idx === 1 ? '重装甲' : (idx === 2 ? '★遠距離魔法' : (idx === 3 ? '神速蹴技' : 'プラズマ'))));
      const badge = this.add.text(cardW / 2, 154, badgeText, {
        fontFamily: 'sans-serif',
        fontSize: '10px',
        color: (idx === 5 || idx === 2) ? '#facc15' : '#94a3b8'
      }).setOrigin(0.5);
      container.add(badge);

      // インタラクティブ設定（クリックで選択）
      cardBg.setInteractive(new Phaser.Geom.Rectangle(0, 0, cardW, cardH), Phaser.Geom.Rectangle.Contains);
      cardBg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.rightButtonDown() || pointer.event.shiftKey) {
          this.p2Index = idx;
        } else {
          this.p1Index = idx;
        }
        SoundManager.getInstance().playSwing(false);
        this.updatePreview();
      });

      this.cardContainers.push(container);
    });

    // 1P カーソル枠 (Cyan)
    this.p1CursorBox = this.add.graphics();
    this.p1CursorBox.setDepth(20);

    // 2P カーソル枠 (Red)
    this.p2CursorBox = this.add.graphics();
    this.p2CursorBox.setDepth(21);
  }

  private createBottomBar(): void {
    // 2P CPU切り替えボタン
    this.p2ModeBtn = this.add.text(370, 490, `[C] 2P MODE: ${this.isP2CPU ? 'CPU (BOT)' : '2P MANUAL'}`, {
      fontFamily: 'impact, sans-serif',
      fontSize: '15px',
      color: this.isP2CPU ? '#f87171' : '#34d399',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.p2ModeBtn.on('pointerdown', () => {
      this.toggleP2Mode();
    });

    // ステージ切り替えボタン
    this.stageBtn = this.add.text(654, 490, `[T] STAGE: ${this.currentStage === 'cyber' ? 'CYBER DOJO' : 'CLASSIC DOJO'}`, {
      fontFamily: 'impact, sans-serif',
      fontSize: '15px',
      color: '#38bdf8',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.stageBtn.on('pointerdown', () => {
      this.toggleStage();
    });

    // START BATTLE ボタン（中央下部）
    const startBtnBg = this.add.graphics();
    startBtnBg.fillStyle(0x0284c7, 0.95);
    startBtnBg.fillRoundedRect(362, 520, 300, 44, 8);
    startBtnBg.lineStyle(2, 0x38bdf8, 1);
    startBtnBg.strokeRoundedRect(362, 520, 300, 44, 8);

    const startBtn = this.add.text(512, 542, '⚔️ START BATTLE [SPACE / ENTER] ⚔️', {
      fontFamily: 'impact, sans-serif',
      fontSize: '17px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    startBtn.on('pointerdown', () => {
      this.startBattle();
    });

    this.tweens.add({
      targets: [startBtnBg, startBtn],
      scaleX: 1.02,
      scaleY: 1.02,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  private setupInputs(): void {
    if (!this.input.keyboard) return;

    // 1P 移動: A / D
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A).on('down', () => {
      this.p1Index = (this.p1Index - 1 + FIGHTER_ROSTER.length) % FIGHTER_ROSTER.length;
      SoundManager.getInstance().playSwing(false);
      this.updatePreview();
    });

    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D).on('down', () => {
      this.p1Index = (this.p1Index + 1) % FIGHTER_ROSTER.length;
      SoundManager.getInstance().playSwing(false);
      this.updatePreview();
    });

    // 2P 移動: LEFT / RIGHT
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT).on('down', () => {
      this.p2Index = (this.p2Index - 1 + FIGHTER_ROSTER.length) % FIGHTER_ROSTER.length;
      SoundManager.getInstance().playSwing(false);
      this.updatePreview();
    });

    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT).on('down', () => {
      this.p2Index = (this.p2Index + 1) % FIGHTER_ROSTER.length;
      SoundManager.getInstance().playSwing(false);
      this.updatePreview();
    });

    // C: CPU切替
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C).on('down', () => {
      this.toggleP2Mode();
    });

    // T: ステージ切替
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T).on('down', () => {
      this.toggleStage();
    });

    // SPACE / ENTER: 対戦開始
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE).on('down', () => {
      this.startBattle();
    });
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER).on('down', () => {
      this.startBattle();
    });
  }

  private toggleP2Mode(): void {
    this.isP2CPU = !this.isP2CPU;
    this.p2ModeBtn.setText(`[C] 2P MODE: ${this.isP2CPU ? 'CPU (BOT)' : '2P MANUAL'}`);
    this.p2ModeBtn.setColor(this.isP2CPU ? '#f87171' : '#34d399');
    SoundManager.getInstance().playGuard();
  }

  private toggleStage(): void {
    this.currentStage = this.currentStage === 'cyber' ? 'classic' : 'cyber';
    this.stageBtn.setText(`[T] STAGE: ${this.currentStage === 'cyber' ? 'CYBER DOJO' : 'CLASSIC DOJO'}`);
    SoundManager.getInstance().playParry();
  }

  private updatePreview(): void {
    const p1 = FIGHTER_ROSTER[this.p1Index];
    const p2 = FIGHTER_ROSTER[this.p2Index];
    const b1 = BIOS[p1.key] || { role: '', style: '', special: '', speed: '', power: '' };
    const b2 = BIOS[p2.key] || { role: '', style: '', special: '', speed: '', power: '' };

    // 1P 表示更新
    this.p1NameText.setText(p1.displayName);
    this.p1NameText.setColor(p1.color);
    this.p1RoleText.setText(b1.role);
    this.p1StyleText.setText(b1.style);
    this.p1SpecialText.setText(`技: ${b1.special}`);
    this.p1StatsText.setText(`SPEED: ${b1.speed}  POWER: ${b1.power}`);

    // 1P スケール & 接地整列（全キャラクターの身長を統一）
    const p1Profile = CHARACTER_SCALE_PROFILES[p1.key] || CHARACTER_SCALE_PROFILES['mack'];
    this.p1Sprite.setScale(p1Profile.previewScale);
    this.p1Sprite.y = 296 - (p1Profile.feetY - 100) * p1Profile.previewScale;
    this.p1Sprite.play(`${p1.key}_idle`, true);
    if (p1.nativeFacing === 'left') {
      this.p1Sprite.setFlipX(true);
    } else {
      this.p1Sprite.setFlipX(false);
    }

    // 2P 表示更新
    this.p2NameText.setText(p2.displayName);
    this.p2NameText.setColor(p2.color);
    this.p2RoleText.setText(b2.role);
    this.p2StyleText.setText(b2.style);
    this.p2SpecialText.setText(`技: ${b2.special}`);
    this.p2StatsText.setText(`SPEED: ${b2.speed}  POWER: ${b2.power}`);

    // 2P スケール & 接地整列（全キャラクターの身長を統一）
    const p2Profile = CHARACTER_SCALE_PROFILES[p2.key] || CHARACTER_SCALE_PROFILES['mack'];
    this.p2Sprite.setScale(p2Profile.previewScale);
    this.p2Sprite.y = 296 - (p2Profile.feetY - 100) * p2Profile.previewScale;
    this.p2Sprite.play(`${p2.key}_idle`, true);
    if (p2.nativeFacing === 'left') {
      this.p2Sprite.setFlipX(false);
    } else {
      this.p2Sprite.setFlipX(true); // 向かい合わせ
    }

    // カーソル描画
    this.drawCursors();
  }

  private drawCursors(): void {
    const startX = 295;
    const startY = 100;
    const cardW = 135;
    const cardH = 175;
    const gapX = 14;
    const gapY = 16;

    // 1P カーソル (Cyan枠)
    this.p1CursorBox.clear();
    const c1Col = this.p1Index % 3;
    const c1Row = Math.floor(this.p1Index / 3);
    const x1 = startX + c1Col * (cardW + gapX);
    const y1 = startY + c1Row * (cardH + gapY);

    this.p1CursorBox.lineStyle(4, 0x00f0ff, 1);
    this.p1CursorBox.strokeRoundedRect(x1 - 4, y1 - 4, cardW + 8, cardH + 8, 10);
    this.p1CursorBox.fillStyle(0x00f0ff, 0.95);
    this.p1CursorBox.fillRoundedRect(x1, y1 - 18, 38, 18, 4);

    // 2P カーソル (Red枠)
    this.p2CursorBox.clear();
    const c2Col = this.p2Index % 3;
    const c2Row = Math.floor(this.p2Index / 3);
    const x2 = startX + c2Col * (cardW + gapX);
    const y2 = startY + c2Row * (cardH + gapY);

    this.p2CursorBox.lineStyle(4, 0xef4444, 1);
    this.p2CursorBox.strokeRoundedRect(x2 - 4, y2 - 4, cardW + 8, cardH + 8, 10);
    this.p2CursorBox.fillStyle(0xef4444, 0.95);
    this.p2CursorBox.fillRoundedRect(x2 + cardW - 38, y2 - 18, 38, 18, 4);
  }

  private startBattle(): void {
    SoundManager.getInstance().playHit('heavy');
    SoundManager.getInstance().startBGM();

    this.cameras.main.flash(200, 255, 255, 255);
    this.time.delayedCall(150, () => {
      this.scene.start('GameScene', {
        p1Index: this.p1Index,
        p2Index: this.p2Index,
        stage: this.currentStage,
        isP2CPU: this.isP2CPU
      });
    });
  }
}
