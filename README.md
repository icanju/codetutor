# 코드온 | 코드 작성 및 AI 튜터 활용 시스템

## 로컬 실행

Node.js 20 이상에서 `npm start`를 실행하면 3000번 포트에서 앱이 열립니다. Gemini와 Supabase의 비밀 키는 `.env`에서 읽으며 GitHub 업로드 대상에서 제외되어 있습니다.

## Render 배포

1. 작업 화면 위쪽의 GitHub 버튼으로 프로젝트를 본인 저장소에 연결합니다. `.env`는 저장소에 올리지 않습니다.
2. Render에서 `New` → `Blueprint`를 선택하고 연결한 저장소를 가져옵니다. 저장소의 `render.yaml` 설정을 사용합니다.
3. Render Blueprint에서 Gemini와 Supabase 환경변수를 비밀 값으로 등록한 뒤 배포합니다.
4. `/api/health`에서 `aiConfigured`, `supabaseConfigured`가 `true`인지 확인합니다.

Render 무료 서비스는 사용이 없으면 잠들 수 있어 다시 접속할 때 시작 지연이 생길 수 있습니다. AI 무료 사용량과 모델 사용 가능 여부는 Google AI Studio의 정책을 따릅니다.

Supabase 스키마와 샘플은 `supabase/schema.sql`, `supabase/seed.sql`에 있습니다. Table Editor 사용법은 `SUPABASE_SETUP.md`, 교사용 AI 점검표는 `TEACHER_GUIDE.md`를 확인하세요. Supabase에서 스키마와 교사 계정을 설정한 뒤 실제 로그인·학생 계정·튜터 기록을 사용할 수 있습니다.

Judge0는 아직 연결하지 않았습니다. 이 동안 브라우저 Python 실행과 AI 튜터는 쓸 수 있지만 비공개 테스트케이스 채점은 비활성화됩니다.

노트북 기반 튜터 문맥은 `curriculum.md`에 요약되어 있으며, Colab 사용자 메타데이터와 실행 출력은 포함하지 않습니다.
