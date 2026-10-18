# Supabase 설정과 Table Editor 사용 안내

프로젝트 주소 `https://hlbzdmzqqdukdvfywxjr.supabase.co`와 Publishable key·서버 Secret key는 앱 설정에 연결했습니다. Secret key는 Node 서버만 사용하며 브라우저나 GitHub 코드로 보내지 않습니다.

중요: 복잡한 외래키와 RLS 정책이 많아 테이블을 Table Editor에서 한 개씩 처음부터 만들면 실수하기 쉽습니다. 먼저 SQL Editor에서 스키마를 한 번 실행하고, 그 다음 Table Editor에서 데이터 확인·수정·추가를 하세요.

## 1. 기본 테이블 만들기

1. Supabase Dashboard에서 왼쪽 `SQL Editor`를 엽니다.
2. `New query`를 누릅니다.
3. GitHub에 연결된 저장소에서 `supabase/schema.sql` 파일을 엽니다. 전체 SQL을 복사해 SQL Editor에 붙여넣고 `Run`을 누릅니다.
4. 성공 메시지를 확인합니다. 여러 번 다시 실행하지 마세요. 이미 테이블이 만들어졌다면 처음부터 `schema.sql`을 다시 실행하지 말고 아래의 업그레이드 순서를 따릅니다.

이 작업은 Table Editor에서 Create table을 반복하는 대신 테이블, 연결 관계, 로그인 자동 프로필 생성, 권한 규칙을 한 번에 구성합니다.

## 2. Table Editor에서 확인하기

왼쪽 `Table Editor`를 열면 아래 테이블이 만들어져 있어야 합니다.

| 테이블 | 용도 | 누가 행을 만드는가 |
|---|---|---|
| `profiles` | Auth 계정의 학생·교사·관리자 역할과 이름 | 계정 생성 트리거가 자동 생성 |
| `classes` | 교사가 운영하는 수업 | 교사 화면의 수업 만들기 |
| `enrollments` | 어떤 학생이 어떤 수업에 속하는지 | 교사 화면의 학생 계정 발급 |
| `problems` | 문제 설명, 허용 문법, 배점, 공개 여부 | 교사 화면의 문제 등록 |
| `problem_examples` | 학생에게 공개할 예시 입출력 | 교사 화면의 문제 등록 |
| `test_cases` | 비공개 채점 입력과 정답 | 교사 화면 또는 `seed.sql` |
| `submissions` | 제출 코드, 최종 상태와 점수 | 신뢰된 채점 서버 |
| `submission_tests` | 테스트별 통과 여부와 내부 결과 | 신뢰된 채점 서버 |
| `tutor_events` | 학생이 튜터 1·2·3단계 중 어디까지 썼는지 | 학생이 단계를 열 때 서버가 기록 |

테이블 이름을 눌러 행을 확인할 수 있습니다. 행을 직접 추가할 때는 `Insert` → `Insert row`를 누릅니다. `id`, `created_at`처럼 기본값이 있는 칸은 비워두고 저장하세요. 관계 칸은 관련 행을 선택하는 드롭다운이 표시될 수 있습니다.

기본 운영에서는 Table Editor에 학생을 직접 만들지 않습니다. Auth에서 계정을 만들면 `profiles`가 자동으로 생성되고, 학생 연결은 교사 화면에서 처리합니다. `submissions`, `submission_tests`, `tutor_events`도 서버·앱이 기록하므로 점수나 도움 단계를 직접 고칠 필요가 없습니다.

## 3. RLS와 비공개 테스트 보호

Table Editor의 각 테이블에서 RLS 표시가 켜져 있는지 확인합니다. `test_cases`는 교사와 관리자만 읽고, 학생은 공개 `problem_examples`만 봅니다. 학생은 자기 제출의 점수와 상태만 읽을 수 있으며 점수를 수정할 권한은 없습니다. 교사는 자신이 맡은 수업의 학생과 기록만 조회합니다. 관리자는 전체 수업을 볼 수 있습니다.

SQL Editor는 관리자 권한으로 쿼리를 실행하기 때문에 SQL Editor에서 행이 보이는지만으로 RLS가 정상인지 판단하지 마세요. 앱에 학생으로 로그인해 다른 학생 기록과 비공개 테스트 데이터가 보이지 않는지 확인해야 합니다.

## 4. 교사와 관리자 계정 준비

1. `Authentication` → `Users` → `Add user`에서 이메일과 비밀번호를 입력해 Auth 계정을 만듭니다. 비밀번호는 이 화면에서 정하며, 아래 SQL은 비밀번호를 설정하거나 바꾸지 않습니다. 이미 계정을 만들었다면 그때 정한 비밀번호를 사용합니다.
2. 새 Auth 계정은 앱의 `profiles.role`이 기본적으로 `student`입니다. `SQL Editor`에서 다음 조회를 실행해 계정과 현재 역할을 확인합니다. 이메일 부분은 실제 관리자 이메일로 바꿉니다.

