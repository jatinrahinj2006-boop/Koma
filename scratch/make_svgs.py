import os

os.makedirs('icons/new_designs', exist_ok=True)

# 1. KOMA (Concept A) - Pure SVG
svg_koma = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <!-- Subtle matte lighting, no tacky neon AI gradients -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#14161D"/>
      <stop offset="100%" stop-color="#0B0C0F"/>
    </linearGradient>
  </defs>

  <!-- Background Squircle with subtle luxury bezel -->
  <rect x="24" y="24" width="464" height="464" rx="104" fill="url(#bgGrad)" stroke="#262A36" stroke-width="3"/>

  <!-- Upper Comic Panel (Koma) -->
  <rect x="156" y="112" width="200" height="104" rx="20" fill="none" stroke="#F4F5F7" stroke-width="22" stroke-linejoin="round"/>
  
  <!-- Vermilion Chapter Seal Accent -->
  <circle cx="256" cy="164" r="18" fill="#E11D48"/>

  <!-- Comic Gutter Gap: 24px -->

  <!-- Lower Panel with Integrated Downward Download Arrow -->
  <!-- Clean geometric polygon forming a downward comic panel chevron -->
  <path d="M 156 248 
           L 156 288 
           L 256 364 
           L 356 288 
           L 356 248" 
        fill="none" 
        stroke="#F4F5F7" 
        stroke-width="22" 
        stroke-linecap="round" 
        stroke-linejoin="round"/>

  <!-- Archive Base Tray / Shelf -->
  <line x1="184" y1="398" x2="328" y2="398" stroke="#F4F5F7" stroke-width="18" stroke-linecap="round"/>
</svg>'''

# 2. TANKO (Concept B: The Modern Manga Monogram "M" + Downward Arrow)
svg_tanko = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGradB" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#14161D"/>
      <stop offset="100%" stop-color="#0B0C0F"/>
    </linearGradient>
  </defs>

  <!-- Background Squircle -->
  <rect x="24" y="24" width="464" height="464" rx="104" fill="url(#bgGradB)" stroke="#262A36" stroke-width="3"/>

  <!-- Left Comic Strip Pillar -->
  <rect x="136" y="132" width="44" height="232" rx="22" fill="#F4F5F7"/>

  <!-- Right Comic Strip Pillar -->
  <rect x="332" y="132" width="44" height="232" rx="22" fill="#F4F5F7"/>

  <!-- Center Downward Chevron / Arrow (Vermilion Red #E11D48) -->
  <!-- Joins into a bold 'M' shape -->
  <path d="M 188 160 L 256 256 L 324 160" 
        fill="none" 
        stroke="#E11D48" 
        stroke-width="36" 
        stroke-linecap="round" 
        stroke-linejoin="round"/>

  <!-- Minimalist Archive Platform -->
  <rect x="156" y="388" width="200" height="18" rx="9" fill="#F4F5F7" opacity="0.9"/>
</svg>'''

# 3. SCROLLVAULT (Concept C: The Minimalist Vertical Scroll Arrow)
svg_scrollvault = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGradC" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#13151C"/>
      <stop offset="100%" stop-color="#0B0C0E"/>
    </linearGradient>
  </defs>

  <!-- Background Squircle -->
  <rect x="24" y="24" width="464" height="464" rx="104" fill="url(#bgGradC)" stroke="#262A36" stroke-width="3"/>

  <!-- Solid Architectural Scroll Silhouette with Negative Space Window -->
  <!-- Vertical Manhwa Strip terminating into a downward chevron -->
  <path d="M 172 120 
           L 340 120 
           A 16 16 0 0 1 356 136
           L 356 280
           A 16 16 0 0 1 348 294
           L 264 366
           A 12 12 0 0 1 248 366
           L 164 294
           A 16 16 0 0 1 156 280
           L 156 136
           A 16 16 0 0 1 172 120 Z" 
        fill="#F4F5F7"/>

  <!-- Inner Negative Space Comic Panel (Cutout into dark canvas) -->
  <rect x="188" y="152" width="136" height="88" rx="12" fill="#101217"/>

  <!-- Inner Crimson Focus Dot (Chapter Bookmark / Inkan Seal) -->
  <circle cx="256" cy="196" r="16" fill="#E11D48"/>

  <!-- Archive Floor Base -->
  <rect x="180" y="392" width="152" height="16" rx="8" fill="#F4F5F7" opacity="0.6"/>
</svg>'''

with open('icons/new_designs/logo_koma.svg', 'w') as f:
    f.write(svg_koma)

with open('icons/new_designs/logo_tanko.svg', 'w') as f:
    f.write(svg_tanko)

with open('icons/new_designs/logo_scrollvault.svg', 'w') as f:
    f.write(svg_scrollvault)

print("Saved SVG files in icons/new_designs/")
