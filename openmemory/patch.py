"""
최신 OpenMemory 소스에 localmind 패치를 적용한다.

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

# (1d) 의미 기반 검색 라우트 추가 (localmind MCP recall용):
#      REST /filter는 키워드(ilike)라, mem0.search로 임베딩 의미검색을 노출한다.
s += '''

# ── localmind: 의미 기반 검색(mem0.search) 엔드포인트 ──
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
    # localmind: 구조화 출력이 필요한 카테고리화는 CLI 경로에서 항상 실패하고
    # tenacity 재시도가 워커를 막으므로 비활성화(빈 카테고리 반환).
    return []
    try:""",
)
open(catp, "w").write(ct)

# (1e) 한국어 사실 추출 프롬프트 주입:
#      mem0 기본 추출 프롬프트가 영어라 한국어 입력이 "User의 ~" 식 영어투로
#      정규화된다. JSON 계약({"facts": [...]})은 유지하되 자연스러운 한국어로
#      추출하도록 custom_fact_extraction_prompt를 Memory.from_config 직전에 넣는다.
KO_FACT_PROMPT = (
    "당신은 대화에서 기억할 만한 사실·선호·정보를 뽑아 정리하는 개인 정보 정리자입니다.\n\n"
    "추출 대상: 개인 선호(좋아함/싫어함), 이름·관계·중요한 날짜, 계획·목표·할 일, "
    "활동·서비스 선호, 건강·식습관·루틴, 직업·업무 정보(직책·도구·목표), 기타(책·영화·브랜드 등).\n\n"
    "규칙:\n"
    "- 추출한 사실은 반드시 **자연스러운 한국어**로 쓴다. 노트처럼 간결한 평서문(~다)로 쓴다.\n"
    "- **주어를 쓰지 않는다.** '나는', 'User는', 'User가', '사용자는' 같은 주어를 절대 쓰지 말고 "
    "생략한다. (예: '나는 매일 6시에 일어난다' → '매일 아침 6시에 기상한다')\n"
    "- 영어 번역투('User의 ~')를 쓰지 않는다.\n"
    "- 기억할 사실이 없으면 빈 배열을 반환한다.\n"
    "- 인사말·잡담 등 의미 없는 내용은 무시한다.\n"
    "- 다른 텍스트·코드펜스 없이 오직 아래 JSON 형식으로만 응답한다.\n\n"
    '형식: {"facts": ["사실1", "사실2"]}\n\n'
    "예시:\n"
    '입력: "안녕!"\n출력: {"facts": []}\n'
    '입력: "내 강아지 초코는 오이를 간식으로 좋아해"\n'
    '출력: {"facts": ["강아지 이름은 초코이다", "초코는 오이를 간식으로 좋아한다"]}\n'
    '입력: "나는 주로 타입스크립트랑 파이썬으로 개발해"\n'
    '출력: {"facts": ["주로 사용하는 프로그래밍 언어는 타입스크립트와 파이썬이다"]}\n'
    '입력: "나는 매일 아침 6시에 일어나서 달리기를 해"\n'
    '출력: {"facts": ["매일 아침 6시에 기상한다", "아침마다 달리기를 한다"]}\n'
)
mp2 = "/usr/src/openmemory/app/utils/memory.py"
m2 = open(mp2).read()
anchor = "        config = _parse_environment_variables(config)"
assert anchor in m2, "get_memory_client config 조립 지점 변경됨"
m2 = m2.replace(
    anchor,
    anchor + "\n        config[\"custom_fact_extraction_prompt\"] = " + repr(KO_FACT_PROMPT),
    1,
)
open(mp2, "w").write(m2)

# (1f) mem0 라이브러리 추출 프롬프트 패치(언어/주어):
#      이 mem0 버전은 ADDITIVE_EXTRACTION_PROMPT를 쓰며 'use "User" for user-stated
#      facts'라고 명시해 모든 사실에 "User"가 붙고, same-language 지시도 없다.
#      → 같은 언어(한국어면 한국어) + 주어 생략으로 바꾼다.
mpp = "/usr/local/lib/python3.12/site-packages/mem0/configs/prompts.py"
try:
    mp_txt = open(mpp).read()
    attr_old = """Attribute correctly: use "User" for user-stated facts. For assistant-generated content, frame in terms of the user's context (e.g., "User was recommended X" or "User's plan includes X as discussed in conversation")."""
    attr_new = """Language and style (IMPORTANT): Write EVERY memory in the SAME LANGUAGE as the user input (Korean if the input is Korean). Do NOT use "User", "사용자", "나", or any subject pronoun — write each memory as a concise, natural, subject-less statement in the input's language (e.g., "매일 아침 6시에 기상한다", "주력 언어는 타입스크립트와 파이썬이다"). For assistant-generated content, also omit the subject and keep the input language."""
    if attr_old in mp_txt:
        mp_txt = mp_txt.replace(attr_old, attr_new, 1)
        open(mpp, "w").write(mp_txt)
        print("[patch] mem0 ADDITIVE_EXTRACTION_PROMPT 언어/주어 패치 적용")
    else:
        print("[patch] (skip) ADDITIVE_EXTRACTION_PROMPT 문구 변경됨 — 수동 확인 필요")
except FileNotFoundError:
    print("[patch] (skip) mem0 prompts.py 없음")

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
