const $ = selector => document.querySelector(selector);
const editor = $("#code-editor");
const lineNumbers = $("#line-numbers");
const output = $("#output-content");
const outputState = $("#output-state");
const runButton = $("#run-code");
const loginScreen = $("#login-screen");
const appShell = $("#app-shell");
let sbClient;
let loginRole = "student";
let currentUser;
let currentProfile;
let currentClassId;
let currentProblem;
let availableProblems = [];
let studentMode = "free";
let pythonWorker;
let workerReady;
let pendingRun;
let currentError;
let currentStep = 0;
let tutorSessionId;
let judgeConfigured = false;
let databaseReady = false;
let toastTimer;

function message(target, text, error = false) {
  const element = $(target);
  element.textContent = text;
  element.classList.toggle("error", error);
}

function toast(text) {
  const element = $("#global-message");
  element.textContent = text;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2800);
}

function sessionToken() {
  return sbClient.auth.getSession().then(({ data, error }) => {
    if (error || !data.session) throw new Error("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
    return data.session.access_token;
  });
}

async function apiPost(url, body) {
  const token = await sessionToken();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

function setLoginRole(role) {
  loginRole = role;
  document.querySelectorAll("[data-login-role]").forEach(button => button.classList.toggle("selected", button.dataset.loginRole === role));
  $("#login-id-label").textContent = role === "student" ? "학생 아이디" : "교사 이메일";
  $("#login-id").placeholder = role === "student" ? "교사가 알려준 아이디" : "교사 이메일 주소";
  $("#login-id").autocomplete = role === "student" ? "username" : "email";
  $("#login-submit").firstChild.textContent = role === "student" ? "학생으로 로그인 " : "교사로 로그인 ";
}

async function initialize() {
  try {
    const [configResponse, healthResponse] = await Promise.all([fetch("/api/config"), fetch("/api/health")]);
    const config = await configResponse.json();
    const health = await healthResponse.json();
    judgeConfigured = health.judgeConfigured;
    databaseReady = health.databaseReady;
    $("#grading-notice").classList.toggle("hidden", judgeConfigured);
    if (!window.supabase || !config.publishableKey) throw new Error("Supabase Publishable key 설정이 필요합니다.");
    sbClient = window.supabase.createClient(config.supabaseUrl, config.publishableKey);
    $("#connection-state").textContent = !health.supabaseConfigured
      ? "Supabase 서버 키 설정을 확인해 주세요"
      : health.databaseReady ? "Supabase 연결 및 테이블 확인됨" : "Supabase 스키마/migration 적용 후 로그인할 수 있습니다";
    $("#login-submit").disabled = !health.databaseReady;
    const { data, error } = await sbClient.auth.getSession();
    if (error) throw error;
    if (data.session) await openSession(data.session);
  } catch (error) {
    $(".connection-note").classList.add("error");
    $("#connection-state").textContent = error.message || "서비스 연결을 확인해 주세요.";
  }
}

async function login(event) {
  event.preventDefault();
  const button = $("#login-submit");
  const rawId = $("#login-id").value.trim();
  const password = $("#login-password").value;
  button.disabled = true;
  message("#login-message", "로그인 확인 중...");
  let timeoutId;
  try {
    if (!sbClient) throw new Error("Supabase 프로젝트 설정이 아직 준비되지 않았습니다.");
    const email = loginRole === "student" && !rawId.includes("@") ? `${rawId.toLowerCase()}@students.codeon.invalid` : rawId;
    const signIn = sbClient.auth.signInWithPassword({ email, password });
    const timeout = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error("로그인 서버 응답이 늦습니다. 잠시 후 다시 시도해 주세요.")), 15000); });
    const { data, error } = await Promise.race([signIn, timeout]);
    if (error) throw error;
    await openSession(data.session);
  } catch (error) {
    message("#login-message", error.message === "Invalid login credentials" ? "아이디 또는 비밀번호를 확인해 주세요." : error.message, true);
  } finally {
    clearTimeout(timeoutId);
    button.disabled = !databaseReady;
  }
}

async function openSession(session) {
  const { data, error } = await sbClient.from("profiles").select("id,username,display_name,role").eq("id", session.user.id).single();
  if (error) {
    await sbClient.auth.signOut();
    throw new Error("계정 프로필을 불러오지 못했습니다. 관리자에게 문의해 주세요.");
  }
  if (!["student", "teacher", "admin"].includes(data.role)) throw new Error("계정 역할이 설정되지 않았습니다.");
  currentUser = session.user;
  currentProfile = data;
  loginScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
  $("#user-name").textContent = data.display_name || data.username || session.user.email || "사용자";
  $("#user-avatar").textContent = (data.display_name || data.username || "학").slice(0, 1);
  $("#user-role").textContent = data.role === "student" ? "학생" : data.role === "admin" ? "관리자" : "교사";
  $("#student-view").classList.toggle("hidden", data.role !== "student");
  $("#teacher-view").classList.toggle("hidden", data.role === "student");
  if (data.role === "student") await loadStudentClasses();
  else await loadTeacherClasses();
}

