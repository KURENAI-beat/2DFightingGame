import build_gladiator_assets as bg
import math

w1, h1, p1 = bg.load_png('/Users/kurenai/.gemini/antigravity/scratch/phaser-fighter/top_left.png')
w2, h2, p2 = bg.load_png('/Users/kurenai/.gemini/antigravity/scratch/phaser-fighter/bot_left.png')
w3, h3, p3 = bg.load_png('/Users/kurenai/.gemini/antigravity/scratch/phaser-fighter/top_center.png')

top_left = bg.crop_and_scale(p1, w1, h1, 62)
bot_left = bg.crop_and_scale(p2, w2, h2, 62)
top_center = bg.crop_and_scale(p3, w3, h3, 62)

out_dir = '/Users/kurenai/.gemini/antigravity/scratch/phaser-fighter/public/assets/gladiator'

# A. Idle (4 frames)
idle_f0 = bg.create_frame(bot_left, offset_x=0, offset_y=0)
idle_f1 = bg.create_frame(bot_left, offset_x=0, offset_y=1)
idle_f2 = bg.create_frame(top_left, offset_x=0, offset_y=0)
idle_f3 = bg.create_frame(top_left, offset_x=0, offset_y=-1)
w, h, data = bg.assemble_spritesheet([idle_f0, idle_f1, idle_f2, idle_f3])
bg.write_png(f'{out_dir}/Idle.png', w, h, data)
print('Generated Idle.png (4 frames)')

# B. Run (8 frames)
run_frames = []
for i in range(8):
    bob = [ -2, 0, 2, 0, -2, 0, 2, 0 ][i]
    fwd = [ 0, 2, 4, 3, 0, 2, 4, 3 ][i]
    base_pose = bot_left if (i % 2 == 0) else top_left
    run_frames.append(bg.create_frame(base_pose, offset_x=fwd, offset_y=bob))
w, h, data = bg.assemble_spritesheet(run_frames)
bg.write_png(f'{out_dir}/Run.png', w, h, data)
print('Generated Run.png (8 frames)')

# C. Jump (2 frames)
jump_f0 = bg.create_frame(top_left, offset_x=0, offset_y=-5)
jump_f1 = bg.create_frame(bot_left, offset_x=0, offset_y=-12)
w, h, data = bg.assemble_spritesheet([jump_f0, jump_f1])
bg.write_png(f'{out_dir}/Jump.png', w, h, data)
print('Generated Jump.png (2 frames)')

# D. Fall (2 frames)
fall_f0 = bg.create_frame(bot_left, offset_x=0, offset_y=-8)
fall_f1 = bg.create_frame(top_left, offset_x=0, offset_y=-2)
w, h, data = bg.assemble_spritesheet([fall_f0, fall_f1])
bg.write_png(f'{out_dir}/Fall.png', w, h, data)
print('Generated Fall.png (2 frames)')

# E. Attack1 (4 frames)
atk1_f0 = bg.create_frame(bot_left, offset_x=-3, offset_y=0)
atk1_f1 = bg.create_frame(bg.punch_extend(top_left, 14), offset_x=4, offset_y=0)
atk1_f2 = bg.create_frame(bg.punch_extend(top_left, 24), offset_x=8, offset_y=0)
atk1_f3 = bg.create_frame(top_left, offset_x=2, offset_y=0)
w, h, data = bg.assemble_spritesheet([atk1_f0, atk1_f1, atk1_f2, atk1_f3])
bg.write_png(f'{out_dir}/Attack1.png', w, h, data)
print('Generated Attack1.png (4 frames)')

# F. Attack2 (6 frames)
atk2_f0 = bg.create_frame(top_center, offset_x=-6, offset_y=-2)
atk2_f1 = bg.create_frame(top_left, offset_x=4, offset_y=0)
atk2_f2 = bg.create_frame(bg.punch_extend(top_left, 32), offset_x=12, offset_y=0)
atk2_f3 = bg.create_frame(bg.punch_extend(top_left, 36), offset_x=14, offset_y=0)
atk2_f4 = bg.create_frame(bg.punch_extend(top_left, 16), offset_x=6, offset_y=0)
atk2_f5 = bg.create_frame(bot_left, offset_x=0, offset_y=0)
w, h, data = bg.assemble_spritesheet([atk2_f0, atk2_f1, atk2_f2, atk2_f3, atk2_f4, atk2_f5])
bg.write_png(f'{out_dir}/Attack2.png', w, h, data)
print('Generated Attack2.png (6 frames)')

# G. Take Hit (3 frames)
hit_f0 = bg.create_frame(bg.rotate_sprite(bot_left, math.radians(-12)), offset_x=-12, offset_y=-3, tint=[255, 100, 100, 0.4])
hit_f1 = bg.create_frame(bg.rotate_sprite(bot_left, math.radians(-8)), offset_x=-8, offset_y=-1)
hit_f2 = bg.create_frame(top_left, offset_x=-3, offset_y=0)
w, h, data = bg.assemble_spritesheet([hit_f0, hit_f1, hit_f2])
bg.write_png(f'{out_dir}/Take Hit.png', w, h, data)
print('Generated Take Hit.png (3 frames)')

# H. Death (6 frames)
d_f0 = bg.create_frame(bg.rotate_sprite(bot_left, math.radians(-25)), offset_x=-14, offset_y=-10)
d_f1 = bg.create_frame(bg.rotate_sprite(bot_left, math.radians(-50)), offset_x=-25, offset_y=-14)
d_f2 = bg.create_frame(bg.rotate_sprite(bot_left, math.radians(-75)), offset_x=-36, offset_y=-4)
d_f3 = bg.create_frame(bg.rotate_sprite(bot_left, math.radians(-90)), offset_x=-42, offset_y=16)
d_f4 = bg.create_frame(bg.rotate_sprite(bot_left, math.radians(-90)), offset_x=-44, offset_y=13)
d_f5 = bg.create_frame(bg.rotate_sprite(bot_left, math.radians(-90)), offset_x=-45, offset_y=16)
w, h, data = bg.assemble_spritesheet([d_f0, d_f1, d_f2, d_f3, d_f4, d_f5])
bg.write_png(f'{out_dir}/Death.png', w, h, data)
print('Generated Death.png (6 frames)')

print('SUCCESS!')
