#!/usr/bin/env python3
"""
扫描 docs/RAG_books/ 下所有 Markdown 文件，提取章节列表，
结合课程书单的年级映射，生成可直接导入微信云数据库的 JSON 文件。
"""

import os
import re
import json

RAG_DIR = os.path.join(os.path.dirname(__file__), '..', 'docs', 'RAG_books')

# ===== 年级映射 =====
# 书名 → (grade_level, recommend_level)
GRADE_MAP = {}

GRADE_BOOKS = {
    "一级A": [
        "盘古开天地", "大闹天宫", "百家姓", "嫦娥奔月", "后羿射日",
        "猴子捞月", "精卫填海", "武松打虎", "东郭先生", "哪吒闹海",
        "宝莲灯", "鲤鱼跳龙门", "狐假虎威", "三个和尚", "司马光砸缸",
        "木兰从军", "曹冲称象", "八仙过海", "女娲补天", "岳母刺字",
        "孔融让梨", "皇帝的新装", "丑小鸭", "海的女儿", "绿野仙踪",
        "拇指姑娘", "渔夫和金鱼", "卖火柴的小女孩", "莴苣姑娘", "美女与野兽",
        "睡美人", "白雪公主", "狼和七只小羊", "灰姑娘", "快乐王子",
        "小红帽", "阿里巴巴和四十大盗", "青蛙王子", "木偶奇遇记", "三只小猪",
        "阿拉丁和神灯", "钱学森", "孔子", "华罗庚", "张衡",
        "屈原", "毕昇", "蔡伦", "郑成功", "王羲之", "岳飞"
    ],
    "一级B": [
        "不可缺的重力", "变幻的四季", "花儿的媒人", "探秘恐龙", "尾巴的作用",
        "出生的秘密", "美丽的变身大师", "声音怎么来的", "神秘的太阳系", "鲨口余生",
        "沙漠的秘密", "风从哪里来", "书的历史", "神奇的石头", "水的故事",
        "奇妙的植物", "走进国宝大熊猫", "太空旅行记", "海底大探险", "昆虫的世界"
    ],
    "二级": [
        "天空下起蜗牛雨", "快乐猴的快乐果", "增广贤文", "三字经",
        "美味的雪花饼", "地上长出了绿房子", "昆虫的游戏", "妈妈和我一起变巫师",
        "穿报纸裙的小姑娘", "小乌龟的苹果树", "森林里的迎新会", "红树叶的咒语",
        "小蝌蚪找妈妈", "九色鹿", "雪孩子", "没头脑和不高兴",
        "带红围巾的稻草人", "飘着花香的湖水", "荒原怎么变村庄", "月亮灯笼真好玩",
        "远行的蒲公英", "这是蟋蟀的小屋", "会唱歌的小雨点", "小花猫的肚子鼓鼓",
        "是谁在树下说悄悄话", "脑门上的脚步声", "小猪唏哩呼噜", "小故事大道理", "名人成才"
    ],
    "三级": [
        "名人成才", "幼学琼林", "三字经", "增广贤文",
        "昆虫记", "格林童话", "有趣的汉字", "二十四孝故事",
        "中国寓言故事", "中外节日故事", "一千零一夜", "100个世界文明奇迹"
    ],
    "四级": [
        "神话故事", "论语", "成语故事", "安徒生童话",
        "爱的教育", "吹牛大王历险记", "木偶奇遇记", "汤姆索亚历险记",
        "鲁滨孙漂流记", "童年", "森林报", "西游记"
    ],
    "五级": [
        "中华上下五千年", "论语", "成语故事",
        "爱丽丝梦游仙境", "钢铁是怎样炼成的", "尼尔斯骑鹅旅行",
        "简爱", "海底两万里", "名人传", "八十天环游地球",
        "绿野仙踪", "假如给我三天光明", "格列佛游记", "水浒传"
    ],
    "六级": [
        "汤姆叔叔的小屋", "小王子", "绿山墙的安妮",
        "寄小读者", "繁星·春水", "城南旧事",
        "杨家将", "山海经", "少年读史记", "史记"
    ],
    "七级": [
        "东周列国", "世界历史", "大学", "中庸", "希腊神话", "三国演义"
    ],
    "八级": [
        "三国志", "中国地理", "增广贤文", "三字经", "宇宙百科全书",
        "老舍·猫", "巴金·鸟的天堂", "朱自清·背影",
        "张天翼·宝葫芦的秘密", "林徽因·你是那人间的四月天",
        "徐志摩·再别康桥", "季羡林·怀念母亲", "许地山·落花生",
        "萧红·呼兰河传", "郁达夫·故都的秋"
    ]
}

# 年级 → recommend_level 映射
GRADE_LEVEL_MAP = {
    "一级A": 1, "一级B": 1,
    "二级": 2, "三级": 3, "四级": 4,
    "五级": 5, "六级": 6, "七级": 7, "八级": 8
}

