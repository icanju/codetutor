importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js");

let runtime;

loadPyodide().then(pyodide => {
  runtime = pyodide;
  self.postMessage({ type: "ready" });
}).catch(error => {
  self.postMessage({ type: "ready-error", message: error.message });
});

self.onmessage = async event => {
  if (event.data.type !== "run" || !runtime) return;
  const stdout = [];
  const stderr = [];
  runtime.setStdout({ batched: text => stdout.push(text) });
  runtime.setStderr({ batched: text => stderr.push(text) });
  try {
    await runtime.runPythonAsync(event.data.code);
    self.postMessage({ type: "result", stdout: stdout.join("\n"), stderr: stderr.join("\n"), error: null });
  } catch (error) {
    self.postMessage({ type: "result", stdout: stdout.join("\n"), stderr: stderr.join("\n"), error: error.message });
  }
};
