-- Run after creating a teacher profile and a class. This creates demo problems,
-- visible examples, and private test cases. Students cannot select test_cases.
do $$
declare
  teacher_uuid uuid;
  class_uuid uuid := 'a2c1c390-fdd5-40cc-8ced-a81ddf84f24d';
  conditional_uuid uuid := '7480771d-297c-4e22-bb60-9e2d91621aa1';
  list_uuid uuid := '2a1292d3-8c95-46a6-8d28-1b13f35dbd4d';
  dictionary_uuid uuid := '7a12c2a3-bb7a-449e-b328-09950e358039';
  maximum_uuid uuid := '8b13d3b4-cc8b-45f9-a439-10050e468140';
  multiple_uuid uuid := '9c24e4c5-dd9c-46f0-b54a-21161f579251';
  palindrome_uuid uuid := 'ad35f5d6-eead-4701-c65b-32272068a362';
begin
  select id into teacher_uuid from public.profiles where role in ('teacher', 'admin') order by created_at limit 1;
  if teacher_uuid is null then
    raise exception '먼저 profiles에서 교사 계정을 만들어 주세요.';
  end if;

  insert into public.classes (id, teacher_id, name)
  values (class_uuid, teacher_uuid, '파이썬 기초반')
  on conflict (id) do nothing;

  insert into public.problems (id, class_id, title, description, allowed_concepts, points, status)
  values
    (conditional_uuid, class_uuid, '용돈 계산', '용돈과 책 가격을 입력받아 남은 돈 또는 부족한 금액을 출력하세요.', array['input', 'int', 'if', 'else', '산술 연산', 'format'], 100, 'published'),
    (list_uuid, class_uuid, '점수 합계', '공백으로 구분된 점수를 입력받아 반복문으로 합계를 출력하세요.', array['input', 'split', 'int', '리스트', 'for 반복문', '누적 합계'], 100, 'published'),
    (dictionary_uuid, class_uuid, '사전에서 값 찾기', '정해진 이름표를 키로 사용해 딕셔너리에 저장된 값을 출력하세요.', array['딕셔너리', '키', '값', '문자열'], 100, 'published'),
    (maximum_uuid, class_uuid, '최댓값 찾기', '공백으로 구분된 정수 중 가장 큰 값을 출력하세요. max() 함수 없이 반복문으로 찾아보세요.', array['input', 'split', 'int', '리스트', 'for 반복문', '비교 연산'], 100, 'published'),
    (multiple_uuid, class_uuid, '3의 배수 개수', '공백으로 구분된 정수 중 3의 배수가 몇 개인지 출력하세요.', array['input', 'split', 'int', 'for 반복문', 'if', '나머지 연산'], 100, 'published'),
    (palindrome_uuid, class_uuid, '회문 확인', '입력한 소문자 문자열이 앞에서 읽어도 뒤에서 읽어도 같은지 판별하세요. 같으면 YES, 아니면 NO를 출력하세요.', array['문자열', '인덱싱', '슬라이싱', 'if', '비교 연산'], 100, 'published')
  on conflict (id) do nothing;

  insert into public.problem_examples (id, problem_id, stdin, expected_stdout)
  values
    ('3664a494-3274-4e21-a5e0-843fdde41cc1', conditional_uuid, E'2000\n1000\n', E'남은 돈 1000원\n'),
    ('3664a494-3274-4e21-a5e0-843fdde41cc2', conditional_uuid, E'500\n1200\n', E'700원 부족\n'),
    ('3664a494-3274-4e21-a5e0-843fdde41cc3', list_uuid, E'10 20 30 40\n', E'100\n'),
    ('3664a494-3274-4e21-a5e0-843fdde41cc4', dictionary_uuid, E'health\n', E'800\n'),
    ('3664a494-3274-4e21-a5e0-843fdde41cc5', maximum_uuid, E'3 9 2\n', E'9\n'),
    ('3664a494-3274-4e21-a5e0-843fdde41cc6', multiple_uuid, E'1 3 4 6 8 9\n', E'3\n'),
    ('3664a494-3274-4e21-a5e0-843fdde41cc7', palindrome_uuid, E'level\n', E'YES\n')
  on conflict do nothing;

  insert into public.test_cases (id, problem_id, stdin, expected_stdout, points)
  values
    ('4875a494-3274-4e21-a5e0-843fdde41cc1', conditional_uuid, E'1500\n1000\n', E'남은 돈 500원\n', 30),
    ('4875a494-3274-4e21-a5e0-843fdde41cc2', conditional_uuid, E'1000\n1000\n', E'남은 돈 0원\n', 30),
    ('4875a494-3274-4e21-a5e0-843fdde41cc3', conditional_uuid, E'500\n1200\n', E'700원 부족\n', 40),
    ('4875a494-3274-4e21-a5e0-843fdde41cc4', list_uuid, E'1 2 3\n', E'6\n', 30),
    ('4875a494-3274-4e21-a5e0-843fdde41cc5', list_uuid, E'10 20 30 40\n', E'100\n', 30),
    ('4875a494-3274-4e21-a5e0-843fdde41cc6', list_uuid, E'-2 7 0\n', E'5\n', 40),
    ('4875a494-3274-4e21-a5e0-843fdde41cc7', dictionary_uuid, E'health\n', E'800\n', 50),
    ('4875a494-3274-4e21-a5e0-843fdde41cc8', dictionary_uuid, E'mana\n', E'800\n', 50),
    ('9876b5a4-4321-4e21-a5e0-843fdde41cc1', maximum_uuid, E'4 8 3 7\n', E'8\n', 25),
    ('9876b5a4-4321-4e21-a5e0-843fdde41cc2', maximum_uuid, E'-8 -2 -9\n', E'-2\n', 35),
    ('9876b5a4-4321-4e21-a5e0-843fdde41cc3', maximum_uuid, E'7\n', E'7\n', 40),
    ('9876b5a4-4321-4e21-a5e0-843fdde41cc4', multiple_uuid, E'1 3 4 6 8 9\n', E'3\n', 30),
    ('9876b5a4-4321-4e21-a5e0-843fdde41cc5', multiple_uuid, E'-3 0 5\n', E'2\n', 35),
    ('9876b5a4-4321-4e21-a5e0-843fdde41cc6', multiple_uuid, E'2 4 8\n', E'0\n', 35),
    ('9876b5a4-4321-4e21-a5e0-843fdde41cc7', palindrome_uuid, E'level\n', E'YES\n', 25),
    ('9876b5a4-4321-4e21-a5e0-843fdde41cc8', palindrome_uuid, E'python\n', E'NO\n', 25),
    ('9876b5a4-4321-4e21-a5e0-843fdde41cc9', palindrome_uuid, E'a\n', E'YES\n', 25),
    ('9876b5a4-4321-4e21-a5e0-843fdde41cca', palindrome_uuid, E'abba\n', E'YES\n', 25)
  on conflict do nothing;
end $$;
