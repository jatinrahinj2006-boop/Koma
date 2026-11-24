import os
import math
from PIL import Image, ImageDraw

os.makedirs('scratch/renders', exist_ok=True)

def create_squircle_canvas(size=2048, pad=120, radius=420):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Premium Matte Obsidian Background (#0C0D10)
    bg_fill = (12, 13, 16, 255)
    border_col = (34, 38, 48, 255)
    border_w = int(size * 0.008) # ~16px
    
    # Outer squircle
    draw.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=radius,
        fill=bg_fill,
        outline=border_col,
        width=border_w
    )
    return img, draw

def render_concept_a(size=2048):
    """
    Concept A: 'Koma Drop' (Vertical Manhwa Panels + Downward Flow + Ink Seal)
    Consists of:
    - Upper Manga panel (curved rectangle) with a refined Vermilion ink dot (#E53E3E / #E11D48)
    - Clean comic gutter
    - Lower Panel shaped as a bold, sleek downward chevron / arrow
    - Solid, confident geometry, perfect optical balance.
    """
    img, draw = create_squircle_canvas(size)
    cx = size // 2
    cy = size // 2
    
    # Dimensions based on 2048
    strip_w = int(size * 0.44)       # ~900px wide
    panel_h = int(size * 0.23)       # ~470px high for top panel
    corner_r = int(size * 0.045)     # ~92px rounded corners
    gutter = int(size * 0.042)       # ~86px gutter gap
    
    top_y1 = int(size * 0.23)
    top_y2 = top_y1 + panel_h
    left_x = cx - (strip_w // 2)
    right_x = cx + (strip_w // 2)
    
    # White / Pure Paper color
    paper_white = (248, 249, 250, 255)
    vermilion_red = (229, 62, 62, 255) # Classic manga stamp red #E53E3E
    
    # 1. Top Panel (Solid rounded rectangle with an inner cutout or elegant solid frame)
    # Let's make the panels bold frames with thick border or solid silhouettes:
    # A solid silhouette with negative space cutout gives immense contrast at 16x16!
    # Let's test thick frame (stroke = 72px)
    stroke_w = int(size * 0.038) # ~78px
    
    # Upper panel: Rounded rectangle frame
    draw.rounded_rectangle(
        [left_x, top_y1, right_x, top_y2],
        radius=corner_r,
        outline=paper_white,
        width=stroke_w
    )
    
    # Upper panel inner element: A Japanese/Korean seal dot or mini chapter line
    # A circular red seal at the center or right side of top panel
    seal_r = int(size * 0.038)
    draw.ellipse(
        [cx - seal_r, (top_y1 + top_y2)//2 - seal_r, cx + seal_r, (top_y1 + top_y2)//2 + seal_r],
        fill=vermilion_red
    )
    
    # 2. Lower Panel / Downward Arrow
    # Starts after gutter below top_y2
    bot_y1 = top_y2 + gutter
    arrow_tip_y = int(size * 0.77)
    
    # Let's draw a thick downward chevron arrow
    # Points of chevron: Left top, Center bottom tip, Right top, etc.
    # Chevron with rounded/beveled corners or polygon:
    chevron_thick = int(size * 0.09) # ~184px thick chevron band
    
    # Outer points:
    # Left shoulder: (left_x, bot_y1)
    # Center apex: (cx, arrow_tip_y)
    # Right shoulder: (right_x, bot_y1)
    # Inner apex: (cx, arrow_tip_y - chevron_thick)
    # Inner left: (left_x + inset, bot_y1) -> or clean parallel chevron
    
    # Let's compute parallel chevron:
    # Slope angle: from (left_x, bot_y1) to (cx, arrow_tip_y - offset)
    # A clean downward chevron:
    p1 = (left_x, bot_y1)
    p2 = (cx, int(bot_y1 + (right_x - left_x) * 0.38))
    p3 = (right_x, bot_y1)
    
    # To make it feel like a comic panel, let's look at an arrow with vertical shoulders!
    # Like a house upside down: vertical sides, then 45 degree arrow point!
    # Left side: (left_x, bot_y1) to (left_x, bot_y1 + int(size*0.09))
    # Point: (cx, arrow_tip_y)
    # Right side: (right_x, bot_y1 + int(size*0.09)) to (right_x, bot_y1)
    
    # Let's construct this polygon:
    stem_h = int(size * 0.08)
    poly_outer = [
        (left_x, bot_y1),
        (left_x, bot_y1 + stem_h),
        (cx, arrow_tip_y),
        (right_x, bot_y1 + stem_h),
        (right_x, bot_y1)
    ]
    
    # Draw solid chevron or outline:
    draw.polygon(poly_outer, fill=paper_white)
    
    # Cutout inside lower chevron to make it an open frame matching top panel:
    inner_pad = stroke_w
    inner_stem_h = max(0, stem_h - inner_pad)
    poly_inner = [
        (left_x + inner_pad, bot_y1),
        (left_x + inner_pad, bot_y1 + inner_stem_h),
        (cx, arrow_tip_y - int(inner_pad * 1.414)),
        (right_x - inner_pad, bot_y1 + inner_stem_h),
        (right_x - inner_pad, bot_y1)
    ]
    draw.polygon(poly_inner, fill=(12, 13, 16, 255))
    
    return img

def render_concept_b(size=2048):
    """
    Concept B: 'The Monogram M + Scroll Chevron'
    Two vertical comic strips/pillars flanking a central downward chevron,
    forming a distinct modern 'M' (Manga/Manhwa) + download symbol.
    """
    img, draw = create_squircle_canvas(size)
    cx = size // 2
    cy = size // 2
    
    paper_white = (248, 249, 250, 255)
    vermilion_red = (229, 62, 62, 255)
    
    # Total width of the M
    m_w = int(size * 0.46)
    m_h = int(size * 0.48)
    
    left = cx - m_w // 2
    right = cx + m_w // 2
    top = cy - m_h // 2
    bottom = cy + m_h // 2
    
    bar_w = int(size * 0.085)
    corner_r = int(bar_w // 2)
    
    # Left vertical pillar (comic strip)
    draw.rounded_rectangle(
        [left, top, left + bar_w, bottom],
        radius=corner_r,
        fill=paper_white
    )
    
    # Right vertical pillar (comic strip)
    draw.rounded_rectangle(
        [right - bar_w, top, right, bottom],
        radius=corner_r,
        fill=paper_white
    )
    
    # Center Downward Chevron / Arrow
    # Spanning from left+bar_w to right-bar_w
    # Starts at top, dips down to center-bottom
    arrow_top = top + int(size * 0.02)
    arrow_dip = bottom - int(size * 0.02)
    
    # A bold centered arrow pointing down
    arrow_w = int((right - bar_w) - (left + bar_w))
    arrow_left = left + bar_w + int(size * 0.025)
    arrow_right = right - bar_w - int(size * 0.025)
    arrow_cx = (arrow_left + arrow_right) // 2
    
    # Downward chevron coordinates
    ch_thick = int(bar_w * 0.95)
    
    p1 = (arrow_left, arrow_top)
    p2 = (arrow_cx, arrow_dip - ch_thick)
    p3 = (arrow_right, arrow_top)
    p4 = (arrow_right, arrow_top + ch_thick)
    p5 = (arrow_cx, arrow_dip)
    p6 = (arrow_left, arrow_top + ch_thick)
    
    draw.polygon([p1, p2, p3, p4, p5, p6], fill=vermilion_red)
    
    # Subtle archive base plate / tray at bottom
    tray_y = bottom + int(size * 0.05)
    tray_h = int(size * 0.028)
    draw.rounded_rectangle(
        [left - int(size*0.02), tray_y, right + int(size*0.02), tray_y + tray_h],
        radius=tray_h // 2,
        fill=paper_white
    )
    
    return img

def render_concept_c(size=2048):
    """
    Concept C: 'The Infinite Strip' (Pure Swiss / Japanese Minimalist)
    A single clean vertical scroll ribbon with 3 panels:
    - Top panel: Open comic frame
    - Middle panel: Divider / transition
    - Bottom: Bold downward chevron
    Monochromatic with a single crimson focal point.
    """
    img, draw = create_squircle_canvas(size)
    cx = size // 2
    cy = size // 2
    
    paper_white = (248, 249, 250, 255)
    vermilion_red = (229, 62, 62, 255)
    ink_black = (12, 13, 16, 255)
    
    # Overall strip dimensions
    strip_w = int(size * 0.38) # ~780px
    strip_x1 = cx - strip_w // 2
    strip_x2 = cx + strip_w // 2
    
    y_start = int(size * 0.22)
    stroke_w = int(size * 0.045)
    r = int(size * 0.04)
    
    # Let's create an iconic composition:
    # 1. Top Panel: Rectangular comic frame with 1 crimson vertical line (the manga spine / focus)
    top_h = int(size * 0.22)
    top_y2 = y_start + top_h
    
    draw.rounded_rectangle(
        [strip_x1, y_start, strip_x2, top_y2],
        radius=r,
        outline=paper_white,
        width=stroke_w
    )
    
    # Vermilion chapter indicator inside top panel (a clean horizontal capsule)
    cap_w = int(strip_w * 0.4)
    cap_h = int(stroke_w * 0.8)
    draw.rounded_rectangle(
        [cx - cap_w//2, (y_start + top_y2)//2 - cap_h//2, cx + cap_w//2, (y_start + top_y2)//2 + cap_h//2],
        radius=cap_h//2,
        fill=vermilion_red
    )
    
    # 2. Downward Arrow / Bottom Panel
    gutter = int(size * 0.045)
    arr_y1 = top_y2 + gutter
    arr_h = int(size * 0.26)
    arr_y2 = arr_y1 + arr_h
    
    # Chevron path with stroke
    # A bold downward chevron
    p_left = (strip_x1, arr_y1)
    p_mid = (cx, arr_y2)
    p_right = (strip_x2, arr_y1)
    
    # Draw smooth thick chevron using lines
    draw.line([p_left, p_mid, p_right], fill=paper_white, width=stroke_w, joint='round')
    
    # Add a horizontal collector bar / archive plate at the bottom
    plate_y = arr_y2 + int(size * 0.06)
    plate_w = int(strip_w * 1.05)
    plate_h = stroke_w
    draw.rounded_rectangle(
        [cx - plate_w//2, plate_y, cx + plate_w//2, plate_y + plate_h],
        radius=plate_h // 2,
        fill=paper_white
    )
    
    return img

# Render and save all three
for name, func in [('concept_a', render_concept_a), ('concept_b', render_concept_b), ('concept_c', render_concept_c)]:
    im = func(2048)
    im.save(f'scratch/renders/{name}_2048.png')
    # Also save downscaled versions
    im.resize((512, 512), Image.Resampling.LANCZOS).save(f'scratch/renders/{name}_512.png')
    im.resize((128, 128), Image.Resampling.LANCZOS).save(f'scratch/renders/{name}_128.png')
    im.resize((48, 48), Image.Resampling.LANCZOS).save(f'scratch/renders/{name}_48.png')
    im.resize((16, 16), Image.Resampling.LANCZOS).save(f'scratch/renders/{name}_16.png')
    print(f'Rendered {name}')