async function signOut() {
  if (sbClient) await sbClient.auth.signOut();
  $("#demo-credentials").replaceChildren();
  $("#demo-credentials").classList.add("hidden");
  currentUser = null;
  currentProfile = null;
  currentClassId = null;
  currentProblem = null;
  studentMode = "free";
  document.querySelectorAll("[data-student-mode]").forEach(button => button.classList.toggle("active", button.dataset.studentMode === "free"));
  appShell.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  $("#login-form").reset();
  message("#login-message", "");
}

function fillSelect(select, rows, { value = "id", label = "name", emptyLabel = "수업을 선택하세요" } = {}) {
  select.replaceChildren();
  if (!rows.length) {
    const option = new Option(emptyLabel, "");
    select.add(option);
    return;
  }
  rows.forEach(row => select.add(new Option(row[label], row[value])));
}

async function loadStudentClasses() {
  const { data, error } = await sbClient.from("enrollments").select("class_id,classes(id,name)").eq("student_id", currentUser.id);
  if (error) return toast("수업 정보를 불러오지 못했습니다.");
  const classes = (data || []).map(row => row.classes).filter(Boolean);
  fillSelect($("#student-class"), classes, { emptyLabel: "등록된 수업이 없습니다" });
  if (!classes.length) {
    currentClassId = null;
    availableProblems = [];
    fillSelect($("#problem-picker"), [], { emptyLabel: "교사가 수업에 등록하면 문제가 보여요" });
    currentProblem = null;
    renderProblemMode();
    return;
  }
  currentClassId = classes[0].id;
  await loadStudentProblems();
}

async function loadStudentProblems() {
  const { data, error } = await sbClient.from("problems").select("id,title,description,allowed_concepts,points,status").eq("class_id", currentClassId).eq("status", "published").order("created_at", { ascending: true });
  if (error) {
    toast("문제 목록을 불러오지 못했습니다.");
    return;
  }
  availableProblems = data || [];
  fillSelect($("#problem-picker"), availableProblems, { emptyLabel: "공개된 문제가 없습니다" });
  currentProblem = studentMode === "problem" ? availableProblems[0] || null : null;
  renderProblemMode();
  if (studentMode === "problem" && currentProblem) renderProblem(currentProblem);
  if (currentProblem) await loadStudentHistory();
}

function renderProblem(problem) {
  currentProblem = problem;
  $("#problem-title").textContent = problem?.title || "공개된 문제가 없습니다";
  $("#problem-description").textContent = problem?.description || "교사가 문제를 공개하면 이곳에서 선택할 수 있습니다.";
  $("#problem-points").textContent = problem ? `${problem.points}점` : "";
  renderProblemMode();
  editor.value = "";
  $("#stdin-editor").value = "";
  $("#current-filename").textContent = "solution.py";
  updateLineNumbers();
  resetTutor();
  output.textContent = "코드를 작성한 뒤 실행해 보세요.";
  output.className = "";
  setOutputState("실행 전");
  $("#submit-code").disabled = !problem || !judgeConfigured;
  $("#submit-code").title = judgeConfigured ? "테스트케이스로 채점" : "Judge0 API 키 설정 후 이용 가능";
}

function renderProblemMode() {
  const problemMode = studentMode === "problem";
  $("#problem-mode-context").classList.toggle("hidden", !problemMode || !currentProblem);
  $("#submit-code").classList.toggle("hidden", !problemMode);
  $("#grading-notice").classList.toggle("hidden", !problemMode || judgeConfigured);
}

function setStudentMode(mode) {
  studentMode = mode;
  document.querySelectorAll("[data-student-mode]").forEach(button => button.classList.toggle("active", button.dataset.studentMode === mode));
  resetTutor();
  if (mode === "problem") {
    const selected = availableProblems.find(problem => problem.id === $("#problem-picker").value) || availableProblems[0] || null;
    if (selected) $("#problem-picker").value = selected.id;
    renderProblem(selected);
    loadStudentHistory();
  } else {
    currentProblem = null;
    renderProblemMode();
  }
}

async function loadStudentHistory() {
  const { data, error } = await sbClient.from("submissions").select("id,status,score,max_score,created_at,problems(title)").eq("student_id", currentUser.id).order("created_at", { ascending: false }).limit(8);
  const container = $("#student-history");
  container.replaceChildren();
  if (error || !data?.length) {
    const empty = document.createElement("p");
    empty.className = "empty-row";
    empty.textContent = error ? "기록을 불러오지 못했습니다." : "아직 제출 기록이 없습니다.";
    container.append(empty);
    return;
  }
  data.forEach(item => {
    const row = document.createElement("div");
    row.className = "history-item";
    const title = document.createElement("span");
    title.textContent = item.problems?.title || "문제";
    const status = document.createElement("strong");
    status.textContent = `${statusLabel(item.status)} · ${item.score ?? "—"}/${item.max_score}`;
    row.append(title, status);
    container.append(row);
  });
}

