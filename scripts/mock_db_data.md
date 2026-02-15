### 1. `config` 集合数据 (用于等级定义)
建议在 `config` 集合中添加一条记录，用于定义等级名称。

**记录内容 (JSON 格式):**
```json
{
  "key": "level_config",
  "levels": [
    { "level": 1, "name": "阅读萌新", "minPoints": 0 },
    { "level": 2, "name": "阅读达人", "minPoints": 200 },
    { "level": 3, "name": "阅读大师", "minPoints": 500 },
    { "level": 4, "name": "智慧博士", "minPoints": 1000 }
  ],
  "updated_at": { "$date": "2026-02-15T00:00:00.000Z" }
}
```

---

### 2. `books` 集合数据 (用于书架测试)
以下是为您准备的 4 本入门书籍数据，涵盖不同推荐等级。

#### **书籍 A：西游记 (ID: book_001)**
```json
{
  "_id": "book_001",
  "title": "西游记",
  "author": "吴承恩",
  "cover_url": "https://picsum.photos/id/24/200/300",
  "total_chapters": 100,
  "recommend_level": 1,
  "chapters": [
    "第一回：灵根育孕源流出 心性修持大道生",
    "第二回：悟彻菩提真妙理 断魔归本合元神",
    "第七回：八卦炉中逃大圣 五行山下定心猿"
  ]
}
```

#### **书籍 B：三字经 (ID: book_002)**
```json
{
  "_id": "book_002",
  "title": "三字经",
  "author": "王应麟",
  "cover_url": "https://picsum.photos/id/10/200/300",
  "total_chapters": 10,
  "recommend_level": 1,
  "chapters": [
    "第一节：人之初 性本善",
    "第二节：昔孟母 择邻处"
  ]
}
```

#### **书籍 C：论语 (ID: book_003)**
```json
{
  "_id": "book_003",
  "title": "论语",
  "author": "孔子弟子",
  "cover_url": "https://picsum.photos/id/11/200/300",
  "total_chapters": 20,
  "recommend_level": 2,
  "chapters": [
    "学而篇：学而时习之",
    "为政篇：为政以德"
  ]
}
```

#### **书籍 D：时间简史 (ID: book_004)**
```json
{
  "_id": "book_004",
  "title": "时间简史",
  "author": "斯蒂芬·霍金",
  "cover_url": "https://picsum.photos/id/12/200/300",
  "total_chapters": 12,
  "recommend_level": 3,
  "chapters": [
    "第一章：我们的宇宙图像",
    "第二章：空间和时间"
  ]
}
```
