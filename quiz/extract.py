# -*- coding: utf-8 -*-
"""
从《计算题专题、真题答案及解析.pdf》提取结构化题库。
输出 bank.js (window.BANK) 与 bank.json，供网页版做题小程序使用。

题目类型：
  - single : 单选题  (题干 + A/B/C/D 选项 + 【答案】+ 可选【解析】)
  - case   : 案例分析 (第25章，按"中级YYYY 试题N"/【说明】切分；说明+问题 为题干，参考答案为答案)
  - calc   : 计算/简答 (题干 + 【答案】/参考答案 + 可选【解析】，无选项，需自测)
"""
import fitz, re, json, os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
PDF  = os.path.join(HERE, "..", "计算题专题、真题答案及解析.pdf")
OUT_JS   = os.path.join(HERE, "bank.js")
OUT_JSON = os.path.join(HERE, "bank.json")

# ---------- 正则 ----------
CHAP_RE      = re.compile(r'第\s*(\d+)\s*章')
OPT_RE       = re.compile(r'^\s*\(?\s*([A-Da-d])[.、．）)]\s*(.*)$')
ANS_RE       = re.compile(r'^\s*【?答案】?\s*[:：]?\s*([A-Da-d])\s*$', re.I)
ANS_TXT_RE   = re.compile(r'^\s*【?答案】?\s*[:：]?\s*(.+)$', re.I)
REF_RE       = re.compile(r'^\s*参考答案\s*[:：]?')
ANA_RE       = re.compile(r'^\s*【?解析】?\s*[:：]?\s*(.*)$')
CASE_START_RE= re.compile(r'^\s*\d{4}\s*年.{0,16}案例分析试题|中级\s*\d{4}|【说明】')
START_RE     = re.compile(r'^\s*\d{1,3}[.、）)]|^\s*（\d+）|^\s*\d+\s*、')
HEADER_RE    = re.compile(r'系统集成项目管理工程师考试计算题专题|过软考教育学院资料|第\d+页QQ：|购课店铺：|91\s*过软考')

def is_start(line):
    return bool(START_RE.search(line))

def is_toc_line(line):
    return bool(re.search(r'\.{4,}', line.strip()))

# ---------- 读取 PDF ----------
doc = fitz.open(PDF)
pages_text = [doc[i].get_text() for i in range(doc.page_count)]
full = "\n".join(pages_text)
lines = full.split("\n")
N = len(lines)
line_off = [0] * (N + 1)
for i, ln in enumerate(lines):
    line_off[i + 1] = line_off[i] + len(ln) + 1

# ---------- 章节边界（仅取正文标题，跳过目录行）----------
first_body = {}
for m in CHAP_RE.finditer(full):
    pos = m.start()
    num = int(m.group(1))
    li = full[:pos].count("\n")
    ltext = lines[li] if 0 <= li < N else ""
    if is_toc_line(ltext):
        continue
    if num in first_body:
        continue
    name = ltext.split("章", 1)[1] if "章" in ltext else m.group(0)
    name = name.strip().rstrip(".").strip()
    first_body[num] = (pos, name)

chap_ranges = []
for num, (pos, name) in sorted(first_body.items(), key=lambda kv: kv[1][0]):
    chap_ranges.append({"num": num, "name": name, "start": pos, "end": None})
for idx, c in enumerate(chap_ranges):
    c["end"] = chap_ranges[idx + 1]["start"] if idx + 1 < len(chap_ranges) else len(full)

def chapter_of(charpos):
    for c in chap_ranges:
        if c["start"] <= charpos < c["end"]:
            return c["num"]
    if chap_ranges and charpos >= chap_ranges[-1]["end"]:
        return chap_ranges[-1]["num"]
    return 0

USED = set()

def parse_analysis(an_lines):
    out = []
    for ln in an_lines:
        m = ANA_RE.match(ln)
        if m and not out:
            if m.group(1).strip():
                out.append(m.group(1).strip())
            continue
        if HEADER_RE.search(ln):
            continue
        out.append(ln.strip())
    return "\n".join(x for x in out if x).strip()

# ---------- 1) 单选题 ----------
choices = []
i = 0
while i < N:
    m = ANS_RE.match(lines[i])
    if m:
        letter = m.group(1).upper()
        j = i - 1
        opts, order = {}, []
        while j >= 0:
            om = OPT_RE.match(lines[j])
            if om and j not in USED:
                L = om.group(1).upper()
                opts[L] = om.group(2).strip()
                order.insert(0, L)
                j -= 1
            else:
                break
        if not order:
            i += 1
            continue
        k = j
        stem = []
        while k >= 0:
            if k in USED:
                break
            ln = lines[k]
            if is_start(ln) and k < j:
                break
            if HEADER_RE.search(ln):
                k -= 1
                continue
            stem.insert(0, ln.strip())
            k -= 1
            if j - k > 40:
                break
        stem_text = "\n".join(x for x in stem if x).strip()
        k = i + 1
        an = []
        while k < N:
            if k in USED:
                break
            ln = lines[k]
            if OPT_RE.match(ln) or ANS_RE.match(ln) or is_start(ln) or CASE_START_RE.search(ln):
                break
            an.append(ln)
            k += 1
            if k - i > 30:
                break
        analysis = parse_analysis(an)
        choices.append({
            "type": "single", "stem": stem_text,
            "options": [{"key": o, "text": opts[o]} for o in order],
            "answer": letter, "analysis": analysis,
            "_pos": line_off[i], "_span": set(range(k, i + 1)),
        })
        for li in range(k, i + 1):
            USED.add(li)
        for li in range(j, i + 1):
            USED.add(li)
        i = k
    else:
        i += 1