function statusLabel(status) {
  return ({ accepted: "정답", wrong_answer: "오답", runtime_error: "실행 오류", time_limit: "시간 초과", queued: "채점 중", internal_error: "채점 오류" })[status] || status;
}

async function loadTeacherClasses() {
  let query = sbClient.from("classes").select("id,name").order("created_at");
  if (currentProfile.role !== "admin") query = query.eq("teacher_id", currentUser.id);
  const { data, error } = await query;
  if (error) return toast("수업 목록을 불러오지 못했습니다.");
  fillSelect($("#teacher-class"), data || [], { emptyLabel: "수업을 먼저 만드세요" });
  fillSelect($("#new-student-class"), data || [], { emptyLabel: "수업을 먼저 만드세요" });
  currentClassId = data?.[0]?.id || null;
  $("#new-student-class").value = currentClassId || "";
  if (currentClassId) await loadTeacherData();
  else updateTeacherEmpty();
}

function updateTeacherEmpty() {
  ["#stat-students", "#stat-problems", "#stat-submissions", "#stat-tutor-events"].forEach(selector => $(selector).textContent = "0");
  $("#student-overview-rows").innerHTML = '<tr><td colspan="4" class="empty-row">아래에서 첫 수업을 만들어 주세요.</td></tr>';
  $("#roster-rows").innerHTML = '<tr><td colspan="3" class="empty-row">수업을 만든 뒤 학생 계정을 발급하세요.</td></tr>';
  $("#teacher-problems").innerHTML = '<p class="empty-row">등록 문제가 없습니다.</p>';
  $("#tutor-rows").innerHTML = '<tr><td colspan="5" class="empty-row">아직 튜터 기록이 없습니다.</td></tr>';
  $("#overview-tutor-rows").innerHTML = '<tr><td colspan="4" class="empty-row">아직 기록이 없습니다.</td></tr>';
}

async function loadTeacherData() {
  if (!currentClassId) return updateTeacherEmpty();
  const [rosterResult, problemResult] = await Promise.all([
    sbClient.from("enrollments").select("student_id,created_at,profiles!inner(display_name,username)").eq("class_id", currentClassId),
    sbClient.from("problems").select("id,title,description,points,status,created_at").eq("class_id", currentClassId).order("created_at", { ascending: false })
  ]);
  const roster = rosterResult.data || [];
  const problems = problemResult.data || [];
  $("#stat-students").textContent = String(roster.length);
  $("#stat-problems").textContent = String(problems.filter(problem => problem.status === "published").length);
  $("#stat-submissions").textContent = "—";
  fillRoster(roster);
  fillProblems(problems);
  await loadTutorRecords(roster, problems);
  await loadTeacherSubmissions(roster, problems);
}

function fillRoster(roster) {
  const rows = $("#roster-rows");
  const overview = $("#student-overview-rows");
  rows.replaceChildren();
  overview.replaceChildren();
  if (!roster.length) {
    rows.innerHTML = '<tr><td colspan="3" class="empty-row">학생이 없습니다.</td></tr>';
    overview.innerHTML = '<tr><td colspan="4" class="empty-row">아직 학생이 없습니다.</td></tr>';
    return;
  }
  roster.forEach(enrollment => {
    const profile = enrollment.profiles || {};
    const tr = document.createElement("tr");
    [profile.display_name || "학생", profile.username || "이메일 계정", new Date(enrollment.created_at).toLocaleDateString("ko-KR")].forEach(value => {
      const td = document.createElement("td"); td.textContent = value; tr.append(td);
    });
    rows.append(tr);
    const overviewRow = document.createElement("tr");
    [profile.display_name || "학생", profile.username || "이메일 계정", "—", "—"].forEach(value => {
      const td = document.createElement("td"); td.textContent = value; overviewRow.append(td);
    });
    overview.append(overviewRow);
  });
}

function fillProblems(problems) {
  const list = $("#teacher-problems");
  list.replaceChildren();
  if (!problems.length) {
    const empty = document.createElement("p"); empty.className = "empty-row"; empty.textContent = "등록 문제가 없습니다."; list.append(empty); return;
  }
  problems.forEach(problem => {
    const item = document.createElement("article"); item.className = "teacher-problem";
    const heading = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = problem.title;
    const state = document.createElement("span"); state.textContent = problem.status === "published" ? "공개" : "비공개";
    heading.append(title, state);
    const description = document.createElement("p"); description.textContent = `${problem.points}점 · ${problem.description}`;
    item.append(heading, description); list.append(item);
  });
}

