export interface FighterControls {
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  jump: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  // SF6 6ボタン
  lp?: Phaser.Input.Keyboard.Key;
  mp?: Phaser.Input.Keyboard.Key;
  hp?: Phaser.Input.Keyboard.Key;
  lk?: Phaser.Input.Keyboard.Key;
  mk?: Phaser.Input.Keyboard.Key;
  hk?: Phaser.Input.Keyboard.Key;
  // 特殊システム
  impact?: Phaser.Input.Keyboard.Key;
  parry?: Phaser.Input.Keyboard.Key;
  superArt?: Phaser.Input.Keyboard.Key;
  // 互換性用
  attacks: Phaser.Input.Keyboard.Key[];
  heavyAttacks?: Phaser.Input.Keyboard.Key[];
}

export interface FighterConfig {
  id: string;
  name: string;
  x: number;
  y: number;
  spriteKey: string;
  themeColor: number;
  initialFacingLeft: boolean;
  nativeFacing?: 'left' | 'right';
  isCPU?: boolean;
  keys?: {
    left?: number;
    right?: number;
    jump?: number;
    down?: number;
    lp?: number;
    mp?: number;
    hp?: number;
    lk?: number;
    mk?: number;
    hk?: number;
    attacks?: number[];
    heavyAttacks?: number[];
    impact?: number;
    parry?: number;
    superArt?: number;
  };
}

export type FighterState = 
  | 'idle' 
  | 'running' 
  | 'jumping' 
  | 'falling' 
  | 'attacking' 
  | 'crouching' 
  | 'guarding' 
  | 'parrying'
  | 'impact'
  | 'crumple'
  | 'hit' 
  | 'dead'
  | 'recovery';

export type AttackKind = 
  | 'throw'
  | 'throw_whiff'
  | 'stand_lp'
  | 'stand_mp'
  | 'stand_hp'
  | 'stand_lk'
  | 'stand_mk'
  | 'stand_hk'
  | 'crouch_lp'
  | 'crouch_mp'
  | 'crouch_hp'
  | 'crouch_lk'
  | 'crouch_mk'
  | 'crouch_hk'
  | 'air_lp'
  | 'air_hp'
  | 'air_lk'
  | 'air_hk'
  | 'stand_jab' 
  | 'crouch_low' 
  | 'anti_air' 
  | 'air_kick' 
  | 'drive_impact' 
  | 'super_art';

