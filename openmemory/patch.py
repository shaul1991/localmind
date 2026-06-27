"""
최신 OpenMemory 소스에 cli-gateway 패치를 적용한다.

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

# (1d) 의미 기반 검색 라우트 추가 (cli-gateway MCP recall용):
#      REST /filter는 키워드(ilike)라, mem0.search로 임베딩 의미검색을 노출한다.
s += '''

# ── cli-gateway: 의미 기반 검색(mem0.search) 엔드포인트 ──
from pydantic import BaseModel as _CGBase


class _CGSemanticReq(_CGBase):
    user_id: str
    query: str
    limit: int = 5


@router.post("/semantic")
def cg_semantic_search(req: _CGSemanticReq, db: Session = Depends(get_db)):
    from app.utils.memory import get_memory_client
    client = get_memory_client()
    if client is None:
        return {"results": []}
    res = client.search(req.query, filters={"user_id": req.user_id}, limit=req.limit)
    items = res.get("results", res) if isinstance(res, dict) else res
    out = []
    for i in items or []:
        if isinstance(i, dict):
            out.append({"memory": i.get("memory", i.get("data", "")), "score": i.get("score", 0)})
    return {"results": out}
'''

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

# (1c) 자동 카테고리화 비활성화:
#      categorization은 OpenAI 구조화 출력(response_format=pydantic, json_schema)을
#      요구하는데 CLI 경로(claude)에선 강제되지 않아 항상 실패하고,
#      @retry(3회 + 4~15s 백오프)가 단일 워커를 30~60초 막아 add를 느리게 하고
#      직후 요청(목록 등)을 타임아웃시킨다. 빈 카테고리를 즉시 반환해 비활성화.
catp = "/usr/src/openmemory/app/utils/categorization.py"
ct = open(catp).read()
cat_old = """@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=15))
def get_categories_for_memory(memory: str) -> List[str]:
    try:"""
assert cat_old in ct, "categorization 함수 형태 변경됨"
ct = ct.replace(
    cat_old,
    """def get_categories_for_memory(memory: str) -> List[str]:
    # cli-gateway: 구조화 출력이 필요한 카테고리화는 CLI 경로에서 항상 실패하고
    # tenacity 재시도가 워커를 막으므로 비활성화(빈 카테고리 반환).
    return []
    try:""",
)
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
