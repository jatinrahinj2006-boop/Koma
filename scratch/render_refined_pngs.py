import os
import math
from PIL import Image, ImageDraw

def render_tanko_hires(size=2048):
    """
    Renders 'TANKO' (The Monogram M + Scroll Chevron + Vault Platform)
    Monogram 'M' formed by two comic strip pillars + center downward chevron.
    """
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    pad = int(size * 0.047)
    r = int(size * 0.203)
    
    # 1. Base Squircle - Matte Obsidian
    bg_fill = (14, 16, 21, 255)       # #0E1015
    border_col = (38, 42, 54, 255)    # #262A36
    border_w = int(size * 0.007)
    
    draw.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=r,
        fill=bg_fill,
        outline=border_col,
        width=border_w
    )
    
    cx = size // 2
    cy = size // 2
    
    paper_white = (244, 245, 247, 255) # #F4F5F7
    vermilion_red = (225, 29, 72, 255)  # #E11D48 (Vibrant lacquer crimson)
    
    # Left Pillar
    p_w = int(size * 0.086) # ~176px
    p_h = int(size * 0.453) # ~928px
    p_top = int(size * 0.258)
    p_r = p_w // 2
    
    left_x1 = int(size * 0.265)
    left_x2 = left_x1 + p_w
    
    draw.rounded_rectangle(
        [left_x1, p_top, left_x2, p_top + p_h],
        radius=p_r,
        fill=paper_white
    )
    
    # Right Pillar
    right_x2 = size - left_x1
    right_x1 = right_x2 - p_w
    
    draw.rounded_rectangle(
        [right_x1, p_top, right_x2, p_top + p_h],
        radius=p_r,
        fill=paper_white
    )
    
    # Center Downward Chevron / Arrow (Vermilion Red)
    # Connects from left pillar to right pillar
    ch_thick = int(size * 0.070) # ~144px
    ch_top = p_top + int(size * 0.055)
    ch_tip = p_top + int(size * 0.26)
    
    ch_left = left_x2 + int(size * 0.015)
    ch_right = right_x1 - int(size * 0.015)
    
    # Chevron path using polygon with rounded cap effect or wide line
    draw.line([(ch_left, ch_top), (cx, ch_tip), (ch_right, ch_top)], 
              fill=vermilion_red, width=ch_thick, joint='round')
    
    # Archive Base Shelf / Platform
    shelf_w = int(size * 0.39)
    shelf_h = int(size * 0.035)
    shelf_y = p_top + p_h + int(size * 0.048)
    
    draw.rounded_rectangle(
        [cx - shelf_w // 2, shelf_y, cx + shelf_w // 2, shelf_y + shelf_h],
        radius=shelf_h // 2,
        fill=(244, 245, 247, 230)
    )
    
    return img

def render_koma_hires(size=2048):
    """
    Renders 'KOMA' (Two stacked comic panels + lower panel terminates in downward chevron)
    """
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    pad = int(size * 0.047)
    r = int(size * 0.203)
    
    bg_fill = (14, 16, 21, 255)
    border_col = (38, 42, 54, 255)
    border_w = int(size * 0.007)
    
    draw.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=r,
        fill=bg_fill,
        outline=border_col,
        width=border_w
    )
    
    cx = size // 2
    paper_white = (244, 245, 247, 255)
    vermilion_red = (225, 29, 72, 255)
    
    # Dimensions
    panel_w = int(size * 0.39)
    x1 = cx - panel_w // 2
    x2 = cx + panel_w // 2
    
    # Top Panel
    stroke_w = int(size * 0.043)
    top_y1 = int(size * 0.218)
    top_h = int(size * 0.203)
    top_y2 = top_y1 + top_h
    corner_r = int(size * 0.039)
    
    draw.rounded_rectangle(
        [x1, top_y1, x2, top_y2],
        radius=corner_r,
        outline=paper_white,
        width=stroke_w
    )
    
    # Vermilion chapter seal dot
    seal_r = int(size * 0.035)
    draw.ellipse(
        [cx - seal_r, (top_y1 + top_y2)//2 - seal_r, cx + seal_r, (top_y1 + top_y2)//2 + seal_r],
        fill=vermilion_red
    )
    
    # Lower Panel (Arrow-shaped frame)
    gutter = int(size * 0.047)
    bot_y1 = top_y2 + gutter
    arr_h = int(size * 0.23)
    shoulder_h = int(size * 0.078)
    
    # Points:
    # (x1, bot_y1) -> (x1, bot_y1 + shoulder_h) -> (cx, bot_y1 + arr_h) -> (x2, bot_y1 + shoulder_h) -> (x2, bot_y1)
    p_left_top = (x1, bot_y1)
    p_left_sh = (x1, bot_y1 + shoulder_h)
    p_tip = (cx, bot_y1 + arr_h)
    p_right_sh = (x2, bot_y1 + shoulder_h)
    p_right_top = (x2, bot_y1)
    
    draw.line([p_left_top, p_left_sh, p_tip, p_right_sh, p_right_top],
              fill=paper_white, width=stroke_w, joint='round')
    
    # Archive tray
    tray_y = bot_y1 + arr_h + int(size * 0.055)
    tray_w = int(size * 0.28)
    tray_h = stroke_w
    draw.rounded_rectangle(
        [cx - tray_w // 2, tray_y, cx + tray_w // 2, tray_y + tray_h],
        radius=tray_h // 2,
        fill=paper_white
    )
    
    return img

os.makedirs('icons/previews', exist_ok=True)

# Render both high res
tanko = render_tanko_hires(2048)
tanko.save('icons/previews/tanko_2048.png')
tanko.resize((512, 512), Image.Resampling.LANCZOS).save('icons/previews/tanko_512.png')
tanko.resize((128, 128), Image.Resampling.LANCZOS).save('icons/previews/tanko_128.png')
tanko.resize((48, 48), Image.Resampling.LANCZOS).save('icons/previews/tanko_48.png')
tanko.resize((16, 16), Image.Resampling.LANCZOS).save('icons/previews/tanko_16.png')

koma = render_koma_hires(2048)
koma.save('icons/previews/koma_2048.png')
koma.resize((512, 512), Image.Resampling.LANCZOS).save('icons/previews/koma_512.png')
koma.resize((128, 128), Image.Resampling.LANCZOS).save('icons/previews/koma_128.png')
koma.resize((48, 48), Image.Resampling.LANCZOS).save('icons/previews/koma_48.png')
koma.resize((16, 16), Image.Resampling.LANCZOS).save('icons/previews/koma_16.png')

print("Rendered hi-res and icons for Tanko and Koma!")
