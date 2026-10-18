const editor = document.querySelector("#code-editor");
const lineNumbers = document.querySelector("#line-numbers");
const output = document.querySelector("#output-content");
const outputState = document.querySelector("#output-state");
const tutorContent = document.querySelector("#tutor-content");
const runButton = document.querySelector("#run-code");
let pythonWorker;
let workerReady;
let pendingRun;
let currentError;
let currentStep = 0;

function updateLineNumbers() {
  const count = editor.value.split("\n").length;
  lineNumbers.innerHTML = Array.from({ length: count }, (_, index) => index + 1).join("<br>");
  lineNumbers.scrollTop = editor.scrollTop;
}

function setOutputState(text, kind = "") {
  outputState.textContent = text;
  outputState.className = `output-state ${kind}`;
}

function createTutorMessage({ step, label, title, description, button, loading = false }) {
  tutorContent.innerHTML = "";
  const card = document.createElement("div");
  card.className = "tutor-step";
  const counter = document.createElement("div");
  counter.className = "step-counter";
  counter.textContent = `HINT ${String(step).padStart(2, "0")} / 03`;
  const kind = document.createElement("span");
  kind.className = "step-kind";
  kind.textContent = label;
  const heading = document.createElement("h3");
  heading.textContent = title;
  const detail = document.createElement("p");
  detail.textContent = description;
  card.append(counter, kind, heading, detail);
  if (button) {
    const actions = document.createElement("div");
    actions.className = "step-actions";
    const next = document.createElement("button");
    next.className = "next-step";
    next.disabled = loading;
    next.textContent = loading ? "AI가 설명을 정리하고 있어요" : button;
    if (!loading) {
      const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      arrow.setAttribute("viewBox", "0 0 24 24");
      arrow.setAttribute("aria-hidden", "true");
      arrow.innerHTML = '<path d="M5 12h14m-6-6 6 6-6 6"/>';
      next.append(arrow);
      next.addEventListener("click", nextHint);
    }
    actions.append(next);
    card.append(actions);
  }
  tutorContent.append(card);
}

function classifyError(errorText) {
  const types = ["NameError", "TypeError", "SyntaxError", "IndentationError", "ZeroDivisionError", "IndexError", "KeyError", "ValueError", "ImportError", "ModuleNotFoundError"];
  const kind = types.find(type => errorText.includes(type)) || "실행 오류";
  const line = Number(errorText.match(/File "<exec>", line (\d+)/)?.[1]) || Number([...errorText.matchAll(/line (\d+)/g)].at(-1)?.[1]) || null;
  const descriptions = {
    NameError: "사용하려는 이름을 파이썬이 찾지 못했어요. 변수 이름이나 정의된 위치를 살펴보세요.",
    TypeError: "연산이나 함수에 서로 맞지 않는 종류의 값이 전달됐어요. 사용한 값의 자료형을 확인해 보세요.",
    SyntaxError: "파이썬 문장의 형태를 해석하지 못했어요. 괄호, 따옴표, 콜론과 철자를 살펴보세요.",
    IndentationError: "코드 블록의 들여쓰기가 맞지 않아요. 같은 블록의 줄이 같은 위치에서 시작하는지 확인해 보세요.",
    ZeroDivisionError: "0으로 나누려 했어요. 나누는 값이 0이 될 수 있는 경우를 확인해 보세요.",
    IndexError: "리스트에서 존재하지 않는 위치를 가져오려 했어요. 인덱스와 리스트 길이를 살펴보세요.",
    KeyError: "딕셔너리에서 찾을 수 없는 키를 사용했어요. 키의 철자와 실제 항목을 확인해 보세요.",
    ValueError: "값은 전달됐지만, 그 값의 형태로는 요청한 작업을 할 수 없어요. 입력값을 살펴보세요.",
    ImportError: "가져오려는 기능을 찾지 못했어요. import 문과 수업에서 사용할 수 있는 기능인지 확인해 보세요.",
    ModuleNotFoundError: "이 실행 환경에서 모듈을 찾지 못했어요. 수업에서 배운 문법만 사용했는지 살펴보세요."
  };
  return { kind, line, description: descriptions[kind] || "오류 메시지를 바탕으로 코드를 한 부분씩 다시 살펴보세요." };
}

function getPythonWorker() {
  if (pythonWorker && workerReady) return workerReady;
  pythonWorker = new Worker("python-worker.js");
  workerReady = new Promise((resolve, reject) => {
    const initTimer = setTimeout(() => reject(new Error("Python 실행 환경을 불러오지 못했어요.")), 45000);
    pythonWorker.onmessage = event => {
      const message = event.data;
      if (message.type === "ready") {
        clearTimeout(initTimer);
        resolve();
      } else if (message.type === "ready-error") {
        clearTimeout(initTimer);
        reject(new Error(message.message));
      } else if (message.type === "result" && pendingRun) {
        clearTimeout(pendingRun.timer);
        const { resolve: done } = pendingRun;
        pendingRun = null;
        done(message);
      }
    };
    pythonWorker.onerror = () => {
      clearTimeout(initTimer);
      reject(new Error("Python 실행 환경을 연결하지 못했어요."));
    };
  });
  return workerReady;
}