for grade, books in GRADE_BOOKS.items():
    level = GRADE_LEVEL_MAP[grade]
    for book_name in books:
        # 取最高级别（某些书出现在多个年级）
        if book_name not in GRADE_MAP or GRADE_MAP[book_name][1] < level:
            GRADE_MAP[book_name] = (grade, level)


def extract_chapters(filepath):
    """从 Markdown 文件提取章节列表"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    basename = os.path.basename(filepath)
    chapters = []

    # RAG_ 前缀的大型书籍：只提取真正的章节标题（过滤掉 Section 子标题）
    if basename.startswith('RAG_'):
        h2_matches = re.findall(r'^## (.+)$', content, re.MULTILINE)
        # 过滤：只保留中文章节标题（第X回、第X章、卷X 等），去掉 Section X
        real_chapters = [h.strip() for h in h2_matches
                         if not h.strip().startswith('Section')
                         and not h.strip().startswith('section')]
        if real_chapters:
            return real_chapters
        # 如果没有中文章节标题，返回所有 h2（小型 RAG 文件）
        if h2_matches:
            return [h.strip() for h in h2_matches]

    # 普通文件：尝试匹配 ## 标题
    h2_matches = re.findall(r'^## (.+)$', content, re.MULTILINE)
    if h2_matches:
        chapters = [h.strip() for h in h2_matches]
        return chapters

    # 尝试匹配 # 标题
    h1_matches = re.findall(r'^# (.+)$', content, re.MULTILINE)
    if len(h1_matches) > 1:
        chapters = [h.strip() for h in h1_matches]
        return chapters

    # 如果没有标题格式，整篇算一章
    name = os.path.splitext(basename)[0]
    for prefix in ['RAG_', '_原著完整版', '_全书完整版', '_完整试读版']:
        name = name.replace(prefix, '')
    chapters = [name]
    return chapters


def normalize_book_name(filename):
    """从文件名提取书名"""
    name = os.path.splitext(filename)[0]
    # 去除常见前后缀
    for prefix in ['RAG_']:
        if name.startswith(prefix):
            name = name[len(prefix):]
    for suffix in ['_原著完整版', '_全书完整版', '_完整试读版']:
        name = name.replace(suffix, '')
    return name


def find_grade_info(book_name):
    """查找书名对应的年级信息"""
    # 精确匹配
    if book_name in GRADE_MAP:
        return GRADE_MAP[book_name]
    # 模糊匹配（处理 朱自清·背影 → 背影）
    for key, value in GRADE_MAP.items():
        if book_name in key or key in book_name:
            return value
    # 去掉书名号再试
    clean = book_name.replace('《', '').replace('》', '')
    if clean in GRADE_MAP:
        return GRADE_MAP[clean]
    return None


def main():
    rag_dir = os.path.abspath(RAG_DIR)
    md_files = sorted([f for f in os.listdir(rag_dir) if f.endswith('.md')])

    books_data = []

    for md_file in md_files:
        if md_file.endswith('.py'):
            continue

        filepath = os.path.join(rag_dir, md_file)
        book_name = normalize_book_name(md_file)
        chapters = extract_chapters(filepath)
        grade_info = find_grade_info(book_name)

        grade_label = grade_info[0] if grade_info else "未分级"
        recommend_level = grade_info[1] if grade_info else 0

        books_data.append({
            "title": book_name,
            "author": "",
            "chapters": chapters,
            "total_chapters": len(chapters),
            "grade": grade_label,
            "recommend_level": recommend_level,
            "cover_url": "",
            "status": "active"
        })

    # 排序：西游记排第一（保持 book_001），其次按年级排序
    def sort_key(b):
        if b["title"] == "西游记":
            return (0, 0, "")
        return (1, b["recommend_level"], b["title"])

    books_data.sort(key=sort_key)

    # 去重：同名书籍只保留章节最多的版本
    seen = {}
    for book in books_data:
        title = book["title"]
        if title not in seen or book["total_chapters"] > seen[title]["total_chapters"]:
            seen[title] = book
    books_data = [seen[t] for t in dict.fromkeys(b["title"] for b in books_data)]

    # 分配 ID
    books = []
    for i, book in enumerate(books_data, 1):
        book["_id"] = f"book_{i:03d}"
        books.append(book)
        print(f"  {book['_id']} | {book['title']} | {book['grade']} | {book['total_chapters']} 章")

    # 输出为微信云数据库导入格式（每行一个 JSON）
    output_path = os.path.join(os.path.dirname(__file__), '..', 'database_books_import.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        for book in books:
            f.write(json.dumps(book, ensure_ascii=False) + '\n')

    print(f"\n✅ 共生成 {len(books)} 本书数据")
    print(f"📁 输出文件: {os.path.abspath(output_path)}")
    print(f"\n⚠️  请手动补充 author 和 cover_url 字段")
    print(f"📤 导入方式: 云开发控制台 → 数据库 → books → 导入")


if __name__ == '__main__':
    main()