async function loadTeacherSubmissions(roster, problems) {
  if (!roster.length) return;
  const studentIds = roster.map(row => row.student_id);
  const { data, error } = await sbClient.from("submissions").select("student_id,status,score,max_score,created_at").in("student_id", studentIds).order("created_at", { ascending: false }).limit(200);
  if (error) return;
  const latest = new Map();
  (data || []).forEach(row => { if (!latest.has(row.student_id)) latest.set(row.student_id, row); });
  const nameById = new Map(roster.map(row => [row.student_id, row.profiles?.display_name || row.profiles?.username || "학생"]));
  const body = $("#student-overview-rows"); body.replaceChildren();
  if (!latest.size) {
    body.innerHTML = '<tr><td colspan="4" class="empty-row">제출 기록이 없습니다.</td></tr>';
    $("#stat-submissions").textContent = "0";
    return;
  }
  $("#stat-submissions").textContent = String(data.length);
  [...latest.entries()].forEach(([studentId, row]) => {
    const tr = document.createElement("tr");
    [nameById.get(studentId), statusLabel(row.status), `${row.score ?? "—"}/${row.max_score}`, new Date(row.created_at).toLocaleDateString("ko-KR")].forEach(value => { const td = document.createElement("td"); td.textContent = value; tr.append(td); });
    body.append(tr);
  });
}

function aggregateTutorRows(events, roster) {
  const names = new Map(roster.map(row => [row.student_id, row.profiles?.display_name || row.profiles?.username || "학생"]));
  const grouped = new Map();
  (events || []).forEach(event => {
    const key = `${event.session_id}:${event.student_id}:${event.problem_id}`;
    const current = grouped.get(key);
    if (!current || event.stage > current.stage) grouped.set(key, event);
  });
  return [...grouped.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(event => ({ ...event, studentName: names.get(event.student_id) || event.profiles?.display_name || "학생" }));
}

function fillTutorRows(events, roster, problems) {
  const grouped = aggregateTutorRows(events, roster);
  const problemNames = new Map(problems.map(problem => [problem.id, problem.title]));
  const rows = $("#tutor-rows");
  const summaryRows = $("#overview-tutor-rows");
  rows.replaceChildren(); summaryRows.replaceChildren();
  $("#stat-tutor-events").textContent = String(grouped.length);
  if (!grouped.length) {
    rows.innerHTML = '<tr><td colspan="5" class="empty-row">아직 기록이 없습니다.</td></tr>';
    summaryRows.innerHTML = '<tr><td colspan="4" class="empty-row">아직 기록이 없습니다.</td></tr>';
    return;
  }
  grouped.forEach(event => {
    const row = [event.studentName, event.problem_id ? problemNames.get(event.problem_id) || "문제" : "자유 코드", event.error_type, `${event.stage}단계`, new Date(event.created_at).toLocaleString("ko-KR")];
    const tr = document.createElement("tr"); row.forEach(value => { const td = document.createElement("td"); td.textContent = value; tr.append(td); }); rows.append(tr);
  });
  grouped.slice(0, 5).forEach(event => {
    const tr = document.createElement("tr");
    [event.studentName, event.problem_id ? problemNames.get(event.problem_id) || "문제" : "자유 코드", `${event.stage}단계`, new Date(event.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })].forEach(value => { const td = document.createElement("td"); td.textContent = value; tr.append(td); }); summaryRows.append(tr);
  });
}

async function loadTutorRecords(roster = [], problems = []) {
  const { data, error } = await sbClient.from("tutor_events").select("id,student_id,class_id,problem_id,session_id,stage,error_type,line_number,created_at,profiles(display_name,username)").eq("class_id", currentClassId).order("created_at", { ascending: false }).limit(300);
  if (error) {
    $("#tutor-rows").innerHTML = '<tr><td colspan="5" class="empty-row">튜터 기록 테이블 준비 후 표시됩니다.</td></tr>';
    return;
  }
  fillTutorRows(data || [], roster, problems);
}

function updateLineNumbers() {
  if (!editor || !lineNumbers) return;
  lineNumbers.innerHTML = Array.from({ length: editor.value.split("\n").length }, (_, index) => index + 1).join("<br>");
  lineNumbers.scrollTop = editor.scrollTop;
}

function setOutputState(text, type = "") {
  outputState.textContent = text;
  outputState.className = `output-state ${type}`;
}

function resetTutor() {
  currentError = null;
  currentStep = 0;
  tutorSessionId = null;
  $("#tutor-content").innerHTML = '<div class="tutor-empty"><div class="empty-glyph"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="4"/></svg></div><h3>막히면 같이 살펴봐요</h3><p>코드를 실행하면 오류 종류부터 차근차근 확인해요.</p></div>';
}