# ---------- 2) 第25章 案例分析（仅在正文第25章标记之后抽取）----------
CASE_REGION_START = first_body[25][0] if 25 in first_body else 0
cases = []
cur = None
for li in range(N):
    if li in USED:
        if cur is not None:
            cases.append(cur); cur = None
        continue
    pos = line_off[li]
    if pos < CASE_REGION_START:
        if cur is not None:
            cases.append(cur); cur = None
        continue
    ln = lines[li]
    if CASE_START_RE.search(ln) and not REF_RE.match(ln):
        if cur is not None:
            cases.append(cur)
        cur = [li]
    elif cur is not None:
        cur.append(li)
if cur is not None:
    cases.append(cur)

case_objs = []
if cases:
    for blk in cases:
        stem, ans, in_ans = [], [], False
        for li in blk:
            l = lines[li]
            rm = REF_RE.match(l)
            if rm:
                in_ans = True
                rest = l[rm.end():].strip()
                if rest:
                    ans.append(rest)
                continue
            if in_ans:
                if HEADER_RE.search(l):
                    continue
                ans.append(l.strip())
            else:
                if HEADER_RE.search(l):
                    continue
                stem.append(l.strip())
        stem_t = "\n".join(x for x in stem if x).strip()
        ans_t = "\n".join(x for x in ans if x).strip()
        if stem_t and len(stem_t) > 5:
            case_objs.append({
                "type": "case", "stem": stem_t, "answer": ans_t, "analysis": "",
                "_pos": line_off[blk[0]], "_span": set(blk),
            })
            for li in blk:
                USED.add(li)

# ---------- 3) 计算/简答题 ----------
calcs = []
i = 0
while i < N:
    if i in USED:
        i += 1
        continue
    ln = lines[i]
    is_ans = False
    if REF_RE.match(ln):
        is_ans = True
    else:
        am = ANS_TXT_RE.match(ln)
        if am and not OPT_RE.match(ln):
            if not re.fullmatch(r'[A-Da-d]', am.group(1).strip()):
                is_ans = True
    if is_ans:
        j = i - 1
        stem = []
        while j >= 0:
            if j in USED:
                break
            lj = lines[j]
            if is_start(lj) and j < i:
                break
            if HEADER_RE.search(lj):
                j -= 1
                continue
            if OPT_RE.match(lj):
                break
            stem.insert(0, lj.strip())
            j -= 1
            if i - j > 50:
                break
        stem_text = "\n".join(x for x in stem if x).strip()
        k = i + 1
        buf, first = [], True
        while k < N:
            if k in USED:
                break
            lk = lines[k]
            if OPT_RE.match(lk) or ANS_RE.match(lk) or is_start(lk) or CASE_START_RE.search(lk) or REF_RE.match(lk):
                break
            if HEADER_RE.search(lk):
                k += 1
                continue
            am2 = ANA_RE.match(lk)
            if first and am2:
                tail = am2.group(1).strip()
                if tail:
                    buf.append(tail)
                first = False
                k += 1
                continue
            buf.append(lk.strip())
            first = False
            k += 1
            if k - i > 40:
                break
        answer_text = "\n".join(x for x in buf if x).strip()
        if stem_text and 4 < len(stem_text) <= 1200:
            calcs.append({
                "type": "calc", "stem": stem_text, "answer": answer_text, "analysis": "",
                "_pos": line_off[i], "_span": set(range(j, k + 1)),
            })
            for li in range(j, k + 1):
                USED.add(li)
        i = k
    else:
        i += 1

# ---------- 汇总 ----------
all_q = choices + case_objs + calcs
for q in all_q:
    q["chapter"] = 25 if q["type"] == "case" else chapter_of(q["_pos"])

chap_order = [c["num"] for c in chap_ranges]

def chap_name(num):
    if num == 0:
        return "前言/说明"
    for c in chap_ranges:
        if c["num"] == num:
            return c["name"]
    return f"第{num}章"

bank = {"meta": {"source": os.path.basename(PDF), "total": len(all_q)}, "chapters": []}
for num in chap_order:
    qs = [q for q in all_q if q["chapter"] == num]
    if not qs:
        continue
    qs.sort(key=lambda x: x["_pos"])
    clean = []
    for idx, q in enumerate(qs, 1):
        item = {
            "id": f"{num}-{idx}", "type": q["type"], "stem": q["stem"],
            "options": q.get("options"), "answer": q["answer"], "analysis": q["analysis"],
        }
        clean.append(item)
    bank["chapters"].append({
        "id": f"ch{num}", "num": num, "name": chap_name(num),
        "count": len(clean), "questions": clean,
    })

with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(bank, f, ensure_ascii=False, indent=1)
with open(OUT_JS, "w", encoding="utf-8") as f:
    f.write("window.BANK = " + json.dumps(bank, ensure_ascii=False, indent=1) + ";\n")

# ---------- 统计 ----------
print("总题数:", len(all_q), " | 章节数:", len(bank["chapters"]))
print("类型分布:", dict(Counter(q["type"] for q in all_q)))
for ch in bank["chapters"]:
    print(f"  第{ch['num']}章 {ch['name']}: 共{ch['count']} 题  {dict(Counter(q['type'] for q in ch['questions']))}")
