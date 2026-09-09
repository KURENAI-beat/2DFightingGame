import Phaser from 'phaser';
import { FighterControls, FighterConfig, FighterState, AttackKind } from '../types/fighter';
import { ArcadeControllerManager } from '../utils/ArcadeControllerManager';
import { SoundManager } from '../utils/SoundManager';

export class Fighter extends Phaser.Physics.Arcade.Sprite {
  public fighterId: string;
  public fighterName: string;
  public themeColor: number;
  private downAltKey?: Phaser.Input.Keyboard.Key;

  // HPシステム
  public hp: number = 100;
  public maxHp: number = 100;
  public isDead: boolean = false;
  public currentState: FighterState = 'idle';

  // ★ SF6 ドライブシステム
  public driveGauge: number = 6.0; // 最大6.0本
  public maxDriveGauge: number = 6.0;
  public isBurnout: boolean = false;
  private burnoutEndTime: number = 0;
  public isParrying: boolean = false;
  private parryStartTime: number = 0;

  // ★ SF6 スーパーアーツ (SA) システム
  public saGauge: number = 100; // 初期1本分(最大300)
  public maxSaGauge: number = 300;

  // ★ ドライブインパクト (アーマー)
  public isImpact: boolean = false;
  public armorHitsLeft: number = 0;
  public isCrumpled: boolean = false; // 膝崩れダウン中

  // ガード・しゃがみ
  public isGuarding: boolean = false;
  public isCrouching: boolean = false;
  public isCrouchWalking: boolean = false;
  public isDashing: boolean = false;
  private lastForwardTapTime: number = 0;

  // 元画像のスプライトの向き & 現在の攻撃向き
  private nativeFacing: 'left' | 'right' = 'right';
  public attackFacing: 'left' | 'right' = 'right';

  // 無敵フラグ & 攻撃状態
  public isInvincible: boolean = false;
  public isAttacking: boolean = false;
  private currentAttackKind: AttackKind = 'stand_jab';
  private hasDealtDamageThisAttack: boolean = false;
  private isStunned: boolean = false;
  private canAttackTime: number = 0;
  private attackSafetyTimer?: Phaser.Time.TimerEvent;

  // 技の後隙（硬直・差し返し猶予） & 投げ先行入力バッファ
  public isRecovering: boolean = false;
  public recoveryEndTime: number = 0;
  private attackStartTime: number = 0;
  private lastLpDownTime: number = 0;
  private lastLkDownTime: number = 0;

  // ★ 技連打ハメ防止システム (Anti-Spam & Damage Scaling)
  public lastAttackKind: AttackKind | null = null;
  public sameMoveHitCount: number = 0;
  public sameMoveSpamCount: number = 0;

  // ★ 残像シャドウ演出 (Ghost Trail)
  private ghostTrailTimer: number = 0;

  // ★ ヒットストップ（肉体衝突フリーズ）
  public hitstopUntil: number = 0;
  public isHitstopped: boolean = false;
  private postHitstopVelocityX: number = 0;
  private postHitstopVelocityY: number = 0;

  // ★ 連続コンボシステム
  public currentComboCount: number = 0;
  public currentComboDamage: number = 0;
  private lastComboHitTime: number = 0;

  // ★ 接地状態追跡（着地砂煙用）
  private wasGrounded: boolean = true;
  private stepDustCounter: number = 0;

  public isCPU: boolean = false;
  private controls?: FighterControls;
  private spriteKey: string;

  // キャラクタースケール
  private readonly baseScale: number = 2.8;

  // 移動速度
  private readonly forwardSpeed: number = 165;
  private readonly retreatSpeed: number = 130;
  private readonly jumpPower: number = 720;
  private opponent?: Fighter;

  // パリィ・オーラ描画用グラフィックス
  private auraGraphics!: Phaser.GameObjects.Graphics;

  // CPU思考用
  private cpuDecisionTimer: number = 0;
  private cpuAction: 'idle' | 'approach' | 'retreat' | 'guard' | 'crouch' | 'parry' = 'approach';
  private cpuNextAttackReadyTime: number = 0;

  constructor(scene: Phaser.Scene, config: FighterConfig) {
    super(scene, config.x, config.y, `${config.spriteKey}_idle`);

    this.fighterId = config.id;
    this.fighterName = config.name;
    this.spriteKey = config.spriteKey;
    this.themeColor = config.themeColor;
    this.isCPU = !!config.isCPU;
    this.nativeFacing = config.nativeFacing || (config.initialFacingLeft ? 'left' : 'right');
    this.attackFacing = this.nativeFacing;

    // ★ KURENAI（くのいち）弱体化調整：忍者ガラスキャノン設計（耐久度を100->85へ引き下げ）
    if (this.spriteKey === 'kunoichi') {
      this.maxHp = 85;
      this.hp = 85;
    }

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(this.baseScale);
    // 格闘ゲーム標準の引き締まったPushbox（身体押し合い判定）
    // 頭部(y=60)から足元(y=131)まで正確にカバーし、地面に足が接地するように設定
    this.body?.setSize(34, 71);
    this.body?.setOffset(83, 60);

    this.setCollideWorldBounds(true);
    this.setBounce(0, 0);

    // オーラ描画用グラフィックス
    this.auraGraphics = scene.add.graphics();

    // キー入力登録
    const keyboard = scene.input.keyboard;
    if (keyboard && config.keys) {
      const attackKeys: Phaser.Input.Keyboard.Key[] = [];
      if (config.keys.attacks) {
        for (const code of config.keys.attacks) {
          attackKeys.push(keyboard.addKey(code));
        }
      }

      const heavyKeys: Phaser.Input.Keyboard.Key[] = [];
      if (config.keys.heavyAttacks) {
        for (const code of config.keys.heavyAttacks) {
          heavyKeys.push(keyboard.addKey(code));
        }
      }

      this.controls = {
        left: config.keys.left ? keyboard.addKey(config.keys.left) : ({} as Phaser.Input.Keyboard.Key),
        right: config.keys.right ? keyboard.addKey(config.keys.right) : ({} as Phaser.Input.Keyboard.Key),
        jump: config.keys.jump ? keyboard.addKey(config.keys.jump) : ({} as Phaser.Input.Keyboard.Key),
        down: config.keys.down ? keyboard.addKey(config.keys.down) : ({} as Phaser.Input.Keyboard.Key),
        lp: config.keys.lp ? keyboard.addKey(config.keys.lp) : undefined,
        mp: config.keys.mp ? keyboard.addKey(config.keys.mp) : undefined,
        hp: config.keys.hp ? keyboard.addKey(config.keys.hp) : undefined,
        lk: config.keys.lk ? keyboard.addKey(config.keys.lk) : undefined,
        mk: config.keys.mk ? keyboard.addKey(config.keys.mk) : undefined,
        hk: config.keys.hk ? keyboard.addKey(config.keys.hk) : undefined,
        attacks: attackKeys,
        heavyAttacks: heavyKeys,
        impact: config.keys.impact ? keyboard.addKey(config.keys.impact) : undefined,
        parry: config.keys.parry ? keyboard.addKey(config.keys.parry) : undefined,
        superArt: config.keys.superArt ? keyboard.addKey(config.keys.superArt) : undefined
      };

      this.downAltKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    }

    // アニメーション完了ハンドラ
    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (anim: Phaser.Animations.Animation) => {
      if (
        anim.key === `${this.spriteKey}_attack1` ||
        anim.key === `${this.spriteKey}_attack2` ||
        anim.key === `${this.spriteKey}_kick` ||
        anim.key === `${this.spriteKey}_impact`
      ) {
        this.finishAttack();
      } else if (anim.key === `${this.spriteKey}_hit`) {
        this.isStunned = false;
        if (!this.isDead && !this.isCrumpled) {
          this.play(`${this.spriteKey}_idle`, true);
        }
      }
    });

