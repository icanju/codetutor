# 코드온 AI 튜터

## 로컬 실행

Node.js 20 이상에서 `npm start`를 실행하면 3000번 포트에서 앱이 열립니다. Gemini 키는 `.env` 파일의 `GEMINI_API_KEY` 환경변수로 읽으며, `.gitignore`에서 제외되어 있습니다.

## Render 배포

1. 작업 화면 위쪽의 GitHub 버튼으로 프로젝트를 본인 저장소에 연결합니다. `.env`는 저장소에 올리지 않습니다.
2. Render에서 `New` → `Blueprint`를 선택하고 연결한 저장소를 가져옵니다. 저장소의 `render.yaml` 설정을 사용합니다.
3. Render 서비스 설정에서 `GEMINI_API_KEY`를 비밀 환경변수로 등록한 뒤 배포합니다.
4. `/api/health` 응답에서 `aiConfigured`가 `true`인지 확인합니다.

Render 무료 서비스는 사용이 없으면 잠들 수 있어 다시 접속할 때 시작 지연이 생길 수 있습니다. AI 무료 사용량과 모델 사용 가능 여부는 Google AI Studio의 정책을 따릅니다.

현재 버전은 데이터베이스를 사용하지 않습니다. 로그인, 학생 계정, 문제 저장, 채점 기록을 추가할 때 Supabase를 연결하는 것을 권장합니다.
