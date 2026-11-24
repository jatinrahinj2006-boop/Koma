import re

pairs = [
    ('popup/popup.js', 'popup/popup.html'),
    ('sidepanel/sidepanel.js', 'sidepanel/sidepanel.html'),
    ('tools/pdf-maker.js', 'tools/pdf-maker.html'),
    ('tools/pdf-dup-checker.js', 'tools/pdf-maker.html')
]

for js_path, html_path in pairs:
    with open(js_path, 'r', encoding='utf-8') as f:
        js = f.read()
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    ids_in_js = re.findall(r'getElementById\(["\']([^"\']+)["\']\)', js)
    missing = []
    for id_val in set(ids_in_js):
        if f'id="{id_val}"' not in html and f"id='{id_val}'" not in html:
            missing.append(id_val)
    if missing:
        print(f'MISMATCH in {js_path} -> {html_path}: {missing}')
    else:
        print(f'{js_path} -> {html_path}: 100% IDs verified! ({len(set(ids_in_js))} unique IDs)')
