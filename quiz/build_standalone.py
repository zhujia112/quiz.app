#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 styles.css + bank.js + app.js 内联进 index.html，生成自包含 standalone.html。
用法：在 quiz/ 目录下运行  python build_standalone.py
校正题目后：先改 bank.json -> 由 extract.py 生成 bank.js -> 再跑本脚本生成 standalone.html。
"""
import pathlib

d = pathlib.Path(__file__).resolve().parent
html = (d / "index.html").read_text(encoding="utf-8")
css = (d / "styles.css").read_text(encoding="utf-8")
bank = (d / "bank.js").read_text(encoding="utf-8")
app = (d / "app.js").read_text(encoding="utf-8")

# 移除外链样式与外链脚本
html = html.replace('<link rel="stylesheet" href="styles.css" />', '')
html = html.replace('<script src="bank.js"></script>', '')
html = html.replace('<script src="app.js"></script>', '')

# 注入内联样式（紧跟 <title> 之后）
html = html.replace('<title>软考做题小程序</title>',
                    '<title>软考做题小程序</title>\n<style>%s</style>' % css)
# 注入内联脚本（</body> 之前）
html = html.replace('</body>',
                    '<script>%s</script>\n<script>%s</script>\n</body>' % (bank, app))

out = d / "standalone.html"
out.write_text(html, encoding="utf-8")
print("生成:", out, "大小:", out.stat().st_size, "字节")
print("包含 id=pbar:", 'id="pbar"' in html)
print("无裸 $().firstElementChild pbar 调用:", '$("#pbar").firstElementChild' not in app)