    this.play(`${this.spriteKey}_idle`);
  }

  public setOpponent(opponent: Fighter): void {
    this.opponent = opponent;
    this.updateFacing();
  }

  public setCharacter(spriteKey: string, name: string, themeColor: number, nativeFacing?: 'left' | 'right'): void {
    this.spriteKey = spriteKey;
    this.fighterName = name;
    this.themeColor = themeColor;
    if (nativeFacing) {
      this.nativeFacing = nativeFacing;
    }
    if (this.spriteKey === 'kunoichi') {
      this.maxHp = 85;
      this.hp = Math.min(this.hp, 85);
    } else {
      this.maxHp = 100;
    }
    this.setTexture(`${spriteKey}_idle`, 0);
    this.play(`${spriteKey}_idle`, true);
    this.updateFacing();
  }

  public getControls(): FighterControls | undefined {
    return this.controls;
  }

  public getFacingDirection(): 'left' | 'right' {
    if (!this.opponent) return this.nativeFacing;
    return this.x <= this.opponent.x ? 'right' : 'left';
  }

  public updateFacing(): void {
    // 攻撃動作中・後隙硬直中・被弾硬直中・膝崩れダウン中は体の向きを固定（途中で急反転しない）
    if (this.isAttacking || this.isRecovering || this.isStunned || this.isCrumpled) return;

    const desired = this.getFacingDirection();
    this.attackFacing = desired;
    if (this.nativeFacing === 'right') {
      this.setFlipX(desired === 'left');
    } else {
      this.setFlipX(desired === 'right');
    }
  }

  public update(): void {
    if (this.isDead) {
      this.auraGraphics.clear();
      return;
    }

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    const isGrounded = body.blocked.down || body.touching.down || (this.isCrouching && Math.abs(body.velocity.y) < 10);
    const now = this.scene.time.now;

    // ★ ヒットストップ処理（肉体衝突時の極小フリーズ＆衝撃振動）
    if (this.isHitstopped) {
      if (now >= this.hitstopUntil) {
        this.isHitstopped = false;
        if (this.anims.isPlaying === false) {
          this.anims.resume();
        }
        this.setVelocity(this.postHitstopVelocityX, this.postHitstopVelocityY);
      } else {
        // ヒットストップ中：その場にフリーズして微振動（肉体にめり込む感触！）
        this.setVelocity(0, 0);
        return;
      }
    }

    // 着地時の土煙エフェクト
    if (!this.wasGrounded && isGrounded && !this.isDead) {
      this.createLandDust();
    }
    this.wasGrounded = isGrounded;

    // 走行中の土煙エフェクト
    if (this.currentState === 'running' && isGrounded) {
      this.stepDustCounter++;
      if (this.stepDustCounter >= 9) {
        this.stepDustCounter = 0;
        this.createStepDust();
      }
    }

    // コンボ途切れリセット（850ms以上間隔が空いたらリセット）
    if (this.currentComboCount > 0 && now - this.lastComboHitTime > 850) {
      this.currentComboCount = 0;
      this.currentComboDamage = 0;
    }

    // ドライブゲージの自然回復（バーンアウト以外時）
    this.updateDriveSystem(now);

    // 常に相手を向く
    this.updateFacing();

    // ★ 格闘ゲーム最高峰の演出：残像シャドウ (Ghost Trail / Afterimage)
    const isHighSpeed = Math.abs(body.velocity.x) > 120 || !isGrounded;
    const isSpecialAction = this.isImpact || this.isAttacking || this.isParrying;
    if ((isHighSpeed || isSpecialAction) && !this.isDead && !this.isStunned && !this.isCrumpled) {
      if (now - this.ghostTrailTimer > 65) {
        this.ghostTrailTimer = now;
        this.createGhostTrail();
      }
    }

    // 膝崩れダウン中（パニッシュカウンター後）
    if (this.isCrumpled) {
      this.setVelocityX(0);
      this.auraGraphics.clear();
      return;
    }

    // 被弾硬直中
    if (this.isStunned) {
      this.auraGraphics.clear();
      return;
    }

    // 攻撃中
    if (this.isAttacking) {
      // 弱技の発生初期（75ms以内）に投げが入力された場合、投げへカラキャンセル（Kara-Cancel）！
      if (!this.isCPU && (now - this.attackStartTime <= 75) && isGrounded) {
        const isLightMove = this.currentAttackKind === 'stand_lp' || this.currentAttackKind === 'stand_lk' ||
                            this.currentAttackKind === 'crouch_lp' || this.currentAttackKind === 'crouch_lk';
        if (isLightMove) {
          const arcade = this.fighterId === 'p1' ? ArcadeControllerManager.getInstance() : null;
          const lpDown = (this.controls?.lp && this.controls.lp.isDown) || (arcade?.lpIsDown ?? false);
          const lkDown = (this.controls?.lk && this.controls.lk.isDown) || (arcade?.lkIsDown ?? false);
          const throwPressed = (arcade?.throwJustDown ?? false) || (arcade?.throwIsDown ?? false) || (lpDown && lkDown);
          if (throwPressed) {
            this.abortAttack();
            this.triggerThrow();
            return;
          }
        }
      }

      this.checkAttackCollision();
      if (isGrounded) {
        // ドライブインパクト中は前進推進力
        if (this.currentAttackKind === 'drive_impact') {
          const facing = this.getFacingDirection();
          this.setVelocityX(facing === 'right' ? 140 : -140);
        } else {
          this.setVelocityX(0);
        }
      }
      this.renderAttackAura();
      return;
    }

    // 技後の後隙（硬直状態）：移動・ジャンプ・ガード完全禁止で差し返される隙！
    if (this.isRecovering) {
      if (now >= this.recoveryEndTime) {
        this.isRecovering = false;
        if (!this.isDead && !this.isStunned && !this.isCrumpled) {
          if (this.isCrouching) {
            this.currentState = this.isGuarding ? 'guarding' : 'crouching';
          } else {
            this.currentState = this.isGuarding ? 'guarding' : 'idle';
            this.play(`${this.spriteKey}_idle`, true);
          }
        }
      } else {
        this.isGuarding = false;
        if (isGrounded) {
          this.setVelocityX(0);
        }
        this.currentState = 'recovery';
        this.renderDefensiveAura();
        // 弱技の連打キャンセル受け付け（弱技同士のみ）
        if (!this.isCPU) {
          this.checkChainCancel();
        }
        return;
      }
    }

    // 防御オーラ（パリィ／立ちガード／しゃがみガード）のレンダリング
    this.renderDefensiveAura();

    // プレイヤー入力 or CPU
    if (this.isCPU) {
      this.updateCPU(isGrounded);
    } else {
      this.updatePlayerInput(isGrounded);
    }

    // 姿勢・アニメーション制御
    this.updateAnimationAndPosture(isGrounded);
  }

  // ★ ドライブゲージとバーンアウトの管理
  private updateDriveSystem(now: number): void {
    if (this.isBurnout) {
      // バーンアウト回復判定
      if (now >= this.burnoutEndTime) {
        this.isBurnout = false;
        this.driveGauge = this.maxDriveGauge;
        this.clearTint();
        this.createBurnoutRecoverEffect();
      } else {
        // バーンアウト中は灰色に変色
        this.setTint(0x94a3b8);
      }
    } else {
      // 自然回復（約8秒で1ゲージ回復）
      if (this.driveGauge < this.maxDriveGauge && !this.isParrying) {
        this.driveGauge = Math.min(this.maxDriveGauge, this.driveGauge + 0.0035);
      }
      // パリィ中は徐々に消費
      if (this.isParrying) {
        this.consumeDrive(0.008);
      }
    }
  }

  public consumeDrive(amount: number): boolean {
    if (this.isBurnout) return false;

    this.driveGauge = Math.max(0, this.driveGauge - amount);
    if (this.driveGauge <= 0) {
      // バーンアウト突入！
      this.isBurnout = true;
      this.isParrying = false;
      this.burnoutEndTime = this.scene.time.now + 10000; // 10秒間バーンアウト
      this.createBurnoutStartEffect();
    }
    return true;
  }

  private updatePlayerInput(isGrounded: boolean): void {
    if (!this.controls) return;

    const arcade = this.fighterId === 'p1' ? ArcadeControllerManager.getInstance() : null;
    const now = this.scene.time.now;
    const canAttack = now >= this.canAttackTime && !this.isAttacking && !this.isCrumpled;

    // ★ 6ボタン入力の検出
    const lpJustDown = (this.controls.lp && Phaser.Input.Keyboard.JustDown(this.controls.lp)) || (arcade?.lpJustDown ?? false);
    const mpJustDown = (this.controls.mp && Phaser.Input.Keyboard.JustDown(this.controls.mp)) || (arcade?.mpJustDown ?? false);
    const hpJustDown = (this.controls.hp && Phaser.Input.Keyboard.JustDown(this.controls.hp)) || (arcade?.hpJustDown ?? false);
    const lkJustDown = (this.controls.lk && Phaser.Input.Keyboard.JustDown(this.controls.lk)) || (arcade?.lkJustDown ?? false);
    const mkJustDown = (this.controls.mk && Phaser.Input.Keyboard.JustDown(this.controls.mk)) || (arcade?.mkJustDown ?? false);
    const hkJustDown = (this.controls.hk && Phaser.Input.Keyboard.JustDown(this.controls.hk)) || (arcade?.hkJustDown ?? false);

    // ★ 0. つかみ・通常投げ (X+A 同時押し: LP + LK / U + J)
    if (lpJustDown) this.lastLpDownTime = now;
    if (lkJustDown) this.lastLkDownTime = now;
    const throwBufferSimultaneous = (now - this.lastLpDownTime <= 75) && (now - this.lastLkDownTime <= 75);
    const throwPressed = (arcade?.throwJustDown ?? false) ||
                         (arcade?.throwIsDown ?? false) ||
                         (lpJustDown && (this.controls.lk?.isDown || lkJustDown)) ||
                         (lkJustDown && (this.controls.lp?.isDown || lpJustDown)) ||
                         (this.controls.lp?.isDown && this.controls.lk?.isDown) ||
                         throwBufferSimultaneous;
    if (throwPressed && canAttack && isGrounded) {
      this.lastLpDownTime = 0;
      this.lastLkDownTime = 0;
      this.triggerThrow();
      return;
    }

    // ★ 1. スーパーアーツ (M キー / アケコンSA / HP+HK 同時押し)
    const saSimultaneous = (hpJustDown && hkJustDown);
    const saPressed = (this.controls.superArt && Phaser.Input.Keyboard.JustDown(this.controls.superArt)) ||
                      (arcade?.superArtJustDown ?? false) || saSimultaneous;
    if (saPressed && canAttack && this.saGauge >= 100) {
      this.triggerSuperArt();
      return;
    }

    // ★ 2. ドライブインパクト (P/I キー / アケコンDI / LB)
    const impactPressed = (this.controls.impact && Phaser.Input.Keyboard.JustDown(this.controls.impact)) ||
                          (arcade?.impactJustDown ?? false);
    if (impactPressed && canAttack && !this.isBurnout) {
      if (this.consumeDrive(1.0)) {
        this.triggerDriveImpact();
        return;
      }
    }

    // ★ 3. ドライブパリィ (Space/O キー / アケコンDP / LT 長押し)
    const parryHolding = (this.controls.parry && this.controls.parry.isDown) ||
                         (arcade?.parryIsDown ?? false);
    if (parryHolding && isGrounded && !this.isBurnout && canAttack) {
      if (!this.isParrying) {
        this.isParrying = true;
        this.parryStartTime = now;
        this.consumeDrive(0.5);
      }
      this.setVelocityX(0);
      return;
    } else {
      this.isParrying = false;
    }

    const isDownPressed = !!(this.controls.down && this.controls.down.isDown) ||
                          !!(this.downAltKey && this.downAltKey.isDown) ||
                          (arcade?.isDownDown ?? false);
    const isUpPressed = !!(this.controls.jump && this.controls.jump.isDown) || (arcade?.isUpDown ?? false);
    const isUpJustDown = (this.controls.jump && Phaser.Input.Keyboard.JustDown(this.controls.jump)) ||
                         (arcade?.isUpJustDown ?? false);

    // 互換キー判定（旧 attacks / heavyAttacks）
    let heavyPressed = arcade?.heavyAttackJustDown ?? false;
    if (this.controls.heavyAttacks) {
      for (const k of this.controls.heavyAttacks) {
        if (Phaser.Input.Keyboard.JustDown(k)) {
          heavyPressed = true;
          break;
        }
      }
    }

    let attackPressed = arcade?.lightAttackJustDown ?? false;
    for (const k of this.controls.attacks) {
      if (Phaser.Input.Keyboard.JustDown(k)) {
        attackPressed = true;
        break;
      }
    }

    // ★ 4. SF6 6ボタン & 通常技の完全分岐
    if (canAttack) {
      // 空中攻撃
      if (!isGrounded) {
        if (hpJustDown) { this.triggerAttack('air_hp'); return; }
        if (hkJustDown) { this.triggerAttack('air_hk'); return; }
        if (mpJustDown) { this.triggerAttack('air_hp'); return; }
        if (mkJustDown) { this.triggerAttack('air_hk'); return; }
        if (lpJustDown) { this.triggerAttack('air_lp'); return; }
        if (lkJustDown) { this.triggerAttack('air_lk'); return; }
        if (attackPressed || heavyPressed) { this.triggerAttack('air_kick'); return; }
      }
      // しゃがみ攻撃
      else if (isDownPressed) {
        if (hkJustDown) { this.triggerAttack('crouch_hk'); return; } // 名物「大足足払い」でダウン！
        if (hpJustDown) { this.triggerAttack('crouch_hp'); return; } // しゃがみ対空アッパー！
        if (mkJustDown) { this.triggerAttack('crouch_mk'); return; } // 名物「中足」！
        if (mpJustDown) { this.triggerAttack('crouch_mp'); return; }
        if (lkJustDown) { this.triggerAttack('crouch_lk'); return; } // 小足
        if (lpJustDown) { this.triggerAttack('crouch_lp'); return; } // 小パン
        if (heavyPressed) { this.triggerAttack('crouch_hp'); return; }
        if (attackPressed) { this.triggerAttack('crouch_low'); return; }
      }
      // 立ち攻撃
      else {
        if (hpJustDown || (heavyPressed && isUpPressed)) { this.triggerAttack('stand_hp'); return; } // 強パンチ/対空
        if (hkJustDown) { this.triggerAttack('stand_hk'); return; } // 強キック
        if (mpJustDown) { this.triggerAttack('stand_mp'); return; } // 中パンチ
        if (mkJustDown) { this.triggerAttack('stand_mk'); return; } // 中キック
        if (lpJustDown || attackPressed) { this.triggerAttack('stand_lp'); return; } // 弱パンチ
        if (lkJustDown) { this.triggerAttack('stand_lk'); return; } // 弱キック
        if (heavyPressed) { this.triggerAttack('stand_hp'); return; }
      }
    }

    // 左右移動および後退（ガード）・前進方向の判定
    const facing = this.getFacingDirection();
    const isLeftDown = !!(this.controls.left && this.controls.left.isDown) || (arcade?.isLeftDown ?? false);
    const isRightDown = !!(this.controls.right && this.controls.right.isDown) || (arcade?.isRightDown ?? false);
    const isLeftJustDown = !!(this.controls.left && Phaser.Input.Keyboard.JustDown(this.controls.left));
    const isRightJustDown = !!(this.controls.right && Phaser.Input.Keyboard.JustDown(this.controls.right));
    const isBackDown = (facing === 'right' && isLeftDown) || (facing === 'left' && isRightDown);
    const isForwardDown = (facing === 'right' && isRightDown) || (facing === 'left' && isLeftDown);
    const isForwardJustDown = (facing === 'right' && isRightJustDown) || (facing === 'left' && isLeftJustDown);

    // ★ しゃがみ（下入力中）：
    // ↙ (後退入力) 時は完全静止して「しゃがみガード」成立！
    // ↘ (前進入力) 時は低姿勢のまま「しゃがみ歩き（Crouch Walk）」ですり足前進！
    // ↓ (下単独) 時はその場で低段立ち合い「しゃがみ構え」
    if (isDownPressed && isGrounded) {
      this.isCrouching = true;
      this.isDashing = false;
      if (isBackDown) {
        this.isCrouchWalking = false;
        this.isGuarding = true;
        this.setVelocityX(0); // 完全静止！しゃがみガード
        this.currentState = 'guarding';
      } else if (isForwardDown) {
        this.isCrouchWalking = true;
        this.isGuarding = false;
        const crouchWalkSpeed = this.forwardSpeed * 0.55;
        this.setVelocityX(facing === 'right' ? crouchWalkSpeed : -crouchWalkSpeed);
        this.currentState = 'crouching';
      } else {
        this.isCrouchWalking = false;
        this.isGuarding = false;
        this.setVelocityX(0);
        this.currentState = 'crouching';
      }
      return;
    } else {
      this.isCrouching = false;
      this.isCrouchWalking = false;
    }

    // ダッシュ判定（前方向の素早いダブルタップで疾走ダッシュ！）
    if (isForwardJustDown) {
      if (now - this.lastForwardTapTime < 280) {
        this.isDashing = true;
      }
      this.lastForwardTapTime = now;
    }
    if (!isForwardDown) {
      this.isDashing = false;
    }

    // 左右移動（相手を見据えたまま前進・後退）
    if (isLeftDown && !isRightDown) {
      let spd = facing === 'right' ? this.retreatSpeed : this.forwardSpeed;
      if (this.isDashing && facing === 'left') spd *= 1.45;
      this.setVelocityX(-spd);
    } else if (isRightDown && !isLeftDown) {
      let spd = facing === 'right' ? this.forwardSpeed : this.retreatSpeed;
      if (this.isDashing && facing === 'right') spd *= 1.45;
      this.setVelocityX(spd);
    } else {
      this.setVelocityX(0);
      this.isDashing = false;
    }

    // 立ちガード
    if (isBackDown) {
      this.isGuarding = true;
      this.currentState = 'guarding';
    } else {
      this.isGuarding = false;
    }

    // ジャンプ
    if (isUpJustDown && isGrounded && !this.isCrouching) {
      this.setVelocityY(-this.jumpPower);
      this.isGuarding = false;
    }
  }

  private checkGuardState(arcade?: ArcadeControllerManager | null): void {
    if (!this.opponent || !this.controls) {
      this.isGuarding = false;
      return;
    }
    const facing = this.getFacingDirection();
    const isLeft = (this.controls.left && this.controls.left.isDown) || (arcade?.isLeftDown ?? false);
    const isRight = (this.controls.right && this.controls.right.isDown) || (arcade?.isRightDown ?? false);

    if (facing === 'right' && isLeft) {
      this.isGuarding = true;
    } else if (facing === 'left' && isRight) {
      this.isGuarding = true;
    } else {
      this.isGuarding = false;
    }
  }

  // ★ 弱技の連打キャンセル（Chain Cancel）＆後隙中の投げ入力
  private checkChainCancel(): void {
    if (!this.controls) return;
    const arcade = this.fighterId === 'p1' ? ArcadeControllerManager.getInstance() : null;
    const now = this.scene.time.now;
    const lpJustDown = (this.controls.lp && Phaser.Input.Keyboard.JustDown(this.controls.lp)) || (arcade?.lpJustDown ?? false);
    const lkJustDown = (this.controls.lk && Phaser.Input.Keyboard.JustDown(this.controls.lk)) || (arcade?.lkJustDown ?? false);

    const isLightMove = this.currentAttackKind.includes('lp') || this.currentAttackKind.includes('lk') || this.currentAttackKind === 'stand_jab';
    if (!isLightMove) return;

    if (lpJustDown) this.lastLpDownTime = now;
    if (lkJustDown) this.lastLkDownTime = now;
    const throwBuffer = (now - this.lastLpDownTime <= 75) && (now - this.lastLkDownTime <= 75);
    const throwPressed = (arcade?.throwJustDown ?? false) ||
                         (arcade?.throwIsDown ?? false) ||
                         (lpJustDown && (this.controls.lk?.isDown || lkJustDown)) ||
                         (lkJustDown && (this.controls.lp?.isDown || lpJustDown)) ||
                         throwBuffer;

    if (throwPressed) {
      this.isRecovering = false;
      this.lastLpDownTime = 0;
      this.lastLkDownTime = 0;
      this.triggerThrow();
      return;
    }

    const isDownPressed = !!(this.controls.down && this.controls.down.isDown) ||
                          !!(this.downAltKey && this.downAltKey.isDown) ||
                          (arcade?.isDownDown ?? false);

    if (lpJustDown) {
      this.isRecovering = false;
      this.triggerAttack(isDownPressed ? 'crouch_lp' : 'stand_lp');
    } else if (lkJustDown) {
      this.isRecovering = false;
      this.triggerAttack(isDownPressed ? 'crouch_lk' : 'stand_lk');
    }
  }

  // ★ CPU AI（SF6 ドライブシステムを駆使する本格AI）
  private updateCPU(isGrounded: boolean): void {
    if (!this.opponent || this.opponent.isDead) {
      this.setVelocityX(0);
      this.isGuarding = false;
      this.isCrouching = false;
      this.isParrying = false;
      return;
    }

    const now = this.scene.time.now;
    const dx = this.opponent.x - this.x;
    const absDist = Math.abs(dx);
    const opBody = this.opponent.body as Phaser.Physics.Arcade.Body;
    const opponentInAir = opBody ? (!opBody.blocked.down && !opBody.touching.down) : false;
    const opponentIsAttacking = this.opponent.currentState === 'attacking';
    const opponentIsSpamming = (this.opponent.sameMoveSpamCount ?? 0) >= 2;
    const opponentIsRecovering = this.opponent.currentState === 'recovery';

    this.cpuDecisionTimer++;
    if (this.cpuDecisionTimer > 8) {
      this.cpuDecisionTimer = 0;

      // ★ 対連打AI：相手が同一技を連打・連発してきた場合の迎撃＆割り込み！
      if (opponentIsSpamming && absDist < 165) {
        // A. ドライブインパクト割り込み
        const impactSpamChance = this.spriteKey === 'kunoichi' ? 0.15 : 0.60;
        if (!this.isBurnout && this.driveGauge >= 1.0 && now >= this.cpuNextAttackReadyTime && now >= this.canAttackTime && Math.random() < impactSpamChance) {
          if (this.consumeDrive(1.0)) {
            this.triggerDriveImpact();
            this.cpuNextAttackReadyTime = now + 900;
            return;
          }
        }

        // B. ドライブパリィ
        const parrySpamChance = this.spriteKey === 'kunoichi' ? 0.15 : 0.55;
        if (!this.isBurnout && Math.random() < parrySpamChance) {
          this.isParrying = true;
          this.parryStartTime = now;
          this.consumeDrive(0.5);
          this.setVelocityX(0);
          return;
        } else {
          // C. 的確なしゃがみ／立ちガード
          this.isParrying = false;
          this.cpuAction = 'retreat';
          this.isGuarding = true;
          this.isCrouching = this.opponent.isCrouching;
          return;
        }
      }

      // ★ 確定反撃（パニッシュカウンター）：相手の技後隙（リカバリー硬直）を逃さず叩く！
      if (opponentIsRecovering && absDist < 150 && isGrounded && now >= this.cpuNextAttackReadyTime && now >= this.canAttackTime) {
        const punishAtk: AttackKind = absDist < 90 ? 'stand_hp' : 'stand_mp';
        this.triggerAttack(punishAtk);
        this.cpuNextAttackReadyTime = now + 700;
        return;
      }

      // ① 相手が攻撃してきたら -> パリィ または ガード（くのいちCPUはパリィ率低減）
      const parryAtkChance = this.spriteKey === 'kunoichi' ? 0.12 : 0.38;
      if (opponentIsAttacking && absDist < 170 && !this.isBurnout && Math.random() < parryAtkChance) {
        // ドライブパリィ
        this.isParrying = true;
        this.parryStartTime = now;
        this.consumeDrive(0.5);
        this.setVelocityX(0);
        return;
      } else {
        this.isParrying = false;
      }

      // ② 相手の飛び込みには対空（★ くのいちは対空率を75%->18%へ激減！プレイヤーが飛び込んで差し返せる！）
      if (opponentInAir && absDist < 140 && isGrounded && now >= this.cpuNextAttackReadyTime && now >= this.canAttackTime) {
        const antiAirChance = this.spriteKey === 'kunoichi' ? 0.18 : 0.75;
        if (Math.random() < antiAirChance) {
          this.triggerAttack('anti_air');
          this.cpuNextAttackReadyTime = now + 800;
          return;
        }
      }

      // ③ SAゲージMAXならスーパーアーツを放つ
      if (this.saGauge >= 100 && absDist < 130 && Math.random() < 0.30 && now >= this.canAttackTime) {
        this.triggerSuperArt();
        return;
      }

      // ④ ドライブインパクト（くのいちは控えめ）
      const diChance = this.spriteKey === 'kunoichi' ? 0.12 : 0.22;
      if (!this.isBurnout && this.driveGauge >= 1.5 && absDist < 140 && Math.random() < diChance && now >= this.cpuNextAttackReadyTime && now >= this.canAttackTime) {
        if (this.consumeDrive(1.0)) {
          this.triggerDriveImpact();
          this.cpuNextAttackReadyTime = now + 900;
          return;
        }
      }

      // ⑤ 通常格闘の間合い
      if (absDist >= 55 && absDist <= 160) {
        const r = Math.random();
        if (r < 0.45 && now >= this.cpuNextAttackReadyTime && now >= this.canAttackTime && isGrounded) {
          const atk: AttackKind = Math.random() < 0.4 ? 'crouch_low' : (Math.random() < 0.5 ? 'stand_jab' : 'stand_mk');
          this.triggerAttack(atk);
          this.cpuNextAttackReadyTime = now + 700;
          return;
        } else if (r < 0.72) {
          this.cpuAction = 'approach';
          this.isCrouching = false;
        } else {
          this.cpuAction = 'retreat';
          this.isCrouching = this.opponent.isCrouching;
        }
      } else if (absDist > 160) {
        // ★ くのいち専用AI：遠距離からの苦無投擲（頻度半減＆3.2秒の超ロングクールダウン）
        if (this.spriteKey === 'kunoichi' && now >= this.cpuNextAttackReadyTime && now >= this.canAttackTime && isGrounded) {
          const hasProj = (this.scene as any).hasActiveProjectile?.(this) ?? false;
          if (!hasProj && Math.random() < 0.20) {
            this.triggerAttack('stand_mp');
            this.cpuNextAttackReadyTime = now + 3200; // 3.2秒のクールダウン
            return;
          }
        }
        this.cpuAction = 'approach';
        this.isCrouching = false;
        if (isGrounded && Math.random() < 0.08) {
          this.setVelocityY(-this.jumpPower);
        }
      } else {
        // 至近距離
        if (now >= this.cpuNextAttackReadyTime && now >= this.canAttackTime && isGrounded && Math.random() < 0.55) {
          this.triggerAttack(Math.random() < 0.5 ? 'stand_jab' : 'crouch_low');
          this.cpuNextAttackReadyTime = now + 700;
          return;
        }
        this.cpuAction = 'retreat';
        this.isCrouching = this.opponent.isCrouching;
      }
    }

    // 行動実行
    if (this.cpuAction === 'approach') {
      this.isGuarding = false;
      this.isCrouching = false;
      const dir = dx > 0 ? 1 : -1;
      this.setVelocityX(dir * this.forwardSpeed * 0.9);
    } else if (this.cpuAction === 'retreat') {
      this.isGuarding = true;
      const dir = dx > 0 ? -1 : 1;
      this.setVelocityX(dir * this.retreatSpeed);
    } else {
      this.setVelocityX(0);
    }
  }

  private updateAnimationAndPosture(isGrounded: boolean): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body || this.isAttacking || this.isStunned || this.isCrumpled) return;

    if (this.isCrouching && isGrounded) {
      if (this.isCrouchWalking) {
        this.currentState = 'crouching';
        if (this.spriteKey === 'mack') {
          this.play('mack_crouch_walk', true);
        } else if (this.spriteKey === 'kunoichi') {
          this.play('kunoichi_crouch_walk', true);
        } else {
          this.play(`${this.spriteKey}_crouch`, true);
        }
      } else {
        if (this.isGuarding) {
          this.currentState = 'guarding';
        } else {
          this.currentState = 'crouching';
        }
        if (this.spriteKey === 'gladiator') {
          this.play('gladiator_crouch', true);
        } else if (this.spriteKey === 'ayane') {
          this.play('ayane_crouch', true);
        } else if (this.spriteKey === 'kaizer') {
          this.play('kaizer_crouch', true);
        } else if (this.spriteKey === 'mack') {
          this.play('mack_crouch', true);
        } else if (this.spriteKey === 'kunoichi') {
          this.play('kunoichi_crouch', true);
        } else if (this.spriteKey === 'kenji') {
          if (this.anims.isPlaying) {
            this.anims.stop();
          }
          this.setTexture('kenji_attack2', 0);
        }
      }
      return;
    } else {
      // 立ち姿勢へ復帰
      const isCrouchAnim = this.anims.isPlaying && (
        this.anims.currentAnim?.key === 'gladiator_crouch' ||
        this.anims.currentAnim?.key === 'ayane_crouch' ||
        this.anims.currentAnim?.key === 'kaizer_crouch' ||
        this.anims.currentAnim?.key === 'mack_crouch' ||
        this.anims.currentAnim?.key === 'mack_crouch_walk' ||
        this.anims.currentAnim?.key === 'kunoichi_crouch' ||
        this.anims.currentAnim?.key === 'kunoichi_crouch_walk'
      );
      if (this.currentState === 'crouching' || isCrouchAnim) {
        this.play(`${this.spriteKey}_idle`, true);
      }
    }

    if (this.isParrying) {
      this.currentState = 'parrying';
      this.play(`${this.spriteKey}_idle`, true);
      return;
    }

    if (!isGrounded) {
      if (body.velocity.y < 0) {
        this.currentState = 'jumping';
        this.play(`${this.spriteKey}_jump`, true);
      } else {
        this.currentState = 'falling';
        this.play(`${this.spriteKey}_fall`, true);
      }
    } else {
      if (this.isGuarding && Math.abs(body.velocity.x) < 10) {
        this.currentState = 'guarding';
        this.play(`${this.spriteKey}_idle`, true);
      } else if (Math.abs(body.velocity.x) > 20) {
        if (this.isDashing) {
          this.currentState = 'running';
          this.play(`${this.spriteKey}_run`, true);
        } else {
          this.currentState = 'running';
          if (this.spriteKey === 'mack') {
            this.play('mack_walk', true);
          } else if (this.spriteKey === 'kunoichi') {
            this.play('kunoichi_walk', true);
          } else {
            this.play(`${this.spriteKey}_run`, true);
          }
        }
      } else {
        this.currentState = 'idle';
        this.play(`${this.spriteKey}_idle`, true);
      }
    }
  }

  // ★ ドライブインパクトの発動
  public triggerDriveImpact(): void {
    if (this.isAttacking || this.isStunned || this.isDead || this.isCrumpled) return;

    if (this.isCrouching) {
      this.isCrouching = false;
    }

    this.updateFacing();
    this.attackFacing = this.getFacingDirection();

    this.isAttacking = true;
    this.isImpact = true;
    this.armorHitsLeft = 2; // アーマー2回！
    this.currentAttackKind = 'drive_impact';
    this.hasDealtDamageThisAttack = false;
    this.currentState = 'impact';

    SoundManager.getInstance().playImpact(false);

    // SF6のド派手なストリートグラフィティ演出！
    this.createDriveImpactStartVisual();

    let impactAnim = `${this.spriteKey}_attack2`;
    if (this.spriteKey === 'gladiator') impactAnim = 'gladiator_impact';
    else if (this.spriteKey === 'ayane') impactAnim = 'ayane_impact';
    else if (this.spriteKey === 'kaizer') impactAnim = 'kaizer_impact';
    else if (this.spriteKey === 'kunoichi') impactAnim = 'kunoichi_impact';
    else if (this.spriteKey === 'mack') impactAnim = 'mack_impact';
    this.play(impactAnim, true);

    if (this.attackSafetyTimer) this.attackSafetyTimer.remove();
    this.attackSafetyTimer = this.scene.time.delayedCall(550, () => {
      this.finishAttack();
    });
  }

  // ★ スーパーアーツの発動
  public triggerSuperArt(): void {
    if (this.isAttacking || this.isStunned || this.isDead || this.isCrumpled) return;

    if (this.isCrouching) {
      this.isCrouching = false;
    }

    this.updateFacing();
    this.attackFacing = this.getFacingDirection();

    this.saGauge = Math.max(0, this.saGauge - 100);
    this.isAttacking = true;
    this.currentAttackKind = 'super_art';
    this.hasDealtDamageThisAttack = false;
    this.currentState = 'attacking';

    SoundManager.getInstance().playSuperArt();

    // 画面暗転＋スーパーアーツカットイン演出！
    this.createSuperArtCutinVisual();

    this.play(`${this.spriteKey}_attack1`, true);

    if (this.attackSafetyTimer) this.attackSafetyTimer.remove();
    this.attackSafetyTimer = this.scene.time.delayedCall(600, () => {
      this.finishAttack();
    });
  }

  // ★ 通常投げ・つかみ（X+A 同時押し: LP + LK）
  public triggerThrow(): void {
    if (this.isAttacking || this.isStunned || this.isDead || this.isCrumpled) return;

    if (this.isCrouching) {
      this.isCrouching = false;
    }

    this.updateFacing();
    this.attackFacing = this.getFacingDirection();
    this.attackStartTime = this.scene.time.now;
    this.isRecovering = false;

    if (!this.opponent || this.opponent.isDead) return;

    const opBody = this.opponent.body as Phaser.Physics.Arcade.Body;
    const myBody = this.body as Phaser.Physics.Arcade.Body;
    if (!opBody || !myBody) return;

    const distance = Math.abs(this.x - this.opponent.x);
    const opponentInAir = !opBody.blocked.down && !opBody.touching.down;

    // 掴み判定（間合い125px以内、相手が地上、被弾無敵・ダウン中ではない）
    const throwSuccess = distance <= 125 && !opponentInAir && !this.opponent.isInvincible && !this.opponent.isCrumpled;
    const throwDir = this.attackFacing === 'right' ? 1 : -1;

    if (throwSuccess) {
      // つかみ成立！豪快な背負い投げ＆スラム！
      this.isAttacking = true;
      this.currentAttackKind = 'throw';
      this.currentState = 'attacking';
      this.setVelocity(0, 0);

      SoundManager.getInstance().playThrowGrab();

      this.opponent.onGrabbed(this);
      this.play(`${this.spriteKey}_attack1`, true);

      // 掴み文字演出
      const tText = this.scene.add.text((this.x + this.opponent.x) / 2, this.y - 75, 'THROW!!', {
        fontFamily: 'impact, sans-serif',
        fontSize: '32px',
        color: '#f97316',
        stroke: '#000000',
        strokeThickness: 5,
        shadow: { offsetX: 0, offsetY: 0, color: '#ea580c', blur: 20, fill: true, stroke: true }
      }).setOrigin(0.5);

      this.scene.tweens.add({
        targets: tText,
        y: this.y - 110,
        scaleX: 1.2,
        scaleY: 1.2,
        alpha: 0,
        duration: 450,
        onComplete: () => tText.destroy()
      });

      // Phase 1: 相手を引き寄せて頭上へ担ぎ上げる（140ms）
      const liftX = this.x - throwDir * 10;
      const liftY = this.y - 85;

      this.scene.tweens.add({
        targets: this.opponent,
        x: liftX,
        y: liftY,
        rotation: throwDir * 0.8,
        duration: 140,
        ease: 'Quad.easeOut',
        onComplete: () => {
          // Phase 2: 地面へ豪快に叩きつけるスラムモーション！
          this.play(`${this.spriteKey}_attack2`, true);
          const slamX = this.x + throwDir * 95;
          const slamY = this.y;

          this.scene.tweens.add({
            targets: this.opponent,
            x: slamX,
            y: slamY,
            rotation: throwDir * 1.6,
            duration: 130,
            ease: 'Quad.easeIn',
            onComplete: () => {
              if (this.opponent) {
                this.opponent.setRotation(0);
              }
              SoundManager.getInstance().playThrowSlam();
              this.scene.cameras.main.shake(190, 0.015);
              this.createThrowSlamVisual(slamX, slamY);
              if (this.opponent && !this.opponent.isDead) {
                const throwDmg = this.spriteKey === 'kunoichi' ? 10 : 24;
                this.opponent.onThrowSlammed(throwDir, throwDmg);
              }
            }
          });
        }
      });

      this.attackSafetyTimer = this.scene.time.delayedCall(480, () => {
        this.finishAttack();
      });
    } else {
      // 投げ空振り（スカり）
      this.isAttacking = true;
      this.currentAttackKind = 'throw_whiff';
      this.currentState = 'attacking';
      this.setVelocityX(throwDir * 70); // 前方にわずかに踏み込んでスカる！

      SoundManager.getInstance().playSwing(false);
      this.play(`${this.spriteKey}_attack1`, true);

      this.createThrowWhiffVisual();

      // スカり動作230ms後にfinishAttack()を呼び、420msの特大後隙へ！
      this.attackSafetyTimer = this.scene.time.delayedCall(230, () => {
        this.finishAttack();
      });
    }
  }

  // 投げ空振りエフェクト
  private createThrowWhiffVisual(): void {
    const dir = this.attackFacing === 'right' ? 1 : -1;
    const whiff = this.scene.add.graphics();
    whiff.lineStyle(3, 0x38bdf8, 0.9);
    whiff.strokeCircle(this.x + dir * 55, this.y - 15, 20);
    whiff.lineStyle(2, 0xffffff, 0.95);
    whiff.strokeCircle(this.x + dir * 75, this.y - 15, 14);
    whiff.lineBetween(this.x + dir * 30, this.y - 15, this.x + dir * 75, this.y - 15);

    this.scene.tweens.add({
      targets: whiff,
      alpha: 0,
      scaleX: 1.35,
      scaleY: 1.35,
      duration: 220,
      onComplete: () => whiff.destroy()
    });
  }

  // 投げスラム衝撃波エフェクト
  private createThrowSlamVisual(x: number, y: number): void {
    const slam = this.scene.add.graphics();
    slam.lineStyle(5, 0xf97316, 1);
    slam.strokeEllipse(x, y + 20, 110, 30);
    slam.lineStyle(3, 0xfacc15, 0.9);
    slam.strokeEllipse(x, y + 20, 140, 40);

    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI / 8) * i + Math.PI;
      const r = 40 + Math.random() * 30;
      slam.lineBetween(x, y + 15, x + Math.cos(angle) * r, y + 15 + Math.sin(angle) * r * 0.5);
    }

    this.scene.tweens.add({
      targets: slam,
      alpha: 0,
      scaleX: 1.4,
      scaleY: 1.4,
      duration: 260,
      onComplete: () => slam.destroy()
    });
  }

  // ★ つかまれた時のリアクション（ガード不能で捕獲される）
  public onGrabbed(attacker: Fighter): void {
    if (this.isDead) return;

    if (this.isAttacking) {
      this.abortAttack();
    }
    this.isRecovering = false;
    this.isStunned = true;
    this.currentState = 'hit';
    this.setVelocity(0, 0);

    // 捕獲された時の仰け反り
    this.setTint(0xffe4e6);
    this.play(`${this.spriteKey}_hit`, true);
  }

  // ★ 投げで地面に叩きつけられた時のリアクション
  public onThrowSlammed(throwDir: number, damage: number = 24): void {
    if (this.isDead) return;

    this.clearTint();
    this.setRotation(0);
    this.isRecovering = false;
    this.hp = Math.max(0, this.hp - damage);

    this.scene.events.emit('fighter-damaged', this);

    if (this.hp <= 0) {
      this.isDead = true;
      this.currentState = 'dead';
      this.setVelocityX(throwDir * 220);
      this.setVelocityY(-180);
      this.play(`${this.spriteKey}_death`, true);
      this.scene.events.emit('fighter-ko', this);
    } else {
      // 豪快なダウン（起き上がりまで無防備）
      this.isCrumpled = true;
      this.currentState = 'crumple';
      this.setVelocityX(throwDir * 200);
      this.setVelocityY(-150);
      this.setTint(0xfca5a5);

      this.scene.time.delayedCall(750, () => {
        this.clearTint();
        if (!this.isDead) {
          this.isCrumpled = false;
          this.isStunned = false;
          this.play(`${this.spriteKey}_idle`, true);
        }
      });
    }
  }

  // 通常攻撃
  private triggerAttack(kind: AttackKind): void {
    if (this.isAttacking || this.isStunned || this.isDead || this.isCrumpled) return;

    const isCrouchAtk = kind.startsWith('crouch_') || kind === 'crouch_low';
    if (!isCrouchAtk && this.isCrouching) {
      this.isCrouching = false;
    }

    this.updateFacing();
    this.attackStartTime = this.scene.time.now;
    this.isRecovering = false;

    // ★ 技連打ハメ防止：同一技入力のカウント
    if (this.lastAttackKind === kind) {
      this.sameMoveSpamCount++;
    } else {
      this.sameMoveSpamCount = 1;
    }
    this.lastAttackKind = kind;

    this.isAttacking = true;
    this.isImpact = false;
    this.armorHitsLeft = 0;
    this.currentAttackKind = kind;
    this.hasDealtDamageThisAttack = false;
    this.currentState = 'attacking';

    const isKick = kind.includes('lk') || kind.includes('mk') || kind.includes('hk') || kind === 'air_kick' || kind === 'crouch_low';
    const isHeavy = kind === 'stand_hp' || kind === 'crouch_hp' || kind === 'stand_hk' || kind === 'crouch_hk' || kind === 'anti_air' || kind === 'air_hk';

    let animKey = `${this.spriteKey}_attack1`;
    if (this.spriteKey === 'gladiator') {
      if (isKick) {
        // グラディエーター専用: スパルタンキック！
        animKey = 'gladiator_kick';
      } else if (isHeavy) {
        // グラディエーター強打: メガトンナックル / スマッシュ
        animKey = 'gladiator_attack2';
      } else {
        // グラディエーター弱中打: 素早いローマンジャブ
        animKey = 'gladiator_attack1';
      }
    } else if (this.spriteKey === 'ayane') {
      if (isKick) {
        // アヤネ専用: 華麗な百裂・サマーソルトキック！
        animKey = 'ayane_kick';
      } else if (isHeavy) {
        // アヤネ強打: 二連旋風掌！
        animKey = 'ayane_attack2';
      } else {
        // アヤネ弱中打: 鋭い手刀・掌底突き！
        animKey = 'ayane_attack1';
      }
    } else if (this.spriteKey === 'kaizer') {
      if (isKick) {
        // カイザー専用: バーニア噴射ストンピングキック！
        animKey = 'kaizer_kick';
      } else if (isHeavy) {
        // カイザー強打: プラズマメガトンハンマー！
        animKey = 'kaizer_attack2';
      } else {
        // カイザー弱中打: 高速ロケットピストンパンチ！
        animKey = 'kaizer_attack1';
      }
    } else if (this.spriteKey === 'kenji') {
      if (isKick || isHeavy) {
        // 忍者ケンジ: 身を沈めて低空から繰り出す二刀旋風斬り / 旋風脚！
        animKey = 'kenji_attack2';
      } else {
        // 忍者ケンジ: 前方への鋭利な高速二刀刺突！
        animKey = 'kenji_attack1';
      }
    } else if (this.spriteKey === 'kunoichi') {
      if (isKick) {
        // くのいち専用: 華麗な旋風脚キック！
        animKey = 'kunoichi_kick';
      } else if (!kind.startsWith('air_') && !kind.startsWith('crouch_') && (kind === 'stand_mp' || kind === 'stand_hp')) {
        // くのいち専用: 苦無（クナイ）投擲！
        // ★ 画面内に既に自分の苦無が存在する場合は連射不可（格ゲー伝統の1発制限）
        const hasProj = (this.scene as any).hasActiveProjectile?.(this) ?? false;
        if (hasProj) {
          // 画面に苦無がある間は近接斬撃に化ける
          animKey = 'kunoichi_attack1';
        } else {
          animKey = 'kunoichi_attack2';
          // 予備動作（発生180ms）ののちに苦無射出（見てから飛び越えや差し込みが狙える予備動作）
          this.scene.time.delayedCall(180, () => {
            if (this.isAttacking && !this.isDead && !this.isStunned) {
              (this.scene as any).spawnProjectile?.(this);
            }
          });
        }
      } else {
        // くのいち専用: 鋭利な苦無近接斬撃！
        animKey = 'kunoichi_attack1';
      }
    } else {
      // トモエ（サムライ）: 抜刀居合一閃 (attack1)、二天唐竹割り (attack2)、鋭い前蹴り (kick)
      if (isKick) {
        animKey = 'mack_kick';
      } else if (isHeavy) {
        animKey = 'mack_attack2';
      } else {
        animKey = 'mack_attack1';
      }
    }
    this.play(animKey, true);

    SoundManager.getInstance().playSwing(isHeavy);
    this.createAttackSwingVisual(kind);

    let duration = 360;
    if (kind.includes('lp') || kind.includes('lk') || kind === 'stand_jab') {
      duration = 200;
    } else if (kind.includes('mp') || kind.includes('mk') || kind === 'crouch_low') {
      duration = 270;
    } else if (isHeavy) {
      duration = 380;
    }
    if (animKey.endsWith('_kick')) {
      duration = 320;
    }
    if (animKey === 'kunoichi_attack2') {
      duration = 420; // 苦無投擲の振り抜き動作
    }

    if (this.attackSafetyTimer) this.attackSafetyTimer.remove();
    this.attackSafetyTimer = this.scene.time.delayedCall(duration, () => {
      this.finishAttack();
    });
  }

  public abortAttack(): void {
    if (this.attackSafetyTimer) {
      this.attackSafetyTimer.remove();
      this.attackSafetyTimer = undefined;
    }
    this.isAttacking = false;
    this.isImpact = false;
    this.armorHitsLeft = 0;
    this.hasDealtDamageThisAttack = false;
    this.isRecovering = false;
  }

  private finishAttack(): void {
    if (this.attackSafetyTimer) {
      this.attackSafetyTimer.remove();
      this.attackSafetyTimer = undefined;
    }
    const wasKind = this.currentAttackKind;
    this.isAttacking = false;
    this.isImpact = false;
    this.armorHitsLeft = 0;
    this.hasDealtDamageThisAttack = false;

    // ★ 本格格闘ゲーム仕様：技ごとの後隙（硬直時間）
    // 後隙中は移動・ジャンプ・ガードが一切できず、攻撃を受けると「パニッシュカウンター」確定！
    let recovery = 280;
    const isKunaiThrow = this.spriteKey === 'kunoichi' && (wasKind === 'stand_mp' || wasKind === 'stand_hp');
    if (isKunaiThrow) {
      recovery = 880; // ★ くのいち苦無投擲の特大後隙（約0.88秒）！相手の飛び込みや差し返しで確定反撃（パニッシュカウンター）を叩き込める特大の隙を作る
    } else if (wasKind === 'crouch_hk') {
      recovery = 520; // 名物「大足・足払い」はガード・空振り時に特大の隙！
    } else if (wasKind === 'drive_impact') {
      recovery = 560; // ドライブインパクト空振りの特大隙！
    } else if (wasKind === 'throw_whiff') {
      recovery = 420; // 投げスカりの確定反撃隙！
    } else if (wasKind === 'super_art') {
      recovery = 420;
    } else if (wasKind.includes('hp') || wasKind.includes('hk') || wasKind === 'anti_air') {
      recovery = 420; // 強技の大きな後隙（差し返し確定）
    } else if (wasKind.includes('mp') || wasKind.includes('mk') || wasKind === 'crouch_low') {
      recovery = 280; // 中技のしっかりした隙
    } else if (wasKind.includes('lp') || wasKind.includes('lk') || wasKind === 'stand_jab') {
      recovery = 180; // 小技の後隙（連打キャンセル受付）
    }

    // ★ 技連打ペナルティ：同一技を3回以上連続で振った場合、後隙（硬直）が 30% 増加して差し返しされやすくなる！
    if (this.sameMoveSpamCount >= 3) {
      recovery = Math.round(recovery * 1.30);
    }

    this.isRecovering = true;
    this.recoveryEndTime = this.scene.time.now + recovery;
    this.canAttackTime = this.recoveryEndTime;
    this.currentState = 'recovery';
    this.isGuarding = false;
    this.auraGraphics.clear();

    if (!this.isDead && !this.isStunned && !this.isCrumpled) {
      if (this.isCrouching) {
        if (this.spriteKey === 'gladiator') {
          this.play('gladiator_crouch', true);
        } else if (this.spriteKey === 'ayane') {
          this.play('ayane_crouch', true);
        } else if (this.spriteKey === 'kaizer') {
          this.play('kaizer_crouch', true);
        } else if (this.spriteKey === 'mack') {
          this.play('mack_crouch', true);
        } else if (this.spriteKey === 'kunoichi') {
          this.play('kunoichi_crouch', true);
        } else if (this.spriteKey === 'kenji') {
          this.setTexture('kenji_attack2', 0);
        }
      } else if (isKunaiThrow) {
        // ★ 苦無投擲後は、硬直（リカバリー）終了まで腕を前方に伸ばした無防備な決めポーズ（frame 3）を静止維持！
        // 隙だらけのフォロースルー姿勢が視覚的にも相手・自分にハッキリ伝わる！
        this.anims.stop();
        this.setTexture('kunoichi_attack2', 3);
      } else {
        this.play(`${this.spriteKey}_idle`, true);
      }
    }
  }

  // ★ 身体押し合い判定 (Pushbox)
  public getPushbox(): Phaser.Geom.Rectangle | null {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body || this.isDead) return null;
    return new Phaser.Geom.Rectangle(body.left, body.top, body.width, body.height);
  }

  // ★ 被弾・喰らい判定 (Hurtbox)
  public getHurtbox(): Phaser.Geom.Rectangle | null {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body || this.isDead) return null;
    if (this.isCrouching) {
      // しゃがみ時は上段攻撃を潜り抜けられるよう上半身をカットした低姿勢Hurtbox
      const crouchHeight = body.height * 0.6;
      const topY = body.bottom - crouchHeight;
      return new Phaser.Geom.Rectangle(body.left, topY, body.width, crouchHeight);
    }
    return new Phaser.Geom.Rectangle(body.left, body.top, body.width, body.height);
  }

  // ★ 攻撃判定 (Active Attack Hitbox)
  public getAttackHitbox(): Phaser.Geom.Rectangle | null {
    if (!this.isAttacking || this.isDead) return null;
    const myBody = this.body as Phaser.Physics.Arcade.Body;
    if (!myBody) return null;

    // ★ くのいちの苦無（飛び道具）投擲は実弾Projectileが判定を持つため、近接判定は発生させない
    if (this.spriteKey === 'kunoichi' && (this.currentAttackKind === 'stand_hp' || this.currentAttackKind === 'stand_mp')) {
      return null;
    }

    const isRight = this.attackFacing === 'right';

    switch (this.currentAttackKind) {
      // 立ちパンチ
      case 'stand_lp':
      case 'stand_jab': {
        const width = 115;
        const height = myBody.height - 35;
        const x = isRight ? (myBody.center.x - 10) : (myBody.center.x - width + 10);
        const y = myBody.top + 20;
        return new Phaser.Geom.Rectangle(x, y, width, height);
      }
      case 'stand_mp': {
        const width = 135;
        const height = myBody.height - 30;
        const x = isRight ? (myBody.center.x - 10) : (myBody.center.x - width + 10);
        const y = myBody.top + 20;
        return new Phaser.Geom.Rectangle(x, y, width, height);
      }
      case 'stand_hp':
      case 'anti_air': {
        const width = 135;
        const height = (myBody.height * 0.55) + 95;
        const x = isRight ? (myBody.center.x - 20) : (myBody.center.x - width + 20);
        const y = myBody.top - 95;
        return new Phaser.Geom.Rectangle(x, y, width, height);
      }
      // 立ちキック
      case 'stand_lk': {
        const width = 115;
        const height = 55;
        const x = isRight ? (myBody.center.x - 10) : (myBody.center.x - width + 10);
        const y = myBody.bottom - 55;
        return new Phaser.Geom.Rectangle(x, y, width, height);
      }
      case 'stand_mk': {
        const width = 140;
        const height = 65;
        const x = isRight ? (myBody.center.x - 10) : (myBody.center.x - width + 10);
        const y = myBody.bottom - 75;
        return new Phaser.Geom.Rectangle(x, y, width, height);
      }
      case 'stand_hk': {
        const width = 155;
        const height = 80;
        const x = isRight ? (myBody.center.x - 15) : (myBody.center.x - width + 15);
        const y = myBody.top + 20;
        return new Phaser.Geom.Rectangle(x, y, width, height);
      }
      // しゃがみ攻撃
      case 'crouch_lp': {
        const width = 110;
        const height = 60;
        const x = isRight ? (myBody.center.x - 10) : (myBody.center.x - width + 10);
        const y = myBody.bottom - 60;
        return new Phaser.Geom.Rectangle(x, y, width, height);
      }
      case 'crouch_mp': {
        const width = 130;
        const height = 65;
        const x = isRight ? (myBody.center.x - 10) : (myBody.center.x - width + 10);
        const y = myBody.bottom - 65;
        return new Phaser.Geom.Rectangle(x, y, width, height);
      }
      case 'crouch_hp': {
        const width = 130;
        const height = (myBody.height * 0.55) + 100;
        const x = isRight ? (myBody.center.x - 20) : (myBody.center.x - width + 20);
        const y = myBody.top - 100;
        return new Phaser.Geom.Rectangle(x, y, width, height);
      }
      case 'crouch_lk':
      case 'crouch_low': {
        const width = 125;
        const height = 75;
        const x = isRight ? (myBody.center.x - 10) : (myBody.center.x - width + 10);
        const y = myBody.bottom - 70;
        return new Phaser.Geom.Rectangle(x, y, width, height);
      }
      case 'crouch_mk': {
        const width = 150;
        const height = 75;
        const x = isRight ? (myBody.center.x - 10) : (myBody.center.x - width + 10);
        const y = myBody.bottom - 70;
        return new Phaser.Geom.Rectangle(x, y, width, height);
      }
      case 'crouch_hk': {
        // 大足（足払いスイープ）
        const width = 165;
        const height = 80;
        const x = isRight ? (myBody.center.x - 10) : (myBody.center.x - width + 10);
        const y = myBody.bottom - 75;
        return new Phaser.Geom.Rectangle(x, y, width, height);
      }
      // 空中攻撃
      case 'air_lp': {
        const width = 110;
        const height = 65;
        const x = isRight ? (myBody.center.x - 15) : (myBody.center.x - width + 15);
        const y = myBody.center.y - 15;
        return new Phaser.Geom.Rectangle(x, y, width, height);
      }
      case 'air_hp': {
        const width = 135;
        const height = 85;
        const x = isRight ? (myBody.center.x - 15) : (myBody.center.x - width + 15);
        const y = myBody.center.y - 15;
        return new Phaser.Geom.Rectangle(x, y, width, height);
      }
      case 'air_lk':
      case 'air_kick': {
        const width = 125;
        const height = (myBody.height * 0.5) + 50;
        const x = isRight ? (myBody.center.x - 15) : (myBody.center.x - width + 15);
        const y = myBody.center.y - 10;
        return new Phaser.Geom.Rectangle(x, y, width, height);
      }
      case 'air_hk': {
        const width = 145;
        const height = (myBody.height * 0.5) + 65;
        const x = isRight ? (myBody.center.x - 15) : (myBody.center.x - width + 15);
        const y = myBody.center.y - 10;
        return new Phaser.Geom.Rectangle(x, y, width, height);
      }
      case 'drive_impact': {
        const width = 155;
        const height = myBody.height + 25;
        const x = isRight ? (myBody.center.x - 15) : (myBody.center.x - width + 15);
        const y = myBody.top - 15;
        return new Phaser.Geom.Rectangle(x, y, width, height);
      }
      case 'super_art': {
        const width = 185;
        const height = myBody.height + 30;
        const x = isRight ? (myBody.center.x - 20) : (myBody.center.x - width + 20);
        const y = myBody.top - 20;
        return new Phaser.Geom.Rectangle(x, y, width, height);
      }
      default:
        return null;
    }
  }

  // ★ 当たり判定チェック（AABB幾何交差判定）
  private checkAttackCollision(): void {
    if (this.hasDealtDamageThisAttack || !this.opponent || this.opponent.isDead) return;
    if (this.opponent.isInvincible) return;

    const attackHitbox = this.getAttackHitbox();
    const opHurtbox = this.opponent.getHurtbox();
    if (!attackHitbox || !opHurtbox) return;

    // ★ 矩形と矩形の幾何学的交差判定（Arcade Physics standard AABB overlap）
    const isHit = Phaser.Geom.Intersects.RectangleToRectangle(attackHitbox, opHurtbox);
    if (!isHit) return;

    this.hasDealtDamageThisAttack = true;
    const knockbackDir = this.attackFacing === 'left' ? -1 : 1;

    // 衝突接触点（エフェクト発生座標）
    const contactX = (attackHitbox.centerX + opHurtbox.centerX) / 2;
    const contactY = (attackHitbox.centerY + opHurtbox.centerY) / 2;

    // SAゲージ増加
    this.saGauge = Math.min(this.maxSaGauge, this.saGauge + 15);

    // ★ 1. 相手がドライブパリィ中かチェック！
    if (this.opponent.isParrying) {
      const justParryWindow = this.scene.time.now - this.opponent.parryStartTime;
      if (justParryWindow < 120) {
        // ジャストパリィ成立！！
        this.opponent.onJustParrySuccess();
        this.onParried(knockbackDir);
        return;
      } else {
        // 通常パリィ成立
        this.opponent.onParrySuccess();
        return;
      }
    }

    // ★ 2. 相手がドライブインパクト中のアーマー判定！
    if (this.opponent.isImpact && this.opponent.armorHitsLeft > 0) {
      this.opponent.onArmorAbsorb();
      return; // アーマーで耐えてノーリアクション！
    }

    // ★ 3. ドライブインパクトがヒットした場合のパニッシュカウンター判定！
    if (this.currentAttackKind === 'drive_impact') {
      const isCounter = this.opponent.isAttacking || this.opponent.isGuarding || this.opponent.isRecovering;
      this.applyHitstop(240);
      this.opponent.applyHitstop(240);
      const diDmg = this.spriteKey === 'kunoichi' ? 8 : 18;
      this.opponent.onDriveImpactHit(knockbackDir, isCounter, diDmg);
      this.createDriveImpactHitVisual(contactX, contactY, isCounter);
      return;
    }

    // ★ 4. ガード成否判定
    let guardSucceeded = false;
    const isLow = this.currentAttackKind === 'crouch_low' || this.currentAttackKind === 'crouch_lk' ||
                  this.currentAttackKind === 'crouch_mk' || this.currentAttackKind === 'crouch_hk';
    const isOverhead = this.currentAttackKind.startsWith('air_') || this.currentAttackKind === 'air_kick';

    if (this.opponent.isGuarding) {
      if (isLow) {
        // 下段攻撃はしゃがみガードのみ防げる
        guardSucceeded = this.opponent.isCrouching;
      } else if (isOverhead) {
        // 中段（ジャンプ飛び込み）は立ちガードのみ防げる
        guardSucceeded = !this.opponent.isCrouching;
      } else {
        guardSucceeded = true;
      }
    }

    if (guardSucceeded) {
      // ガード成功（双方にガードストップ硬直）
      this.applyHitstop(65);
      this.opponent.applyHitstop(65);

      // ガード削り量
      let driveDmg = 0.25;
      if (this.currentAttackKind.includes('lp') || this.currentAttackKind.includes('lk') || this.currentAttackKind === 'stand_jab') {
        driveDmg = 0.15;
      } else if (this.currentAttackKind.includes('hp') || this.currentAttackKind.includes('hk') || this.currentAttackKind === 'anti_air') {
        driveDmg = 0.45;
      }
      this.opponent.consumeDrive(driveDmg);
      this.opponent.onGuardSuccess(knockbackDir);
      this.createGuardEffect(contactX, contactY);
    } else {
      // クリーンヒット時のダメージ
      let dmg = 12;
      const k = this.currentAttackKind;
      if (k === 'super_art') dmg = 34;
      else if (k === 'crouch_hk') dmg = 20;
      else if (k.includes('hp') || k.includes('hk') || k === 'anti_air') dmg = 22;
      else if (k.includes('mp') || k.includes('mk') || k === 'crouch_low') dmg = 14;
      else if (k.includes('lp') || k.includes('lk') || k === 'stand_jab') dmg = 8;

      // ★ くのいち超大幅弱体化：通常技・必殺技・SAダメージを55%カット（約0.45倍、小技4・強技10・SA15）
      if (this.spriteKey === 'kunoichi') {
        dmg = Math.max(1, Math.round(dmg * 0.45));
      }

      const hitstop = this.getHitstopDuration(this.currentAttackKind);

      // コンボ判定：相手が既に被弾硬直中、または直近の連続攻撃
      const now = this.scene.time.now;
      const isCombo = this.opponent.isStunned || (now - this.lastComboHitTime < 800 && this.currentComboCount >= 1);
      if (isCombo) {
        this.currentComboCount++;
        if (this.lastAttackKind === this.currentAttackKind) {
          this.sameMoveHitCount++;
        } else {
          this.sameMoveHitCount = 1;
        }
      } else {
        this.currentComboCount = 1;
        this.sameMoveHitCount = 1;
      }
      this.lastAttackKind = this.currentAttackKind;
      this.lastComboHitTime = now;

      // ★ 技連打ハメ防止：ダメージスケーリング (Damage Scaling & Stale-Move Negation)
      let scaledDmg = dmg;
      // 1. 同一技の連続ヒット減衰
      if (this.sameMoveHitCount === 2) {
        scaledDmg *= 0.55; // 2連打目は55%
      } else if (this.sameMoveHitCount === 3) {
        scaledDmg *= 0.30; // 3連打目は30%
      } else if (this.sameMoveHitCount >= 4) {
        scaledDmg *= 0.12; // 4連打目以降は12%（ほぼ通らない！）
      }

      // 2. コンボ全体スケーリング
      if (this.currentComboCount === 2) scaledDmg *= 0.85;
      else if (this.currentComboCount === 3) scaledDmg *= 0.70;
      else if (this.currentComboCount === 4) scaledDmg *= 0.55;
      else if (this.currentComboCount >= 5) scaledDmg *= 0.40;

      scaledDmg = Math.max(1, Math.round(scaledDmg));

      this.currentComboDamage += scaledDmg;
      SoundManager.getInstance().playCombo(this.currentComboCount);

      // シーンへコンボイベント通知
      this.scene.events.emit('fighter-combo', {
        attacker: this,
        hits: this.currentComboCount,
        damage: this.currentComboDamage
      });

      // 双方に重厚なヒットストップを適用！
      this.applyHitstop(hitstop);
      this.opponent.applyHitstop(hitstop);

      // ★ 同一弱/中技の3回連続ヒットで強制ダウン！（ハメ完全リセット）
      const isLightOrMedium = k.includes('lp') || k.includes('lk') || k.includes('mp') || k.includes('mk') || k === 'stand_jab' || k === 'crouch_low';
      const forceKnockdown = this.sameMoveHitCount >= 3 && isLightOrMedium;

      this.opponent.takeDamage(scaledDmg, knockbackDir, this.currentAttackKind, this.sameMoveHitCount, forceKnockdown);
      this.createHitEffect(contactX, contactY, this.currentAttackKind);
    }
  }

  // ★ アーマー吸収
  public onArmorAbsorb(): void {
    this.armorHitsLeft--;
    this.setTint(0xfacc15);
    this.scene.time.delayedCall(120, () => this.clearTint());

    SoundManager.getInstance().playHit('medium');

    // アーマー効果音的ポップ
    const t = this.scene.add.text(this.x, this.y - 50, 'ARMOR!', {
      fontFamily: 'impact, sans-serif',
      fontSize: '22px',
      color: '#facc15',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    this.scene.tweens.add({
      targets: t,
      y: this.y - 75,
      alpha: 0,
      duration: 250,
      onComplete: () => t.destroy()
    });
  }

  // ★ ドライブインパクト直撃時（パニッシュカウンター & 膝崩れ）
  public onDriveImpactHit(knockbackDir: number, isPunishCounter: boolean, damage: number = 18): void {
    if (this.isDead) return;

    this.hp = Math.max(0, this.hp - damage);
    this.abortAttack();

    SoundManager.getInstance().playImpact(true);

    if (isPunishCounter) {
      // 膝崩れダウン（Crumple State）
      this.isCrumpled = true;
      this.currentState = 'crumple';
      this.setVelocityX(knockbackDir * 70);
      this.setVelocityY(-60);
      this.setFrame(0);

      // 1.2秒間膝崩れで完全無防備！
      this.scene.time.delayedCall(1200, () => {
        if (!this.isDead) {
          this.isCrumpled = false;
          this.play(`${this.spriteKey}_idle`, true);
        }
      });
    } else {
      // 通常ヒット（大ノックバック）
      this.setVelocityX(knockbackDir * 360);
      this.setVelocityY(-260);
      this.isStunned = true;
      this.play(`${this.spriteKey}_hit`, true);
    }

    this.scene.events.emit('fighter-damaged', this);
    if (this.hp <= 0) {
      this.isDead = true;
      this.play(`${this.spriteKey}_death`, true);
      this.scene.events.emit('fighter-ko', this);
    }
  }

  // ★ ジャストパリィ成功！
  public onJustParrySuccess(): void {
    this.driveGauge = Math.min(this.maxDriveGauge, this.driveGauge + 1.2);
    SoundManager.getInstance().playJustParry();
    // 時が止まる演出（超短いスロー）
    this.scene.cameras.main.flash(180, 255, 255, 255);
    this.scene.cameras.main.shake(140, 0.007);

    const jpText = this.scene.add.text(512, 180, 'JUST PARRY!!', {
      fontFamily: 'impact, sans-serif',
      fontSize: '44px',
      color: '#38bdf8',
      stroke: '#0369a1',
      strokeThickness: 6,
      shadow: { offsetX: 0, offsetY: 0, color: '#0284c7', blur: 20, fill: true, stroke: true }
    }).setOrigin(0.5);

    this.scene.tweens.add({
      targets: jpText,
      scaleX: 1.4,
      scaleY: 1.4,
      alpha: 0,
      duration: 500,
      onComplete: () => jpText.destroy()
    });
  }

  // 通常パリィ成功
  public onParrySuccess(): void {
    this.driveGauge = Math.min(this.maxDriveGauge, this.driveGauge + 0.5);
    SoundManager.getInstance().playParry();
    const pText = this.scene.add.text(this.x, this.y - 45, 'PARRY', {
      fontFamily: 'impact, sans-serif',
      fontSize: '18px',
      color: '#38bdf8',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    this.scene.tweens.add({
      targets: pText,
      y: this.y - 65,
      alpha: 0,
      duration: 200,
      onComplete: () => pText.destroy()
    });
  }

  public onParried(knockbackDir: number): void {
    this.setVelocityX(knockbackDir * -120);
    this.isStunned = true;
    this.abortAttack();
    this.scene.time.delayedCall(300, () => {
      this.isStunned = false;
    });
  }

  public onGuardSuccess(knockbackDir: number): void {
    // ガードプッシュバック増大：守り側をしっかり押し出して連打から脱出可能に
    this.setVelocityX(knockbackDir * 190);
    if (this.opponent) {
      // 攻撃側にも反動を与え、互いの間合いを離す
      this.opponent.setVelocityX(-knockbackDir * 80);
    }
    this.setTint(0x60a5fa);
    this.scene.time.delayedCall(80, () => this.clearTint());
    this.scene.cameras.main.shake(60, 0.002);
    SoundManager.getInstance().playGuard();
  }

  public takeDamage(
    amount: number,
    knockbackDir: number,
    attackKind: AttackKind = 'stand_jab',
    sameMoveCount: number = 1,
    forceKnockdown: boolean = false
  ): void {
    if (this.isDead || this.isInvincible) return;

    // 後隙（リカバリー硬直）中、または技出始めへの被弾は「パニッシュカウンター」！
    const wasPunishCounter = this.isRecovering || (this.isAttacking && this.currentAttackKind !== 'drive_impact');
    if (wasPunishCounter) {
      amount = Math.round(amount * 1.25);
      this.createPunishCounterPopup();
    }

    this.abortAttack();
    this.hp = Math.max(0, this.hp - amount);

    // ★ 同一技3連続ヒットによる強制ダウン（ハメ防止リセット！）
    if (forceKnockdown) {
      this.isInvincible = true;
      this.startInvincibleFlicker(600);
      this.isCrumpled = true;
      this.currentState = 'crumple';
      this.setVelocityX(knockbackDir * 380);
      this.setVelocityY(-260);
      SoundManager.getInstance().playHit('sweep');
      this.createKnockdownPopup();
      this.scene.time.delayedCall(700, () => {
        if (!this.isDead) {
          this.isCrumpled = false;
          this.play(`${this.spriteKey}_idle`, true);
        }
      });
      if (this.hp <= 0) {
        this.isDead = true;
        this.currentState = 'dead';
        this.setVelocityX(knockbackDir * 180);
        this.play(`${this.spriteKey}_death`, true);
        this.scene.events.emit('fighter-ko', this);
      }
      this.scene.events.emit('fighter-damaged', this);
      return;
    }

    this.isInvincible = true;
    this.startInvincibleFlicker(280);

    let intensity: 'light' | 'medium' | 'heavy' | 'sweep' = 'medium';
    let kbX = 220;
    let kbY = -200;
    if (attackKind === 'anti_air' || attackKind === 'stand_hp' || attackKind === 'crouch_hp') {
      kbX = 160;
      kbY = -380; // 高く打ち上げる対空
      intensity = 'heavy';
    } else if (attackKind.startsWith('air_') || attackKind === 'air_kick') {
      kbX = 280;
      kbY = -160;
      intensity = 'medium';
    } else if (attackKind === 'crouch_hk') {
      // 名物大足・足払いスイープでダウン！
      kbX = 280;
      kbY = -220;
      intensity = 'sweep';
      this.isCrumpled = true;
      this.currentState = 'crumple';
      this.scene.time.delayedCall(750, () => {
        if (!this.isDead) {
          this.isCrumpled = false;
          this.play(`${this.spriteKey}_idle`, true);
        }
      });
    } else if (attackKind === 'crouch_low' || attackKind === 'crouch_mk' || attackKind === 'crouch_lk') {
      kbX = 240;
      kbY = -120;
      intensity = 'medium';
    } else if (attackKind.includes('lp') || attackKind.includes('lk') || attackKind === 'stand_jab') {
      kbX = 140;
      kbY = -100;
      intensity = 'light';
    } else if (attackKind === 'super_art') {
      intensity = 'heavy';
    }

    // ★ 技連打プッシュバック増大 (Progressive Pushback):
    // 連続で同一技を受けるごとに外側へ強く吹き飛ぶ！
    if (sameMoveCount === 2) {
      kbX *= 1.7;
    } else if (sameMoveCount >= 3) {
      kbX *= 2.6;
    }

    SoundManager.getInstance().playHit(intensity);

    if (this.isHitstopped) {
      this.postHitstopVelocityX = knockbackDir * kbX;
      this.postHitstopVelocityY = kbY;
      this.setVelocity(0, 0);
    } else {
      this.setVelocityX(knockbackDir * kbX);
      this.setVelocityY(kbY);
    }

    this.setTint(0xffffff);
    this.scene.time.delayedCall(90, () => this.clearTint());

    if (this.hp <= 0) {
      this.isDead = true;
      this.currentState = 'dead';
      this.setVelocityX(knockbackDir * 160);
      this.play(`${this.spriteKey}_death`, true);
      this.scene.events.emit('fighter-ko', this);
    } else {
      this.isStunned = true;
      this.currentState = 'hit';
      this.play(`${this.spriteKey}_hit`, true);
    }

    this.scene.events.emit('fighter-damaged', this);
  }

  private startInvincibleFlicker(duration: number): void {
    this.scene.tweens.add({
      targets: this,
      alpha: 0.4,
      yoyo: true,
      repeat: 3,
      duration: duration / 8,
      onComplete: () => {
        this.setAlpha(1);
        this.isInvincible = false;
      }
    });
  }

  // ★ SF6 ドライブインパクト発動時スプラッシュ演出
  private createDriveImpactStartVisual(): void {
    const splash = this.scene.add.graphics();
    const colors = [0xff007f, 0x00f0ff, 0xffd700]; // SF6カラー：ネオンピンク、シアン、ゴールド

    for (let i = 0; i < 16; i++) {
      const col = colors[i % colors.length];
      const rad = Phaser.Math.Between(15, 45);
      const angle = (i / 16) * Math.PI * 2;
      const dist = Phaser.Math.Between(25, 75);
      splash.fillStyle(col, 0.85);
      splash.fillCircle(this.x + Math.cos(angle) * dist, this.y + Math.sin(angle) * dist, rad);
    }

    this.scene.cameras.main.shake(120, 0.006);

    this.scene.tweens.add({
      targets: splash,
      scaleX: 1.5,
      scaleY: 1.5,
      alpha: 0,
      duration: 350,
      onComplete: () => splash.destroy()
    });
  }

  // ★ ドライブインパクト命中時（極彩色インクスプラッシュ）
  private createDriveImpactHitVisual(x: number, y: number, isPunishCounter: boolean): void {
    const splash = this.scene.add.graphics();
    const colors = [0xff007f, 0x00f0ff, 0xffd700, 0xffffff];

    for (let i = 0; i < 24; i++) {
      const col = colors[i % colors.length];
      const rad = Phaser.Math.Between(20, 55);
      const angle = (i / 24) * Math.PI * 2;
      const dist = Phaser.Math.Between(30, 110);
      splash.fillStyle(col, 0.9);
      splash.fillCircle(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, rad);
    }

    this.scene.cameras.main.shake(isPunishCounter ? 300 : 180, isPunishCounter ? 0.015 : 0.009);

    this.scene.tweens.add({
      targets: splash,
      scaleX: 1.8,
      scaleY: 1.8,
      alpha: 0,
      duration: 500,
      onComplete: () => splash.destroy()
    });

    if (isPunishCounter) {
      const pcText = this.scene.add.text(x, y - 60, 'PUNISH COUNTER!!', {
        fontFamily: 'impact, sans-serif',
        fontSize: '34px',
        color: '#facc15',
        stroke: '#b45309',
        strokeThickness: 6,
        shadow: { offsetX: 0, offsetY: 0, color: '#f59e0b', blur: 20, fill: true, stroke: true }
      }).setOrigin(0.5);

      this.scene.tweens.add({
        targets: pcText,
        scaleX: 1.3,
        scaleY: 1.3,
        alpha: 0,
        duration: 750,
        onComplete: () => pcText.destroy()
      });
    }
  }

  // ★ スーパーアーツ発動時カットイン演出
  private createSuperArtCutinVisual(): void {
    this.scene.cameras.main.flash(200, 245, 158, 11);
    this.scene.cameras.main.shake(220, 0.012);

    const saText = this.scene.add.text(512, 220, 'SUPER ART Lv.1!!', {
      fontFamily: 'impact, sans-serif',
      fontSize: '52px',
      color: '#facc15',
      stroke: '#000000',
      strokeThickness: 8,
      shadow: { offsetX: 0, offsetY: 0, color: '#f59e0b', blur: 30, stroke: true, fill: true }
    }).setOrigin(0.5);

    this.scene.tweens.add({
      targets: saText,
      scaleX: 1.4,
      scaleY: 1.4,
      alpha: 0,
      duration: 600,
      onComplete: () => saText.destroy()
    });
  }

  // ★ 防御オーラ描画（パリィ／立ちガード／しゃがみガード／隙）
  private renderDefensiveAura(): void {
    this.auraGraphics.clear();

    // 1. ドライブパリィ中（青い球状フィールド）
    if (this.isParrying) {
      this.auraGraphics.fillStyle(0x38bdf8, 0.35);
      this.auraGraphics.fillCircle(this.x, this.y, 65);
      this.auraGraphics.lineStyle(3, 0x0284c7, 0.85);
      this.auraGraphics.strokeCircle(this.x, this.y, 62);
      return;
    }

    // 2. ガード中（立ちガード / しゃがみガード）
    if (this.isGuarding) {
      const facing = this.attackFacing;
      const dir = facing === 'right' ? 1 : -1;
      const shieldX = this.x + dir * 34;

      if (this.isCrouching) {
        // しゃがみガード：下段〜中段を覆う青い防御シールド
        const shieldY = this.y + 12;
        this.auraGraphics.fillStyle(0x0ea5e9, 0.28);
        this.auraGraphics.fillRoundedRect(dir > 0 ? shieldX : shieldX - 22, shieldY - 42, 22, 68, 6);
        this.auraGraphics.lineStyle(3, 0x38bdf8, 0.95);
        this.auraGraphics.strokeRoundedRect(dir > 0 ? shieldX : shieldX - 22, shieldY - 42, 22, 68, 6);
        this.auraGraphics.lineStyle(2, 0xffffff, 0.85);
        this.auraGraphics.lineBetween(dir > 0 ? shieldX + 3 : shieldX - 3, shieldY - 25, dir > 0 ? shieldX + 3 : shieldX - 3, shieldY + 15);
      } else {
        // 立ちガード：上半身〜中段を覆うシールド
        const shieldY = this.y - 12;
        this.auraGraphics.fillStyle(0x0ea5e9, 0.28);
        this.auraGraphics.fillRoundedRect(dir > 0 ? shieldX : shieldX - 22, shieldY - 50, 22, 85, 6);
        this.auraGraphics.lineStyle(3, 0x38bdf8, 0.95);
        this.auraGraphics.strokeRoundedRect(dir > 0 ? shieldX : shieldX - 22, shieldY - 50, 22, 85, 6);
        this.auraGraphics.lineStyle(2, 0xffffff, 0.85);
        this.auraGraphics.lineBetween(dir > 0 ? shieldX + 3 : shieldX - 3, shieldY - 35, dir > 0 ? shieldX + 3 : shieldX - 3, shieldY + 15);
      }
      return;
    }

    // 3. 技の後隙（硬直中）の視覚フィードバック
    if (this.isRecovering) {
      // 隙を晒している状態（黄色/薄橙の小さな残像・隙サークル）
      this.auraGraphics.lineStyle(1.5, 0xf59e0b, 0.45);
      this.auraGraphics.strokeCircle(this.x, this.y, 45);
    }
  }

  // ★ パニッシュカウンター表示ポップアップ
  private createPunishCounterPopup(): void {
    const pText = this.scene.add.text(this.x, this.y - 70, 'PUNISH COUNTER!!', {
      fontFamily: 'impact, sans-serif',
      fontSize: '26px',
      color: '#ef4444',
      stroke: '#000000',
      strokeThickness: 5,
      shadow: { offsetX: 0, offsetY: 0, color: '#b91c1c', blur: 18, fill: true, stroke: true }
    }).setOrigin(0.5);

    this.scene.tweens.add({
      targets: pText,
      y: this.y - 110,
      scaleX: 1.25,
      scaleY: 1.25,
      alpha: 0,
      duration: 550,
      onComplete: () => pText.destroy()
    });
  }

  // 攻撃オーラ描画（インパクト時）
  private renderAttackAura(): void {
    if (this.currentAttackKind === 'drive_impact') {
      this.auraGraphics.clear();
      this.auraGraphics.fillStyle(0xec4899, 0.4);
      this.auraGraphics.fillCircle(this.x, this.y, 70);
      this.auraGraphics.lineStyle(4, 0x06b6d4, 0.9);
      this.auraGraphics.strokeCircle(this.x, this.y, 68);
    }
  }

  private createBurnoutStartEffect(): void {
    const text = this.scene.add.text(this.x, this.y - 50, 'BURNOUT!!', {
      fontFamily: 'impact, sans-serif',
      fontSize: '24px',
      color: '#94a3b8',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    this.scene.tweens.add({
      targets: text,
      y: this.y - 80,
      alpha: 0,
      duration: 600,
      onComplete: () => text.destroy()
    });
  }

  private createBurnoutRecoverEffect(): void {
    const text = this.scene.add.text(this.x, this.y - 50, 'DRIVE RECOVERED!', {
      fontFamily: 'impact, sans-serif',
      fontSize: '22px',
      color: '#22c55e',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    this.scene.tweens.add({
      targets: text,
      y: this.y - 80,
      alpha: 0,
      duration: 600,
      onComplete: () => text.destroy()
    });
  }

  private createAttackSwingVisual(kind: AttackKind): void {
    const facing = this.attackFacing;
    const dir = facing === 'right' ? 1 : -1;
    const swing = this.scene.add.graphics();
    const myBody = this.body as Phaser.Physics.Arcade.Body;
    if (!myBody) return;

    const charKey = this.spriteKey;
    const isGladiator = charKey === 'gladiator';
    const isKenji = charKey === 'kenji';
    const isAyane = charKey === 'ayane';
    const isKaizer = charKey === 'kaizer';
    const isKunoichi = charKey === 'kunoichi';

    if (kind === 'anti_air' || kind === 'stand_hp' || kind === 'crouch_hp') {
      // 対空/強打撃
      let color = 0x38bdf8;
      if (isGladiator) color = 0xf59e0b;
      else if (isKenji) color = 0xa855f7;
      else if (isAyane) color = 0x10b981;
      else if (isKaizer) color = 0xef4444;
      else if (isKunoichi) color = 0xc084fc;

      swing.lineStyle(isGladiator || isKaizer ? 8 : 6, color, 0.95);
      swing.beginPath();
      const arcCenterX = this.x + dir * 15;
      const arcCenterY = this.y - 30;
      swing.arc(arcCenterX, arcCenterY, 90, dir > 0 ? -2.0 : -1.1, dir > 0 ? 0.3 : -3.5, dir < 0);
      swing.strokePath();

      if (isGladiator) {
        // グラディエーター: メガトンナックル衝撃波リング
        swing.lineStyle(3, 0xfef08a, 0.9);
        swing.strokeCircle(this.x + dir * 65, this.y - 20, 32);
      } else if (isKaizer) {
        // カイザー: プラズマ爆発リング
        swing.lineStyle(4, 0xf59e0b, 0.95);
        swing.strokeCircle(this.x + dir * 70, this.y - 15, 36);
      } else if (isAyane) {
        // アヤネ: 鳳凰の気功サークル
        swing.lineStyle(3, 0x6ee7b7, 0.9);
        swing.strokeCircle(this.x + dir * 60, this.y - 25, 28);
      } else if (isKunoichi) {
        // くのいち: 忍気サークル
        swing.lineStyle(3, 0xe9d5ff, 0.9);
        swing.strokeCircle(this.x + dir * 55, this.y - 15, 25);
      }
    } else if (kind === 'crouch_hk' || kind === 'crouch_mk' || kind === 'crouch_lk' || kind === 'crouch_low' || kind === 'stand_lk') {
      // 下段・足払い
      let color = kind === 'crouch_hk' ? 0xf59e0b : 0xfacc15;
      if (isGladiator) color = 0xd97706;
      else if (isKenji) color = 0xc084fc;
      else if (isAyane) color = 0x059669;
      else if (isKaizer) color = 0xb91c1c;
      else if (isKunoichi) color = 0x9333ea;

      swing.fillStyle(color, 0.9);
      const w = kind === 'crouch_hk' ? 150 : (kind === 'crouch_mk' ? 130 : 100);
      const startX = dir > 0 ? (this.x) : (this.x - w);
      swing.fillRoundedRect(startX, myBody.bottom - 45, w, 20, 6);
    } else if (kind.startsWith('air_') || kind === 'air_kick') {
      // 飛び込み
      let color = 0x06b6d4;
      if (isGladiator) color = 0xf97316;
      else if (isKenji) color = 0xf43f5e;
      else if (isAyane) color = 0x34d399;
      else if (isKaizer) color = 0xf87171;
      else if (isKunoichi) color = 0xc084fc;

      swing.lineStyle(6, color, 0.95);
      swing.beginPath();
      swing.moveTo(this.x, this.y + 10);
      swing.lineTo(this.x + dir * 105, this.y + 75);
      swing.strokePath();
    } else if (kind === 'stand_hk' || kind === 'stand_mk') {
      // 大キック/中キック
      let color = 0x38bdf8;
      if (isGladiator) color = 0xfbbf24;
      else if (isKenji) color = 0xec4899;
      else if (isAyane) color = 0x10b981;
      else if (isKaizer) color = 0xef4444;
      else if (isKunoichi) color = 0xc084fc;

      swing.lineStyle(7, color, 0.95);
      swing.beginPath();
      swing.arc(this.x, this.y, 80, dir > 0 ? -0.8 : -2.3, dir > 0 ? 0.8 : -3.9, dir < 0);
      swing.strokePath();

      if (isGladiator) {
        swing.fillStyle(0xfde047, 0.85);
        swing.fillCircle(this.x + dir * 85, this.y + 5, 24);
      } else if (isKaizer) {
        // カイザー: バーニア火炎
        swing.fillStyle(0x38bdf8, 0.85);
        swing.fillCircle(this.x + dir * 85, this.y + 5, 26);
      } else if (isAyane) {
        // アヤネ: 百裂サマーソルトの風切波
        swing.lineStyle(4, 0xa7f3d0, 0.9);
        swing.strokeCircle(this.x + dir * 75, this.y - 10, 30);
      } else if (isKunoichi) {
        swing.lineStyle(4, 0xd8b4fe, 0.9);
        swing.strokeCircle(this.x + dir * 75, this.y - 5, 26);
      }
    } else if (kind === 'stand_mp' || kind === 'crouch_mp') {
      // 中打撃: ストレート閃光
      let color = 0x06b6d4;
      if (isGladiator) color = 0xf59e0b;
      else if (isKenji) color = 0x818cf8;
      else if (isAyane) color = 0x34d399;
      else if (isKaizer) color = 0xf87171;
      else if (isKunoichi) color = 0xc084fc;

      swing.lineStyle(5, color, 0.9);
      swing.beginPath();
      swing.moveTo(this.x + dir * 10, this.y);
      swing.lineTo(this.x + dir * 115, this.y);
      swing.strokePath();
    } else {
      // 弱打撃: 素早いジャブ / 突き
      let color = 0xffffff;
      if (isGladiator) color = 0xfef08a;
      else if (isKenji) color = 0xe879f9;
      else if (isAyane) color = 0xa7f3d0;
      else if (isKaizer) color = 0xfca5a5;
      else if (isKunoichi) color = 0xe9d5ff;

      swing.lineStyle(3, color, 0.9);
      swing.beginPath();
      swing.moveTo(this.x + dir * 10, this.y);
      swing.lineTo(this.x + dir * 90, this.y);
      swing.strokePath();
    }

    this.scene.tweens.add({
      targets: swing,
      alpha: 0,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 160,
      onComplete: () => swing.destroy()
    });
  }

  public applyHitstop(durationMs: number): void {
    if (this.isDead) return;
    this.isHitstopped = true;
    this.hitstopUntil = this.scene.time.now + durationMs;
    if (this.anims.isPlaying) {
      this.anims.pause();
    }
  }

  private getHitstopDuration(kind: AttackKind): number {
    switch (kind) {
      case 'drive_impact': return 240;
      case 'stand_hp':
      case 'stand_hk':
      case 'anti_air':
      case 'crouch_hp': return 175;
      case 'crouch_hk': return 160;
      case 'stand_mp':
      case 'crouch_mp':
      case 'stand_mk':
      case 'crouch_mk':
      case 'air_hp':
      case 'air_hk':
      case 'air_kick': return 120;
      case 'stand_lp':
      case 'stand_lk':
      case 'crouch_lp':
      case 'crouch_lk':
      case 'air_lp':
      case 'air_lk':
      case 'stand_jab':
      case 'crouch_low':
      default: return 75;
    }
  }

  // ★ 格闘ゲーム最高峰の演出：残像シャドウ (Ghost Trail)
  private createGhostTrail(): void {
    if (!this.visible || this.isDead) return;
    const ghost = this.scene.add.sprite(this.x, this.y, this.texture.key, this.frame.name);
    ghost.setScale(this.scaleX, this.scaleY);
    ghost.setFlipX(this.flipX);
    ghost.setTint(this.themeColor);
    ghost.setAlpha(0.60);
    ghost.setDepth(this.depth - 1);

    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      scaleX: this.scaleX * 1.05,
      scaleY: this.scaleY * 1.05,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => ghost.destroy()
    });
  }

  // ★ 技連打ハメ強制脱出ポップアップ
  private createKnockdownPopup(): void {
    const text = this.scene.add.text(this.x, this.y - 70, 'BLOW AWAY!!', {
      fontFamily: 'impact, sans-serif',
      fontSize: '28px',
      color: '#facc15',
      stroke: '#b45309',
      strokeThickness: 5
    }).setOrigin(0.5);

    this.scene.tweens.add({
      targets: text,
      y: this.y - 110,
      alpha: 0,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 550,
      ease: 'Quad.easeOut',
      onComplete: () => text.destroy()
    });
  }

  private createLandDust(): void {
    const footY = (this.body as Phaser.Physics.Arcade.Body)?.bottom ?? (this.y + 80);
    for (let i = -1; i <= 1; i += 2) {
      const dust = this.scene.add.circle(this.x + i * 14, footY - 4, 7, 0xd1d5db, 0.7);
      this.scene.tweens.add({
        targets: dust,
        x: this.x + i * 45,
        y: footY - 14,
        scaleX: 1.8,
        scaleY: 0.8,
        alpha: 0,
        duration: 220,
        ease: 'Cubic.easeOut',
        onComplete: () => dust.destroy()
      });
    }
  }

  private createStepDust(): void {
    const footY = (this.body as Phaser.Physics.Arcade.Body)?.bottom ?? (this.y + 80);
    const dir = this.getFacingDirection() === 'right' ? -1 : 1;
    const dust = this.scene.add.circle(this.x + dir * 16, footY - 4, Phaser.Math.Between(4, 7), 0x9ca3af, 0.6);
    this.scene.tweens.add({
      targets: dust,
      x: this.x + dir * Phaser.Math.Between(30, 50),
      y: footY - Phaser.Math.Between(8, 16),
      scale: 1.5,
      alpha: 0,
      duration: 200,
      ease: 'Quad.easeOut',
      onComplete: () => dust.destroy()
    });
  }

  private createGuardEffect(x: number, y: number): void {
    // 1. 六角形 / 円形ネオンシールドバリア
    const shield = this.scene.add.graphics();
    shield.lineStyle(4, 0x38bdf8, 1);
    shield.fillStyle(0x0284c7, 0.4);
    shield.strokeCircle(x, y, 32);
    shield.fillCircle(x, y, 30);
    shield.lineStyle(2, 0xffffff, 0.9);
    shield.strokeCircle(x, y, 20);

    // 2. ガード火花（外側へ鋭く弾かれる光の矢）
    for (let i = 0; i < 6; i++) {
      const angle = Phaser.Math.FloatBetween(-Math.PI * 0.8, -Math.PI * 0.2);
      const spark = this.scene.add.graphics();
      spark.lineStyle(3, 0x67e8f9, 1);
      spark.beginPath();
      spark.moveTo(x, y);
      const endX = x + Math.cos(angle) * Phaser.Math.Between(25, 45);
      const endY = y + Math.sin(angle) * Phaser.Math.Between(25, 45);
      spark.lineTo(endX, endY);
      spark.strokePath();

      this.scene.tweens.add({
        targets: spark,
        alpha: 0,
        scale: 1.3,
        duration: 120,
        onComplete: () => spark.destroy()
      });
    }

    // 3. スタイリッシュ「GUARD」テキスト
    const blockText = this.scene.add.text(x, y - 36, 'GUARD', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '20px',
      color: '#38bdf8',
      stroke: '#0f172a',
      strokeThickness: 4
    }).setOrigin(0.5);

    this.scene.cameras.main.shake(70, 0.003);

    this.scene.tweens.add({
      targets: shield,
      scaleX: 1.35,
      scaleY: 1.35,
      alpha: 0,
      duration: 170,
      ease: 'Quad.easeOut',
      onComplete: () => shield.destroy()
    });

    this.scene.tweens.add({
      targets: blockText,
      y: y - 56,
      scaleX: 1.15,
      scaleY: 1.15,
      alpha: 0,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => blockText.destroy()
    });
  }

  private createHitEffect(x: number, y: number, attackKind: AttackKind): void {
    const isHeavy = attackKind === 'stand_hp' || attackKind === 'stand_hk' || attackKind === 'anti_air' ||
                    attackKind === 'crouch_hp' || attackKind === 'crouch_hk' || attackKind === 'drive_impact' ||
                    attackKind === 'super_art';
    const isMedium = attackKind === 'stand_mp' || attackKind === 'crouch_mp' || attackKind === 'stand_mk' ||
                     attackKind === 'crouch_mk' || attackKind === 'air_hp' || attackKind === 'air_hk' ||
                     attackKind === 'air_kick';

    let label = 'HIT!';
    let labelColor = '#fef08a';
    let palette = [0xfef08a, 0xffffff, 0xfacc15];

    if (attackKind === 'drive_impact') {
      label = 'DRIVE IMPACT!';
      labelColor = '#ec4899';
      palette = [0xec4899, 0x06b6d4, 0xfbbf24, 0xffffff];
      this.scene.cameras.main.shake(260, 0.018);
      this.scene.cameras.main.flash(90, 255, 255, 255, false);
    } else if (isHeavy) {
      label = attackKind === 'crouch_hk' ? 'DOWN!' : (attackKind === 'anti_air' ? 'ANTI-AIR!' : 'HEAVY HIT!');
      labelColor = '#f43f5e';
      palette = [0xf43f5e, 0xfbbf24, 0xffffff, 0xf97316];
      this.scene.cameras.main.shake(190, 0.012);
      this.scene.cameras.main.flash(60, 255, 255, 255, false);
    } else if (isMedium) {
      label = 'MEDIUM HIT!';
      labelColor = '#06b6d4';
      palette = [0x06b6d4, 0x38bdf8, 0xfacc15, 0xffffff];
      this.scene.cameras.main.shake(130, 0.007);
    } else {
      label = 'LIGHT!';
      labelColor = '#fde047';
      palette = [0xfde047, 0xffffff, 0xfacc15];
      this.scene.cameras.main.shake(80, 0.003);
    }

    // 1. 中央スタースパーク閃光（4本〜8本の尖鋭スパイク）
    const star = this.scene.add.graphics();
    star.fillStyle(0xffffff, 1);
    const spikeCount = isHeavy ? 8 : 4;
    const outerRadius = isHeavy ? 42 : 24;
    const innerRadius = isHeavy ? 10 : 6;
    star.beginPath();
    for (let i = 0; i < spikeCount * 2; i++) {
      const r = i % 2 === 0 ? outerRadius : innerRadius;
      const a = (i * Math.PI) / spikeCount;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) star.moveTo(px, py);
      else star.lineTo(px, py);
    }
    star.closePath();
    star.fillPath();

    this.scene.tweens.add({
      targets: star,
      scaleX: 1.8,
      scaleY: 1.8,
      alpha: 0,
      duration: 130,
      onComplete: () => star.destroy()
    });

    // 2. 衝撃波リング（円形ショックウェーブ）
    const ring = this.scene.add.graphics();
    ring.lineStyle(isHeavy ? 5 : 3, palette[0], 0.95);
    ring.strokeCircle(x, y, 16);
    this.scene.tweens.add({
      targets: ring,
      scaleX: isHeavy ? 3.0 : 2.0,
      scaleY: isHeavy ? 3.0 : 2.0,
      alpha: 0,
      duration: 170,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });

    // 3. ★ SF6名物 ネオンインクスプラッター（絵の具粒子が爆発飛散）
    const splatterCount = isHeavy ? 16 : (isMedium ? 10 : 5);
    const hitDir = this.getFacingDirection() === 'right' ? 1 : -1;
    for (let i = 0; i < splatterCount; i++) {
      const color = palette[i % palette.length];
      const radius = Phaser.Math.Between(3, isHeavy ? 9 : 6);
      const dot = this.scene.add.circle(x, y, radius, color, 0.95);
      
      // 相手の背後方向（+斜め上下）に激しく飛散
      const angle = hitDir > 0 
        ? Phaser.Math.FloatBetween(-Math.PI * 0.45, Math.PI * 0.45)
        : Phaser.Math.FloatBetween(Math.PI * 0.55, Math.PI * 1.45);
      const dist = Phaser.Math.Between(45, isHeavy ? 150 : 85);
      const targetX = x + Math.cos(angle) * dist;
      const targetY = y + Math.sin(angle) * dist;

      this.scene.tweens.add({
        targets: dot,
        x: targetX,
        y: targetY,
        scaleX: 0.2,
        scaleY: 0.2,
        alpha: 0,
        duration: Phaser.Math.Between(160, 260),
        ease: 'Quad.easeOut',
        onComplete: () => dot.destroy()
      });
    }

    // 4. フローティング打撃テキスト
    const hitText = this.scene.add.text(x, y - 36, label, {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: isHeavy ? '24px' : '19px',
      color: labelColor,
      stroke: '#050505',
      strokeThickness: 5
    }).setOrigin(0.5);

    this.scene.tweens.add({
      targets: hitText,
      y: y - 65,
      scaleX: 1.25,
      scaleY: 1.25,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => hitText.destroy()
    });
  }
}