function executePython(code) {
  return getPythonWorker().then(() => new Promise((resolve, reject) => {
    pendingRun = {
      resolve,
      timer: setTimeout(() => {
        pythonWorker?.terminate();
        pythonWorker = null;
        workerReady = null;
        pendingRun = null;
        reject(new Error("실행 시간이 너무 길어요. 반복문을 확인한 뒤 다시 시도해 주세요."));
      }, 10000)
    };
    pythonWorker.postMessage({ type: "run", code });
  }));
}

async function runCode() {
  const code = editor.value.trim();
  if (!code) {
    editor.focus();
    return;
  }
  runButton.disabled = true;
  runButton.querySelector("span").textContent = "준비 중";
  setOutputState("Python 실행 환경 준비 중");
  output.className = "";
  output.textContent = "처음 실행할 때 Python 실행 도구를 불러옵니다. 잠시 기다려 주세요.";
  tutorContent.innerHTML = '<div class="tutor-empty"><div class="empty-glyph"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="4"/></svg></div><h3>코드를 살펴보고 있어요</h3><p>오류가 있으면 먼저 종류를 확인해 드릴게요.</p></div>';
  try {
    const result = await executePython(code);
    const resultText = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    if (result.error) {
      currentError = classifyError(result.error);
      currentError.raw = result.error;
      currentError.code = code;
      currentStep = 1;
      output.textContent = resultText ? `${resultText}\n\n${result.error}` : result.error;
      output.className = "has-error";
      setOutputState(currentError.kind, "error");
      createTutorMessage({ step: 1, label: "오류 종류", title: currentError.kind, description: currentError.description, button: "다음 힌트" });
    } else {
      currentError = null;
      output.textContent = resultText || "실행이 끝났어요. 출력된 내용은 없습니다.";
      output.className = "has-output";
      setOutputState("실행 완료", "success");
      tutorContent.innerHTML = '<div class="tutor-empty"><div class="empty-glyph"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></div><h3>오류 없이 실행됐어요</h3><p>출력 결과를 확인해 보세요.</p></div>';
    }
  } catch (error) {
    pythonWorker?.terminate();
    pythonWorker = null;
    workerReady = null;
    output.textContent = error.message;
    output.className = "has-error";
    setOutputState("실행 불가", "error");
    tutorContent.innerHTML = '<div class="tutor-empty"><h3>실행 환경을 연결하지 못했어요</h3><p>인터넷 연결을 확인한 뒤 다시 실행해 주세요.</p></div>';
  } finally {
    runButton.disabled = false;
    runButton.querySelector("span").textContent = "실행";
  }
}

async function nextHint() {
  if (!currentError) return;
  if (currentStep === 1) {
    currentStep = 2;
    const location = currentError.line ? `${currentError.line}행을 확인해 보세요.` : "실행 결과의 traceback에서 마지막으로 표시된 코드를 살펴보세요.";
    createTutorMessage({ step: 2, label: "오류 위치", title: "어느 줄부터 볼까요?", description: `${location}\n\n오류 메시지에 나온 이름이나 연산이 이 줄에서 어떻게 쓰였는지 직접 찾아보세요.`, button: "자세한 개념 힌트" });
    return;
  }
  if (currentStep === 2) {
    currentStep = 3;
    createTutorMessage({ step: 3, label: "배운 개념으로 설명", title: "개념을 연결하고 있어요", description: "코드를 고쳐 주는 대신, 오류 원인을 설명할게요.", loading: true });
    const button = tutorContent.querySelector(".next-step");
    try {
      const response = await fetch("/api/hints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: currentError.code, error: currentError.raw, errorType: currentError.kind, line: currentError.line, concepts: ["리스트", "for 반복문", "len()", "산술 연산"] })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI 힌트를 불러오지 못했어요.");
      createTutorMessage({ step: 3, label: "배운 개념으로 설명", title: "오류가 생긴 이유", description: data.hint, button: null });
    } catch (error) {
      createTutorMessage({ step: 3, label: "AI 연결", title: "자세한 힌트를 가져오지 못했어요", description: error.message, button: null });
    }
    return;
  }
}

editor.addEventListener("input", updateLineNumbers);
editor.addEventListener("scroll", () => { lineNumbers.scrollTop = editor.scrollTop; });
editor.addEventListener("keydown", event => {
  if (event.key === "Tab") {
    event.preventDefault();
    editor.setRangeText("    ", editor.selectionStart, editor.selectionEnd, "end");
    updateLineNumbers();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") runCode();
});
runButton.addEventListener("click", runCode);
document.querySelector("#clear-code").addEventListener("click", () => {
  editor.value = "";
  updateLineNumbers();
  editor.focus();
  output.textContent = "코드를 작성한 뒤 실행해 보세요.";
  output.className = "";
  setOutputState("실행 전");
  currentError = null;
  currentStep = 0;
  tutorContent.innerHTML = '<div class="tutor-empty"><div class="empty-glyph"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="4"/></svg></div><h3>막히면 같이 살펴봐요</h3><p>코드를 실행하면 오류부터 함께 확인해요.</p></div>';
});
document.querySelector("#scope-button").addEventListener("click", event => {
  const button = event.currentTarget;
  const open = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!open));
  document.querySelector("#scope-popover").hidden = open;
});
updateLineNumbers();
