import Phaser from 'phaser';
import { Fighter } from './Fighter';
import { SoundManager } from '../utils/SoundManager';

export interface ProjectileConfig {
  scene: Phaser.Scene;
  owner: Fighter;
  target: Fighter;
  x: number;
  y: number;
  direction: 'left' | 'right';
  speed?: number;
  damage?: number;
  textureKey?: string;
  particleColor?: number;
  hitColor?: number;
  hitboxWidth?: number;
  hitboxHeight?: number;
  scale?: number;
}

export class Projectile extends Phaser.GameObjects.Container {
  public owner: Fighter;
  public target: Fighter;
  public vx: number;
  public damage: number;
  public isActive: boolean = true;

  private sprite: Phaser.GameObjects.Sprite;
  private trailTimer: number = 0;
  private particleColor: number;
  private hitColor: number;
  private hitboxWidth: number;
  private hitboxHeight: number;

  constructor(config: ProjectileConfig) {
    super(config.scene, config.x, config.y);
    this.owner = config.owner;
    this.target = config.target;
    this.damage = config.damage ?? 2;
    const speed = config.speed ?? 420;
    this.vx = config.direction === 'right' ? speed : -speed;
    this.particleColor = config.particleColor ?? 0xc084fc;
    this.hitColor = config.hitColor ?? 0xc084fc;
    this.hitboxWidth = config.hitboxWidth ?? 22;
    this.hitboxHeight = config.hitboxHeight ?? 10;

    config.scene.add.existing(this);

    // Sprite
    const tex = config.textureKey || 'kunoichi_kunai';
    this.sprite = config.scene.add.sprite(0, 0, tex);
    this.sprite.setScale(config.scale ?? 2.0);
    if (config.direction === 'left') {
      this.sprite.setFlipX(true);
    }
    this.add(this.sprite);

    // Projectile depth
    this.setDepth(25);
  }

  public update(time: number, delta: number): void {
    if (!this.isActive) return;

    const dt = delta / 1000;
    this.x += this.vx * dt;

    // Aerodynamic rotation
    this.sprite.rotation = Math.sin(time * 0.02) * 0.08;

    // Trailing particles
    this.trailTimer += delta;
    if (this.trailTimer > 35) {
      this.trailTimer = 0;
      this.createTrailParticle();
    }

    // Screen bound check
    if (this.x < -60 || this.x > 1084) {
      this.destroyProjectile();
      return;
    }

    // Collision check against target
    this.checkCollision();
  }

  private createTrailParticle(): void {
    const particle = this.scene.add.circle(
      this.x - (this.vx > 0 ? 15 : -15),
      this.y + Phaser.Math.Between(-3, 3),
      Phaser.Math.Between(2, 4),
      this.particleColor,
      0.75
    );
    particle.setDepth(24);
    this.scene.tweens.add({
      targets: particle,
      alpha: 0,
      scale: 0.3,
      duration: 180,
      onComplete: () => particle.destroy()
    });
  }

  private checkCollision(): void {
    if (!this.target || this.target.isDead) return;
    const hurtbox = this.target.getHurtbox();
    if (!hurtbox) return;

    // Projectile hitbox
    const hw = this.hitboxWidth / 2;
    const hh = this.hitboxHeight / 2;
    const myHitbox = new Phaser.Geom.Rectangle(this.x - hw, this.y - hh, this.hitboxWidth, this.hitboxHeight);

    if (Phaser.Geom.Intersects.RectangleToRectangle(myHitbox, hurtbox)) {
      this.onHitTarget();
    }
  }

  private onHitTarget(): void {
    this.isActive = false;
    const knockbackDir = this.vx > 0 ? 1 : -1;
    const isGuarding = this.target.isGuarding;

    if (isGuarding) {
      this.target.consumeDrive(0.02);
      this.target.onGuardSuccess(knockbackDir);
      SoundManager.getInstance().playGuard();
      this.createHitSpark(0x60a5fa);
    } else {
      this.target.takeDamage(this.damage, knockbackDir, 'stand_lp');
      SoundManager.getInstance().playHit('light');
      this.createHitSpark(this.hitColor);
    }

    this.destroyProjectile();
  }

  private createHitSpark(color: number): void {
    for (let i = 0; i < 8; i++) {
      const spark = this.scene.add.circle(this.x, this.y, Phaser.Math.Between(3, 6), color, 0.9);
      spark.setDepth(90);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.Between(20, 45);
      this.scene.tweens.add({
        targets: spark,
        x: this.x + Math.cos(angle) * dist,
        y: this.y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.2,
        duration: 200,
        onComplete: () => spark.destroy()
      });
    }
  }

  public destroyProjectile(): void {
    this.isActive = false;
    this.destroy();
  }
}