```sql
select u.id, u.email, p.role
from auth.users u
join public.profiles p on p.id = u.id
where u.email = 'teacher@example.com';
```

3. 기존 계정을 관리자 화면으로 쓰려면 역할을 `admin`으로 지정합니다. 이메일은 실제 관리자 이메일로 바꾸세요.

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'admin@example.com');
```

별도의 교사 계정도 만들려면 해당 교사의 Auth 이메일로 같은 문장을 실행하되 `admin` 대신 `teacher`를 지정합니다. 역할 변경은 프로젝트 소유자가 SQL Editor에서만 해야 하며, 브라우저 사용자는 자기 역할을 바꿀 수 없습니다.

## 5. Table Editor에서 샘플 자료 넣기

관리자 또는 교사 계정으로 로그인한 다음 `supabase/seed.sql`을 SQL Editor에서 실행합니다. 수업과 조건문·리스트·딕셔너리·최댓값·배수 개수·회문 문제, 공개 예시, 비공개 테스트케이스가 만들어집니다. 이전 seed 파일을 이미 실행했더라도 업데이트된 파일을 다시 실행하면 새 알고리즘 문제가 추가되고 기존 행은 중복되지 않습니다. 학생은 자동 등록되지 않으므로 교사 화면에서 계정을 발급해 수업에 연결하세요.

직접 Table Editor에서 문제를 추가하려면 이 순서를 지킵니다.

1. `classes`에서 교사 계정의 수업을 만듭니다. 앱의 교사 화면에서 수업을 만들면 이 단계가 자동으로 됩니다.
2. 교사 화면의 `문제·테스트` 메뉴에서 제목, 설명, 배점, 허용 개념을 입력합니다.
3. 공개 예시 입출력은 `problem_examples`, 채점용 숨은 입출력은 `test_cases`에 저장합니다. 두 데이터를 섞지 마세요.
4. 학생 계정 발급은 교사 화면의 `학생 계정` 메뉴를 사용합니다. 해당 수업에 `enrollments` 연결도 함께 생성됩니다.

직접 행을 넣을 때 `problem_id`, `class_id`, `student_id`에는 Table Editor의 관계 선택기를 사용합니다. 테스트 입력과 정답은 `test_cases.stdin`, `test_cases.expected_stdout`에 저장되고, 이 테이블은 학생에게 보이지 않습니다.

## 6. 업그레이드와 이미 만든 테이블

이전에 받은 기본 `schema.sql`을 이미 실행한 경우 전체 스키마를 다시 실행하지 마세요. `supabase/migrations/20261018_admin_access.sql`을 먼저 실행하고, 이어서 `supabase/migrations/20261018_tutor_events.sql`, `supabase/migrations/20261018_enrollments_fix.sql`, `supabase/migrations/20261018_free_tutor.sql`을 실행합니다. 마지막 migration은 문제 ID 없이도 자유 코드 튜터 사용 기록을 수업과 연결하도록 변경합니다.

테이블이 일부만 있거나 SQL 실행 중 오류가 발생하면 오류 메시지를 그대로 알려주세요. 기존 테이블을 지우지 말고, 현재 상태에 맞는 추가 migration으로 고치겠습니다.

## 7. GitHub와 Render 연결

GitHub 저장소는 연결되어 있으므로 Render에서 `New` → `Blueprint`를 선택하고 해당 저장소를 가져옵니다. `render.yaml`이 `SUPABASE_URL`을 이미 지정합니다. Render Environment에는 `GEMINI_API_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`를 설정합니다. 비밀 키는 Render의 환경변수에만 두고 `.env`는 GitHub에 올리지 않습니다.

이 앱은 현재 Supabase 무료 프로젝트, Gemini 무료 사용량, Render 무료 웹 서비스를 목표로 구성되어 있습니다. 무료 서비스에는 요청량·저장공간 제한이 있고, Render는 사용이 없으면 잠들 수 있습니다.

## 8. 자동 채점 상태

이번 설정에서는 Judge0를 연결하지 않았습니다. 따라서 학생은 브라우저에서 Python 실행과 AI 튜터를 사용할 수 있지만, `제출하고 채점`은 비활성 상태입니다. 비공개 테스트케이스를 학생 브라우저에 보내지 않고 점수를 매기려면 격리 채점 API가 필요합니다. Judge0 키를 준비하면 서버의 `JUDGE0_API_KEY` 환경변수로 연결할 수 있습니다. 키가 설정되기 전에는 제출 코드나 임시 점수를 데이터베이스에 저장하지 않습니다.