function classifyError(errorText) {
  const types = ["IndentationError", "ModuleNotFoundError", "NameError", "TypeError", "SyntaxError", "ZeroDivisionError", "IndexError", "KeyError", "ValueError", "ImportError", "RecursionError", "EOFError"];
  const kind = types.find(type => errorText.includes(type)) || "실행 오류";
  const line = Number(errorText.match(/File "<exec>", line (\d+)/)?.[1]) || Number([...errorText.matchAll(/line (\d+)/g)].at(-1)?.[1]) || null;
  const explanations = {
    NameError: "사용하려는 이름을 파이썬이 찾지 못했어요. 변수 이름이나 정의된 위치를 살펴보세요.",
    TypeError: "연산이나 함수에 서로 맞지 않는 종류의 값이 전달됐어요. 사용한 값의 자료형을 확인해 보세요.",
    SyntaxError: "파이썬 문장의 형태를 해석하지 못했어요. 괄호, 따옴표, 콜론과 철자를 살펴보세요.",
    IndentationError: "코드 블록의 들여쓰기가 맞지 않아요. 같은 블록의 줄이 같은 위치에서 시작하는지 확인해 보세요.",
    ZeroDivisionError: "0으로 나누려 했어요. 나누는 값이 0이 될 수 있는 경우를 확인해 보세요.",
    IndexError: "리스트에서 존재하지 않는 위치를 가져오려 했어요. 인덱스와 리스트 길이를 살펴보세요.",
    KeyError: "딕셔너리에서 찾을 수 없는 키를 사용했어요. 키의 철자와 실제 항목을 확인해 보세요.",
    ValueError: "값은 전달됐지만, 그 값의 형태로는 요청한 작업을 할 수 없어요. 입력값을 살펴보세요.",
    ImportError: "가져오려는 기능을 찾지 못했어요. import 문과 배운 기능인지 확인해 보세요.",
    ModuleNotFoundError: "이 실행 환경에서 모듈을 찾지 못했어요. 수업에서 배운 문법만 사용했는지 살펴보세요.",
    RecursionError: "재귀 호출이 계속 이어졌어요. 재귀를 멈추는 종료 조건과 호출할 때 값이 달라지는지 살펴보세요.",
    EOFError: "입력을 기다렸지만 받을 값이 없어요. 입력을 처리하는 방식과 실행 환경을 확인해 보세요."
  };
  return { kind, line, description: explanations[kind] || "오류 메시지를 바탕으로 코드를 한 부분씩 다시 살펴보세요." };
}

function getPythonWorker() {
  if (pythonWorker && workerReady) return workerReady;
  pythonWorker = new Worker("python-worker.js");
  workerReady = new Promise((resolve, reject) => {
    const initTimer = setTimeout(() => reject(new Error("Python 실행 환경을 불러오지 못했습니다.")), 45000);
    pythonWorker.onmessage = event => {
      const message = event.data;
      if (message.type === "ready") { clearTimeout(initTimer); resolve(); }
      else if (message.type === "ready-error") { clearTimeout(initTimer); reject(new Error(message.message)); }
      else if (message.type === "result" && pendingRun) {
        clearTimeout(pendingRun.timer);
        const done = pendingRun.resolve;
        pendingRun = null;
        done(message);
      }
    };
    pythonWorker.onerror = () => { clearTimeout(initTimer); reject(new Error("Python 실행 환경을 연결하지 못했습니다.")); };
  });
  return workerReady;
}

function executePython(code, stdin) {
  return getPythonWorker().then(() => new Promise((resolve, reject) => {
    pendingRun = { resolve, timer: setTimeout(() => {
      pythonWorker?.terminate(); pythonWorker = null; workerReady = null; pendingRun = null;
      reject(new Error("실행 시간이 너무 깁니다. 반복 조건을 확인해 주세요."));
    }, 10000) };
    pythonWorker.postMessage({ type: "run", code, stdin });
  }));
}

async function recordTutorStage(stage) {
  if (!currentError || !currentClassId || !tutorSessionId) return;
  try {
    await apiPost("/api/tutor/events", { classId: currentClassId, problemId: currentProblem?.id || null, sessionId: tutorSessionId, stage, errorType: currentError.kind, lineNumber: currentError.line });
  } catch {
    toast("튜터 도움 기록을 저장하지 못했습니다.");
  }
}

function createTutorMessage({ step, label, title, description, nextLabel = "다음 힌트", loading = false }) {
  const tutor = $("#tutor-content");
  tutor.replaceChildren();
  const card = document.createElement("div"); card.className = "tutor-step";
  const counter = document.createElement("div"); counter.className = "step-counter"; counter.textContent = `도움 단계 ${step} / 3`;
  const tag = document.createElement("span"); tag.className = "step-kind"; tag.textContent = label;
  const heading = document.createElement("h3"); heading.textContent = title;
  const text = document.createElement("p"); text.textContent = description;
  card.append(counter, tag, heading, text);
  if (nextLabel) {
    const actions = document.createElement("div"); actions.className = "step-actions";
    const button = document.createElement("button"); button.type = "button"; button.className = "next-step"; button.disabled = loading;
    button.textContent = loading ? "AI가 설명을 정리하고 있어요" : nextLabel;
    if (!loading) {
      const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg"); arrow.setAttribute("viewBox", "0 0 24 24"); arrow.setAttribute("aria-hidden", "true"); arrow.innerHTML = '<path d="M5 12h14m-6-6 6 6-6 6"/>';
      button.append(arrow); button.addEventListener("click", nextHint);
    }
    actions.append(button); card.append(actions);
  }
  tutor.append(card);
}

