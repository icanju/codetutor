# 코드온 AI 튜터

## 로컬 실행

Node.js 20 이상에서 `npm start`를 실행하면 3000번 포트에서 앱이 열립니다. Gemini 키는 `.env` 파일의 `GEMINI_API_KEY` 환경변수로 읽으며, `.gitignore`에서 제외되어 있습니다.

## Render 배포

1. 작업 화면 위쪽의 GitHub 버튼으로 프로젝트를 본인 저장소에 연결합니다. `.env`는 저장소에 올리지 않습니다.
2. Render에서 `New` → `Blueprint`를 선택하고 연결한 저장소를 가져옵니다. 저장소의 `render.yaml` 설정을 사용합니다.
3. Render 서비스 설정에서 `GEMINI_API_KEY`를 비밀 환경변수로 등록한 뒤 배포합니다.
4. `/api/health` 응답에서 `aiConfigured`가 `true`인지 확인합니다.

Render 무료 서비스는 사용이 없으면 잠들 수 있어 다시 접속할 때 시작 지연이 생길 수 있습니다. AI 무료 사용량과 모델 사용 가능 여부는 Google AI Studio의 정책을 따릅니다.

Supabase 준비 파일은 `supabase/schema.sql`, `supabase/seed.sql`에 있습니다. 자세한 프로젝트 생성·권한 설정은 `SUPABASE_SETUP.md`, 교사 예시와 AI 튜터 점검표는 `TEACHER_GUIDE.md`를 확인하세요. 현재는 SQL 스키마만 준비되어 있고 실제 로그인·데이터 저장 연결은 프로젝트별 URL/키를 받아야 완료할 수 있습니다.

노트북 기반 튜터 문맥은 `curriculum.md`에 요약되어 있으며, Colab 사용자 메타데이터와 실행 출력은 포함하지 않습니다.
