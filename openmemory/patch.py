"""
최신 OpenMemory 소스에 cli2port 패치를 적용한다.

(1) 목록/검색 읽기 버그:
    list_memories / filter_memories가 categories를 메인 쿼리에 조인하면서
    `joinedload`로 eager load → 메모리당 행이 카테고리 수만큼 중복되고,
    이를 `.distinct(Memory.id)`(Postgres의 DISTINCT ON)로 제거하려다
    `ORDER BY created_at`과 충돌해 에러가 난다(전체 DISTINCT로 바꿔도
    json 컬럼에 동등 연산자가 없어 또 실패).
    → categories를 `selectinload`로 별도 쿼리 로드(메인 SELECT/조인에서 제외),
      카테고리 필터는 서브쿼리(IN)로 바꿔 행 중복 자체를 없앤다.
      그러면 distinct가 불필요해지고 정렬도 그대로 유지된다.

(2) Postgres 앱 DB 지원:
    database.py가 SQLite 전용 인자 `check_same_thread`를 무조건 적용해
    Postgres 연결이 깨진다 → SQLite일 때만 적용하도록 조건화.
"""

mp = "/usr/src/openmemory/app/routers/memories.py"
s = open(mp).read()


def patch(old, new, label):
    assert old in s, f"패치 대상 변경됨: {label}"
    return s.replace(old, new)


# import에 selectinload 추가
s = patch(
    "from sqlalchemy.orm import Session, joinedload",
    "from sqlalchemy.orm import Session, joinedload, selectinload",
    "import",
)

# list_memories: categories 조인 제거 + 카테고리 필터를 서브쿼리로
s = patch(
    """    # Add joins for app and categories after filtering
    query = query.outerjoin(App, Memory.app_id == App.id)
    query = query.outerjoin(Memory.categories)

    # Apply category filter if provided
    if categories:
        category_list = [c.strip() for c in categories.split(",")]
        query = query.filter(Category.name.in_(category_list))""",
    """    # Add app join; categories는 selectinload로 별도 로드(메인 쿼리 조인 제거)
    query = query.outerjoin(App, Memory.app_id == App.id)

    # Apply category filter if provided (서브쿼리 → 행 중복 방지)
    if categories:
        category_list = [c.strip() for c in categories.split(",")]
        query = query.filter(Memory.id.in_(
            db.query(Memory.id).join(Memory.categories).filter(Category.name.in_(category_list))
        ))""",
    "list category join",
)

# list_memories: eager loading을 selectinload로, distinct 제거
s = patch(
    """    # Add eager loading for app and categories
    query = query.options(
        joinedload(Memory.app),
        joinedload(Memory.categories)
    ).distinct(Memory.id)""",
    """    # Add eager loading (categories는 selectinload → 메인 쿼리 행 중복 없음)
    query = query.options(
        joinedload(Memory.app),
        selectinload(Memory.categories)
    )""",
    "list eager",
)

# filter_memories: categories 조인 제거 + 카테고리 필터를 서브쿼리로
s = patch(
    """    # Add joins for app and categories
    query = query.outerjoin(App, Memory.app_id == App.id)

    # Apply category filter
    if request.category_ids:
        query = query.join(Memory.categories).filter(Category.id.in_(request.category_ids))
    else:
        query = query.outerjoin(Memory.categories)""",
    """    # Add app join; categories는 selectinload로 별도 로드(메인 쿼리 조인 제거)
    query = query.outerjoin(App, Memory.app_id == App.id)

    # Apply category filter (서브쿼리 → 행 중복 방지)
    if request.category_ids:
        query = query.filter(Memory.id.in_(
            db.query(Memory.id).join(Memory.categories).filter(Category.id.in_(request.category_ids))
        ))""",
    "filter category join",
)

# filter_memories: eager loading을 selectinload로, distinct 제거
s = patch(
    """    # Add eager loading for categories and make the query distinct
    query = query.options(
        joinedload(Memory.categories)
    ).distinct(Memory.id)""",
    """    # Add eager loading (categories는 selectinload → 메인 쿼리 행 중복 없음)
    query = query.options(
        selectinload(Memory.categories)
    )""",
    "filter eager",
)

open(mp, "w").write(s)

# (1b) config.py PUT 핸들러 버그: update_configuration이 save/return을 빠뜨려
#      None을 반환 → 500(ResponseValidationError). 이 때문에 모델 설정이 불가.
cp = "/usr/src/openmemory/app/routers/config.py"
c = open(cp).read()
cfg_old = '    updated_config["mem0"] = config.mem0.dict(exclude_none=True)'
assert cfg_old in c, "update_configuration 본문 변경됨"
c = c.replace(
    cfg_old,
    cfg_old + "\n\n    save_config_to_db(db, updated_config)\n    return updated_config",
    1,
)
open(cp, "w").write(c)

# (1c) categorization.py가 gpt-4o-mini를 하드코딩 → 게이트웨이가 codex로
#      라우팅해 502. CHAT_MODEL(claude)로 바꿔 올바른 백엔드로 보낸다.
#      (구조화 출력 한계로 카테고리가 항상 채워지진 않지만 비치명적)
catp = "/usr/src/openmemory/app/utils/categorization.py"
ct = open(catp).read()
if 'model="gpt-4o-mini"' in ct:
    ct = ct.replace('model="gpt-4o-mini"', 'model=os.environ.get("CHAT_MODEL", "gpt-4o-mini")')
    if "\nimport os" not in ct and not ct.startswith("import os"):
        ct = "import os\n" + ct
    open(catp, "w").write(ct)

# (2) Postgres 앱 DB 지원
dp = "/usr/src/openmemory/app/database.py"
d = open(dp).read()
assert 'connect_args={"check_same_thread": False}' in d, "connect_args 패턴 변경됨"
d = d.replace(
    'connect_args={"check_same_thread": False}',
    'connect_args=({"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})',
)
open(dp, "w").write(d)

print("[patch] memories.py + database.py 패치 완료")