async function runCode() {
  const code = editor.value.trim();
  if (!code) { editor.focus(); return; }
  runButton.disabled = true; runButton.textContent = "실행 중";
  setOutputState("실행 환경 준비 중"); output.textContent = "처음 실행할 때 Python 도구를 불러옵니다."; output.className = "";
  resetTutor();
  try {
    const result = await executePython(code, $("#stdin-editor").value);
    const outputText = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    if (result.error) {
      currentError = classifyError(result.error); currentError.raw = result.error; currentError.code = code;
      tutorSessionId = crypto.randomUUID(); currentStep = 1;
      output.textContent = outputText ? `${outputText}\n\n${result.error}` : result.error; output.className = "has-error"; setOutputState(currentError.kind, "error");
      createTutorMessage({ step: 1, label: "오류 종류", title: currentError.kind, description: currentError.description });
      await recordTutorStage(1);
    } else {
      output.textContent = outputText || "실행이 끝났어요. 출력된 내용은 없습니다."; output.className = "has-output"; setOutputState("실행 완료", "success");
      $("#tutor-content").innerHTML = '<div class="tutor-empty"><div class="empty-glyph"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></div><h3>오류 없이 실행됐어요</h3><p>출력 결과를 확인해 보세요.</p></div>';
    }
  } catch (error) {
    pythonWorker?.terminate(); pythonWorker = null; workerReady = null;
    const timedOut = error.message.includes("실행 시간이 너무 깁니다");
    output.textContent = error.message; output.className = "has-error"; setOutputState(timedOut ? "시간 초과" : "실행 오류", "error");
    const title = timedOut ? "실행 시간이 초과됐어요" : "코드를 실행하지 못했어요";
    const detail = timedOut ? "반복문이나 재귀 호출이 끝나는지 확인해 보세요." : error.message;
    $("#tutor-content").innerHTML = `<div class="tutor-empty"><h3>${title}</h3><p></p></div>`;
    $("#tutor-content .tutor-empty p").textContent = detail;
  } finally {
    runButton.disabled = false; runButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 12 7-12 7V5Z"/></svg>실행';
  }
}

