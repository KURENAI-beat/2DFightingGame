import zlib, struct, os, math
import build_gladiator_assets as bg

w1, h1, p1 = bg.load_png('/Users/kurenai/.gemini/antigravity/scratch/phaser-fighter/top_left.png')
w2, h2, p2 = bg.load_png('/Users/kurenai/.gemini/antigravity/scratch/phaser-fighter/bot_left.png')
w3, h3, p3 = bg.load_png('/Users/kurenai/.gemini/antigravity/scratch/phaser-fighter/top_center.png')
w4, h4, p4 = bg.load_png('/Users/kurenai/.gemini/antigravity/scratch/phaser-fighter/bot_right.png')

top_left = bg.crop_and_scale(p1, w1, h1, 62)
bot_left = bg.crop_and_scale(p2, w2, h2, 62)
top_center = bg.crop_and_scale(p3, w3, h3, 62)
bot_right = bg.crop_and_scale(p4, w4, h4, 62)

out_dir = '/Users/kurenai/.gemini/antigravity/scratch/phaser-fighter/public/assets/gladiator'

# 1. Spartan Kick (4 frames)
def make_spartan_kick(sprite, reach_px):
    sh = len(sprite)
    sw = len(sprite[0])
    new_w = sw + reach_px
    res = [[[0,0,0,0] for _ in range(new_w)] for _ in range(sh)]
    # Copy upper body with slight lean-back (-4px)
    for y in range(sh):
        for x in range(sw):
            if y < sh * 0.55: # upper body
                res[y][x] = sprite[y][x]
            else: # back leg / lower body
                if x < sw * 0.6:
                    res[y][x] = sprite[y][x]
    # Draw straight horizontal Spartan kicking leg
    leg_y = int(sh * 0.62)
    boot_color = [88, 48, 32, 255]
    boot_outline = [35, 20, 15, 255]
    skin_color = [238, 172, 126, 255]
    kilt_color = [120, 65, 40, 255]
    
    # Kicking thigh & leg extending out
    for x in range(int(sw * 0.45), new_w - 6):
        for dy in range(-3, 4):
            fy = leg_y + dy
            if 0 <= fy < sh:
                col = kilt_color if x < sw * 0.7 else skin_color
                if abs(dy) == 3: col = boot_outline
                res[fy][x] = col
    # Boot at tip
    for x in range(new_w - 7, new_w):
        for dy in range(-4, 6):
            fy = leg_y + dy
            if 0 <= fy < sh:
                is_out = abs(dy) >= 4 or x == new_w - 1
                res[fy][x] = boot_outline if is_out else boot_color
    return res

kick_f0 = bg.create_frame(bot_left, offset_x=-4, offset_y=-1)
kick_f1 = bg.create_frame(make_spartan_kick(bot_left, 16), offset_x=2, offset_y=-2)
kick_f2 = bg.create_frame(make_spartan_kick(bot_left, 28), offset_x=6, offset_y=-3)
kick_f3 = bg.create_frame(top_left, offset_x=0, offset_y=0)

w, h, data = bg.assemble_spritesheet([kick_f0, kick_f1, kick_f2, kick_f3])
bg.write_png(f'{out_dir}/Kick.png', w, h, data)
print('Generated Kick.png (4 frames)')

# 2. Impact / Flex Armor Charge (4 frames)
imp_f0 = bg.create_frame(top_center, offset_x=0, offset_y=0)
imp_f1 = bg.create_frame(top_center, offset_x=0, offset_y=-3, tint=[255, 215, 0, 0.35])
imp_f2 = bg.create_frame(bot_right, offset_x=6, offset_y=0, tint=[255, 100, 50, 0.4])
imp_f3 = bg.create_frame(bg.punch_extend(top_left, 34), offset_x=12, offset_y=0)

w, h, data = bg.assemble_spritesheet([imp_f0, imp_f1, imp_f2, imp_f3])
bg.write_png(f'{out_dir}/Impact.png', w, h, data)
print('Generated Impact.png (4 frames)')

# 3. Crouch pose (2 frames)
# Low stance crouch
crouch_f0 = bg.create_frame(top_left, offset_x=0, offset_y=3)
crouch_f1 = bg.create_frame(top_left, offset_x=0, offset_y=4)
w, h, data = bg.assemble_spritesheet([crouch_f0, crouch_f1])
bg.write_png(f'{out_dir}/Crouch.png', w, h, data)
print('Generated Crouch.png (2 frames)')

print('=== Extended Gladiator Animations Generated! ===')
