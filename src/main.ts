import Phaser from 'phaser';
import { SelectScene } from './scenes/SelectScene';
import { GameScene } from './scenes/GameScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1024,
    height: 576
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 1700 },
      debug: false
    }
  },
  input: {
    gamepad: true
  },
  scene: [SelectScene, GameScene]
};

const game = new Phaser.Game(config);

// 全画面表示 (Fullscreen) の切り替え
export function toggleFullscreen(): void {
  if (!document.fullscreenElement) {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if ((el as any).webkitRequestFullscreen) {
      (el as any).webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if ((document as any).webkitExitFullscreen) {
      (document as any).webkitExitFullscreen();
    }
  }
}

// フルスクリーンボタン＆状態同期
const fsBtn = document.getElementById('fullscreen-btn');
const fsEnterIcon = document.getElementById('fs-icon-enter');
const fsExitIcon = document.getElementById('fs-icon-exit');
const fsText = document.getElementById('fs-text');

if (fsBtn) {
  fsBtn.addEventListener('click', () => {
    toggleFullscreen();
  });
}

function updateFullscreenUI(): void {
  const isFs = !!document.fullscreenElement;
  if (fsEnterIcon && fsExitIcon && fsText) {
    fsEnterIcon.style.display = isFs ? 'none' : 'block';
    fsExitIcon.style.display = isFs ? 'block' : 'none';
    fsText.textContent = isFs ? '通常表示 [F]' : '全画面 [F]';
  }
  setTimeout(() => {
    game.scale.refresh();
  }, 100);
}

document.addEventListener('fullscreenchange', updateFullscreenUI);
document.addEventListener('webkitfullscreenchange', updateFullscreenUI);

window.addEventListener('resize', () => {
  game.scale.refresh();
});

// キーボードショートカット: 'F' で全画面トグル, 'Escape' で全画面解除またはホームへ戻る
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyF') {
    toggleFullscreen();
  } else if (e.code === 'Escape') {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      e.preventDefault();
      return;
    }
    const homeGuide = document.getElementById('home-guide') as HTMLAnchorElement | null;
    if (homeGuide && homeGuide.getAttribute('href')) {
      window.location.href = homeGuide.getAttribute('href')!;
    }
  }
});