async function nextHint() {
  if (!currentError || !currentClassId) return;
  if (currentStep === 1) {
    currentStep = 2;
    const line = currentError.line ? `${currentError.line}행을 확인해 보세요.` : "실행 결과에서 오류가 난 부분을 살펴보세요.";
    createTutorMessage({ step: 2, label: "오류 위치", title: "어느 줄부터 볼까요?", description: `${line}\n\n오류 메시지에 나온 이름이나 연산이 이 줄에서 어떻게 쓰였는지 직접 찾아보세요.`, nextLabel: "자세한 개념 힌트" });
    await recordTutorStage(2);
    return;
  }
  if (currentStep === 2) {
    currentStep = 3;
    await recordTutorStage(3);
    createTutorMessage({ step: 3, label: "배운 개념으로 설명", title: "개념을 연결하고 있어요", description: "코드를 고쳐 주는 대신, 오류 원인을 설명할게요.", nextLabel: null, loading: true });
    try {
      const response = await fetch("/api/hints", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await sessionToken()}` },
        body: JSON.stringify({ classId: currentClassId, problemId: currentProblem?.id || null, code: currentError.code, error: currentError.raw, errorType: currentError.kind, line: currentError.line })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI 힌트를 불러오지 못했습니다.");
      createTutorMessage({ step: 3, label: "배운 개념으로 설명", title: "오류가 생긴 이유", description: data.hint, nextLabel: null });
    } catch (error) {
      createTutorMessage({ step: 3, label: "AI 연결", title: "자세한 힌트를 가져오지 못했어요", description: error.message, nextLabel: null });
    }
  }
}

async function submitCode() {
  if (!currentProblem) return toast("먼저 문제를 선택해 주세요.");
  const code = editor.value.trim();
  if (!code) return toast("코드를 작성한 뒤 제출해 주세요.");
  const button = $("#submit-code"); button.disabled = true; button.textContent = "채점 요청 중";
  try {
    const result = await apiPost("/api/submissions", { problemId: currentProblem.id, code });
    output.textContent = `${statusLabel(result.status)}\n점수: ${result.score} / ${result.maxScore}`;
    output.className = result.status === "accepted" ? "has-output" : "has-error";
    setOutputState(statusLabel(result.status), result.status === "accepted" ? "success" : "error");
    toast(`${statusLabel(result.status)} · ${result.score}/${result.maxScore}점`);
    await loadStudentHistory();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = !judgeConfigured;
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>제출하고 채점';
  }
}

async function createClass(event) {
  event.preventDefault();
  const name = $("#new-class-name").value.trim();
  if (!name) return;
  const { data, error } = await sbClient.from("classes").insert({ teacher_id: currentUser.id, name }).select("id,name").single();
  if (error) return toast("수업을 만들지 못했습니다.");
  $("#create-class-form").reset();
  toast("수업을 만들었습니다.");
  await loadTeacherClasses();
  if (data) {
    currentClassId = data.id;
    $("#teacher-class").value = data.id;
    $("#new-student-class").value = data.id;
    await loadTeacherData();
  }
}

async function createStudent(event) {
  event.preventDefault();
  const form = event.currentTarget; const button = form.querySelector("button[type=submit]");
  button.disabled = true; message("#student-create-message", "계정을 만드는 중...");
  try {
    const data = await apiPost("/api/teacher/students", {
      displayName: $("#new-student-name").value,
      username: $("#new-student-id").value,
      password: $("#new-student-password").value,
      classId: $("#new-student-class").value
    });
    form.reset();
    $("#new-student-class").value = currentClassId || "";
    message("#student-create-message", `계정이 만들어졌습니다. 아이디: ${data.username}`);
    toast("학생 계정을 수업에 등록했습니다.");
    await loadTeacherData();
  } catch (error) { message("#student-create-message", error.message, true); }
  finally { button.disabled = false; }
}

function randomAccountToken(length = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map(byte => (byte % 36).toString(36)).join("");
}

function showDemoCredentials(accounts) {
  const container = $("#demo-credentials");
  container.replaceChildren();
  container.classList.remove("hidden");
  const note = document.createElement("p");
  note.className = "form-help";
  note.textContent = "임시 비밀번호는 다시 조회할 수 없으니 지금 안전하게 복사해 두세요.";
  container.append(note);
  accounts.forEach(account => {
    const row = document.createElement("div");
    row.className = "demo-credential-row";
    const name = document.createElement("span"); name.textContent = account.displayName;
    const credentials = document.createElement("code"); credentials.textContent = `${account.username}  /  ${account.password}`;
    const copy = document.createElement("button"); copy.type = "button"; copy.className = "text-button"; copy.textContent = "복사";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(`${account.username}\t${account.password}`);
        toast(`${account.username} 계정 정보를 복사했습니다.`);
      } catch {
        toast("복사에 실패했습니다. 아이디와 비밀번호를 직접 선택해 주세요.");
      }
    });
    row.append(name, credentials, copy);
    container.append(row);
  });
}

async function createDemoStudents() {
  const classId = $("#new-student-class").value;
  if (!classId) return message("#student-create-message", "먼저 수업을 만들고 선택해 주세요.", true);
  const button = $("#create-demo-students");
  const credentials = [];
  button.disabled = true;
  button.textContent = "테스트 계정 만드는 중...";
  message("#student-create-message", "테스트 학생 3개 계정을 만들고 있습니다.");
  try {
    for (let index = 1; index <= 3; index += 1) {
      const username = `try${randomAccountToken(8)}`;
      const password = `Py-${randomAccountToken(10)}A7!`;
      const displayName = `테스트 학생 ${index}`;
      await apiPost("/api/teacher/students", { username, password, displayName, classId });
      credentials.push({ username, password, displayName });
      showDemoCredentials(credentials);
    }
    message("#student-create-message", "테스트 학생 3명을 만들고 수업에 등록했습니다.");
    await loadTeacherData();
  } catch (error) {
    if (credentials.length) showDemoCredentials(credentials);
    message("#student-create-message", credentials.length ? `${credentials.length}개 계정을 만들었습니다. ${error.message}` : error.message, true);
    if (credentials.length) await loadTeacherData();
  } finally {
    button.disabled = false;
    button.textContent = "테스트 학생 3명 빠르게 만들기";
  }
}

function parseCaseJson(text, needsPoints) {
  if (!text.trim()) return [];
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed) || parsed.length > 20) throw new Error("테스트케이스는 최대 20개까지 JSON 배열로 입력해 주세요.");
  return parsed.map(item => {
    if (typeof item.input !== "string" || typeof item.output !== "string") throw new Error("각 케이스에는 문자열 input, output이 필요합니다.");
    if (needsPoints && (!Number.isInteger(Number(item.points)) || Number(item.points) < 1)) throw new Error("비공개 테스트에는 1점 이상의 points가 필요합니다.");
    return { stdin: item.input, expected_stdout: item.output, ...(needsPoints ? { points: Number(item.points) } : {}) };
  });
}

async function createProblem(event) {
  event.preventDefault();
  const form = event.currentTarget; const button = form.querySelector("button[type=submit]");
  button.disabled = true; message("#problem-create-message", "문제를 저장하는 중...");
  let problem;
  try {
    const examples = parseCaseJson($("#new-problem-examples").value, false);
    const tests = parseCaseJson($("#new-problem-tests").value, true);
    if (!tests.length) throw new Error("비공개 채점 케이스를 1개 이상 등록해 주세요.");
    const points = Number($("#new-problem-points").value);
    if (tests.reduce((sum, test) => sum + test.points, 0) !== points) throw new Error("비공개 테스트 points의 합계를 문제 배점과 맞춰 주세요.");
    const concepts = $("#new-problem-concepts").value.split(",").map(item => item.trim()).filter(Boolean);
    const inserted = await sbClient.from("problems").insert({
      class_id: currentClassId,
      title: $("#new-problem-title").value.trim(),
      description: $("#new-problem-description").value.trim(),
      allowed_concepts: concepts,
      points,
      status: $("#new-problem-published").checked ? "published" : "draft"
    }).select("id").single();
    if (inserted.error) throw inserted.error;
    problem = inserted.data;
    if (examples.length) {
      const result = await sbClient.from("problem_examples").insert(examples.map(item => ({ ...item, problem_id: problem.id })));
      if (result.error) throw result.error;
    }
    const testResult = await sbClient.from("test_cases").insert(tests.map(item => ({ ...item, problem_id: problem.id })));
    if (testResult.error) throw testResult.error;
    form.reset(); $("#new-problem-points").value = "100"; $("#new-problem-published").checked = true;
    message("#problem-create-message", "문제와 비공개 테스트케이스를 저장했습니다.");
    await loadTeacherData();
  } catch (error) {
    if (problem?.id) await sbClient.from("problems").delete().eq("id", problem.id);
    message("#problem-create-message", error.message || "문제를 저장하지 못했습니다.", true);
  } finally { button.disabled = false; }
}

function activateTeacherTab(name) {
  document.querySelectorAll("[data-teacher-tab]").forEach(button => button.classList.toggle("active", button.dataset.teacherTab === name));
  document.querySelectorAll("[data-teacher-panel]").forEach(panel => panel.classList.toggle("hidden", panel.dataset.teacherPanel !== name));
}

document.querySelectorAll("[data-login-role]").forEach(button => button.addEventListener("click", () => setLoginRole(button.dataset.loginRole)));
$("#login-form").addEventListener("submit", login);
$("#signout-button").addEventListener("click", signOut);
$("#student-class").addEventListener("change", async event => { currentClassId = event.target.value; await loadStudentProblems(); });
document.querySelectorAll("[data-student-mode]").forEach(button => button.addEventListener("click", () => setStudentMode(button.dataset.studentMode)));
$("#problem-picker").addEventListener("change", async event => {
  const { data } = await sbClient.from("problems").select("id,title,description,allowed_concepts,points,status").eq("id", event.target.value).single();
  renderProblem(data || null);
  await loadStudentHistory();
});
$("#run-code").addEventListener("click", runCode);
$("#submit-code").addEventListener("click", submitCode);
$("#clear-code").addEventListener("click", () => { editor.value = ""; $("#current-filename").textContent = "solution.py"; updateLineNumbers(); resetTutor(); output.textContent = "코드를 작성한 뒤 실행해 보세요."; output.className = ""; setOutputState("실행 전"); editor.focus(); });
$("#code-file").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".py")) return toast("Python .py 파일만 열 수 있습니다.");
  if (file.size > 20000) return toast("테스트 파일은 20KB 이하만 열 수 있습니다.");
  editor.value = await file.text();
  $("#current-filename").textContent = file.name;
  updateLineNumbers();
  resetTutor();
  output.textContent = "파일을 열었습니다. 실행해 보세요.";
  output.className = "";
  setOutputState("실행 전");
});
editor.addEventListener("input", updateLineNumbers);
editor.addEventListener("scroll", () => { lineNumbers.scrollTop = editor.scrollTop; });
editor.addEventListener("keydown", event => {
  if (event.key === "Tab") { event.preventDefault(); editor.setRangeText("    ", editor.selectionStart, editor.selectionEnd, "end"); updateLineNumbers(); }
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") runCode();
});
$("#refresh-history").addEventListener("click", loadStudentHistory);
$("#teacher-class").addEventListener("change", async event => { currentClassId = event.target.value; $("#new-student-class").value = currentClassId; await loadTeacherData(); });
$("#new-student-class").addEventListener("change", event => { $("#teacher-class").value = event.target.value; currentClassId = event.target.value; loadTeacherData(); });
$("#create-class-form").addEventListener("submit", createClass);
$("#student-create-form").addEventListener("submit", createStudent);
$("#create-demo-students").addEventListener("click", createDemoStudents);
$("#problem-create-form").addEventListener("submit", createProblem);
document.querySelectorAll("[data-teacher-tab]").forEach(button => button.addEventListener("click", () => activateTeacherTab(button.dataset.teacherTab)));
["#refresh-roster", "#refresh-problems", "#refresh-tutor", "#refresh-overview"].forEach(selector => $(selector).addEventListener("click", loadTeacherData));
updateLineNumbers();
initialize();
