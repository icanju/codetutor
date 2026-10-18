# Supabase 연결 순서

계정 가입과 Supabase 프로젝트 생성은 별도 단계입니다. 지금 앱에는 데이터베이스 프로젝트별 URL과 Publishable key가 아직 설정되어 있지 않습니다. 아래 SQL과 권한 정책은 준비되어 있습니다. 프로젝트를 만든 뒤 URL과 Publishable key를 연결하면 인증·문제 조회·기록 화면을 실제 프로젝트에 붙일 수 있습니다.

## 1. 프로젝트 만들기

1. Supabase Dashboard에서 `New project`를 선택합니다.
2. 프로젝트 이름을 `codeon-classroom`처럼 정하고, 무료 요금제와 가까운 리전을 선택합니다.
3. 데이터베이스 비밀번호는 별도로 안전하게 보관합니다. 앱의 학생 로그인 비밀번호와 같은 값을 쓰지 마세요.
4. 프로젝트가 준비되면 `SQL Editor`를 엽니다.

## 2. 테이블과 개인정보 규칙 만들기

1. 이 저장소의 `supabase/schema.sql` 전체를 SQL Editor에 붙여넣고 `Run`을 누릅니다.
2. 완료되면 `Table Editor`에서 `profiles`, `classes`, `enrollments`, `problems`, `problem_examples`, `test_cases`, `submissions`, `submission_tests` 테이블이 보이는지 확인합니다.
3. RLS(Row Level Security)가 켜져 있는지 각 테이블의 RLS 표시를 확인합니다. RLS는 로그인한 학생이 다른 학생의 기록이나 비공개 테스트케이스를 조회하지 못하게 하는 데이터베이스 접근 규칙입니다.

`test_cases`는 교사만 읽을 수 있습니다. 학생은 본인의 제출 코드와 최종 상태·점수만 읽을 수 있습니다. 점수와 테스트 결과를 학생 브라우저가 직접 바꾸지 못하도록 `submissions` 업데이트 권한을 주지 않았습니다.

## 3. 교사 계정 준비하기

1. Supabase의 `Authentication` → `Users`에서 `Add user`를 눌러 교사 이메일 계정을 하나 만듭니다.
2. `SQL Editor`에서 아래 조회를 실행해 계정이 `profiles`에 만들어졌는지 확인합니다.

```sql
select u.id, u.email, p.role
from auth.users u
join public.profiles p on p.id = u.id
where u.email = 'teacher@example.com';
```

3. 처음에는 모든 새 계정이 `student`로 만들어집니다. 교사 계정 한 개를 확인한 다음, 아래 SQL의 이메일만 교사 계정 이메일로 바꾸어 실행합니다.

```sql
update public.profiles
set role = 'teacher'
where id = (
  select id from auth.users where email = 'teacher@example.com'
);
```

이 승격 작업은 프로젝트 소유자가 SQL Editor에서만 해야 합니다. 학생에게 교사 역할을 직접 고칠 권한은 없습니다.

## 4. 수업과 샘플 문제 만들기

교사 계정의 역할이 `teacher`인지 확인한 뒤 `supabase/seed.sql`을 SQL Editor에서 실행합니다. `파이썬 기초반` 수업과 조건문·리스트·딕셔너리 문제, 공개 예시 입출력, 비공개 테스트케이스를 만듭니다.

이 샘플은 학생을 자동 등록하지 않습니다. 학생을 추가할 때는 `enrollments`에 해당 학생만 연결합니다. SQL Editor는 관리자 권한으로 동작하므로, 실제 앱에서 권한 검사는 로그인한 학생 계정으로 따로 확인해야 합니다.

## 5. 앱 키와 안전한 보관

Supabase Dashboard의 `Project Settings` → `API Keys`에서 아래 값을 찾습니다.

- Project URL: `https://<project-ref>.supabase.co` 형태의 프로젝트 주소
- Publishable key: `sb_publishable_...` 형태의 브라우저용 공개 키. 구형 프로젝트는 `anon` 키로 표시될 수 있습니다.
- Secret key: `sb_secret_...` 또는 구형 `service_role` 키. Auth Admin API와 신뢰된 채점 서버에서만 사용합니다.

Project URL과 Publishable key는 브라우저에서 사용하도록 설계된 값입니다. 반대로 Secret/service_role 키는 데이터베이스 RLS를 우회할 수 있으므로 HTML, `app.js`, GitHub 저장소에 넣으면 안 됩니다. Secret key는 Render의 서비스 환경변수에만 보관합니다. 이 키를 채팅에 붙여넣지 마세요.

이후 앱 연결 때 사용할 서버 환경변수 이름은 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`입니다. 현재 로컬 `.env`에는 Gemini 설정만 있고 `.env`는 GitHub 업로드 대상에서 제외됩니다.

## 6. GitHub와 Render 배포

1. 작업 화면 위의 GitHub 버튼으로 프로젝트를 본인 저장소에 연결합니다. `.env`나 Supabase Secret/service_role 키는 저장소에 넣지 않습니다.
2. Render에서 `New` → `Blueprint`를 선택하고 해당 저장소를 연결합니다. 저장소의 `render.yaml`로 웹 서비스 설정을 불러옵니다.
3. Render 서비스의 Environment 화면에 `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`를 등록합니다.
4. 학생 계정 생성과 신뢰된 채점 서버를 활성화할 때만 `SUPABASE_SECRET_KEY`도 비밀 환경변수로 추가합니다.
5. 배포 후 `/api/health`에서 `ok: true`인지 확인합니다.

무료 요금제는 사용량 제한이나 비활성 프로젝트 일시 정지가 있을 수 있습니다. Render 무료 웹 서비스도 한동안 요청이 없으면 잠들 수 있습니다. 수업 전에 한 번 열어 시작 시간을 확인하세요.

## 7. 채점 기록에 필요한 다음 단계

현재 브라우저의 Python 실행은 연습용입니다. 브라우저에서 비공개 테스트케이스를 내려받아 채점하면 학생이 테스트 데이터를 볼 수 있고 점수도 조작할 수 있습니다. 그래서 `schema.sql`은 점수를 학생 클라이언트가 수정하지 못하게 막아 둔 상태입니다.

실제 자동 채점은 별도의 격리 실행기에서 해야 합니다. Python 제출 코드를 Gemini 서버나 일반 Node 서버의 권한으로 직접 실행하면 안 됩니다. 다음 구현 단계에서는 격리 실행 방식(Judge0 등)과 비용·학생 코드 보관 정책을 먼저 정한 뒤, 서버가 `test_cases`를 읽고 테스트별 결과를 계산해 `submissions`와 `submission_tests`에 기록하게 연결해야 합니다.
