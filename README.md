# Chunk Translator

## 프로젝트 목적
대용량 원문을 **청크로 나눠 요약 컨텍스트를 유지하면서 번역**하는 정적 웹 툴입니다. 요약 → 청킹 → 병렬 번역 흐름으로 긴 문서의 품질과 처리 속도를 균형 있게 맞추는 것을 목표로 합니다.

## Features
- **OpenAI 호환 Chat Completions API** 호출로 요약/번역 수행
- **5줄 요약 생성** 후 번역 컨텍스트로 활용
- **청킹 자동 생성**: 문단 → 문장 단위 분해, 800자 제한 기준
- **수동 청킹 조작**: 위/아래 병합, 커서 위치 분할
- **청크별 추가 지시** 지원
- **동시 요청 2개 제한**(큐 기반 처리)
- **사용량(토큰) 집계**: 요약/번역 별 prompt·completion·total 표시
- **전체 번역 복사** 및 Toast 알림
- **설정 자동 저장**(localStorage)

## 현재 구조
```
./
├── index.html   # UI 구조
├── styles.css   # 스타일
├── app.js       # 상태/로직/네트워크
└── README.md
```

## Code Map (Mental Model)
- **UI 섹션 (index.html)**
  - [0] 설정: Base URL, API Key, 요약/번역 모델, 타깃 언어
  - [1] 원문 입력
  - [2] 요약 생성/편집
  - [3] 청킹/번역 진행 및 결과 확인

- **스타일 (styles.css)**
  - 패널/버튼/레이아웃/토스트 등 전체 UI 스타일 정의

- **핵심 로직 (app.js)**
  - `state`: 요약/청크/사용량/큐 상태
  - **청킹 파이프라인**
    - `chunkText(raw)`
      - 문단 분리 → 800자 이하 유지
      - 800자 초과 시 문장 분리(`Intl.Segmenter` 또는 정규식)
      - 문장도 800자 초과 시 길이 분할
  - **요약/번역 API 호출**
    - `callChatCompletion(...)` → `/chat/completions`
    - `generateSummary()` → 5줄 요약 생성
    - `translateChunk(id)` → 청크 단위 번역 수행
  - **큐/동시성 제어**
    - `MAX_CONCURRENT = 2`
    - `enqueueChunk()` → `processQueue()` → `translateChunk()`
    - `stopAllTranslations()`으로 전체 취소

## 개발 온보딩 방법
1. 이 저장소는 **빌드 없는 정적 웹 앱**입니다.
2. 브라우저에서 `index.html`을 직접 열거나, 간단한 로컬 서버로 실행합니다.
3. 실행 후 다음 순서로 사용합니다.
   - Base URL / API Key / 모델 설정
   - 원문 입력 → **청킹 생성**
   - **5줄 요약 생성** (편집 가능)
   - **전체 번역 시작** 또는 청크별 번역
   - 필요 시 청크 병합/분할 및 추가지시 조정

## 유지보수 명령어
- 가장 간단한 핫 리로드:
  ```bash
  npx live-server
  ```
  파일 변경 시 자동 새로고침 됩니다.

- 로컬 실행(맥 기준):
  ```bash
  open index.html
  ```

- 간단한 로컬 서버 실행:
  ```bash
  python3 -m http.server 8000
  ```
  이후 브라우저에서 `http://localhost:8000` 접근

> 별도 빌드/테스트/패키지 매니저가 없습니다. 기능 수정 시 `index.html`, `styles.css`, `app.js`를 유지보수합니다.
