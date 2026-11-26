# Px. · 기록의 수조

정보보안공학과 블로그입니다. 공개 티스토리 RSS에서 글 본문과 사진을 가져와 블로그 안에 읽기 페이지를 만듭니다. 글 한 편당 주제에 맞는 물고기 한 마리가 생성됩니다.

## 로컬에서 보기

저장소 루트에서 사이트를 빌드하고 서버를 실행하세요. Pages 배포는 티스토리 CDN 사진을 사이트 파일에 함께 담습니다. 로컬에서 사진을 복사하지 않고 미리 보려면 빌드에 `--skip-media`를 붙일 수 있습니다.

```sh
python3 -m pip install -r scripts/requirements.txt
python3 scripts/build_site.py
python3 -m http.server 8000 --directory _site
```

브라우저에서 `http://localhost:8000`을 여세요. 방문할 때 먹이가 떨어지고 **먹이 주기** 버튼으로 추가할 수 있습니다. 먹이를 물고기 입까지 끌면 물고기가 먹습니다. 키보드로는 수조에 포커스를 두고 **F**를 눌러 한 알을 줄 수 있습니다. 게시된 글이 없으면 수조의 물고기는 0마리입니다.

## GitHub Pages와 티스토리 연결

1. 이 저장소의 `main` 브랜치에 파일을 올립니다.
2. GitHub 저장소의 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다.
3. 티스토리에서 공개 RSS를 사용할 수 있는지 확인합니다. GitHub의 **Actions → Blog and Tistory RSS → Run workflow**를 실행하면 첫 가져오기와 배포를 함께 시도합니다.
4. 이후 GitHub Actions가 약 30분 간격으로 공개 RSS를 확인합니다. GitHub의 예약 실행은 지연될 수 있습니다. 페이지 주소는 배포 후 **Settings → Pages**에서 확인할 수 있습니다.

가져온 글은 `data/tistory.json`에 보관합니다. 글이 RSS의 최근 목록에서 빠지면 티스토리 원문 주소를 확인합니다. 원문 주소가 404 또는 410을 반환하면 다음 배포에서 글 목록, 글 페이지, 물고기를 함께 제거합니다. 원문이 열리거나 일시적으로 상태를 확인할 수 없으면 보관합니다. RSS에 없는 과거 글은 직접 추가할 수 있습니다. 주제는 RSS 카테고리 이름을 우선으로 분류합니다. 카테고리로 분류할 수 없는 경우 제목에 ‘논문 리뷰’처럼 명시된 글은 **논문/컨퍼런스**에, 나머지는 **블로그/기술문서**에 표시합니다.

## 글과 경험 업데이트

GitHub에서 직접 글을 쓰려면 `data/posts.json`에 항목을 추가하세요. 게시된 항목을 지우면 다음 배포에서 해당 글과 물고기도 사라집니다. 글마다 고유한 `id`를 사용하세요. `body`는 일반 텍스트입니다.

```json
[
  {
    "id": "first-post",
    "title": "첫 번째 개발 기록",
    "category": "dev",
    "date": "2026-11-24",
    "body": "글 내용을 여기에 적습니다."
  }
]
```

| category | 주제 |
| --- | --- |
| `dev` | 개발 |
| `ctf` | CTF/Wargame |
| `bounty` | Bug Bounty |
| `docs` | 블로그/기술문서 |
| `research` | 논문/컨퍼런스 |
| `awards` | 공모전/자격증 |

연도별 경험은 `index.html`의 `experience` 섹션에서 수정할 수 있습니다.

## 물고기 크기

공개 티스토리 RSS에는 글별 조회수가 포함되어 있지 않습니다. 관리자 통계에서 확인한 값을 `data/tistory-views.json`에 원문 URL과 음이 아닌 정수로 저장하면 다음 배포부터 반영됩니다. 예를 들어 `{"https://pxjeong.tistory.com/8": 120}`처럼 입력합니다. 조회수가 기록되지 않은 글은 기본 크기이며, 조회수에 따라 최대 25%까지 커집니다.
