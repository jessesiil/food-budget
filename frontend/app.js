// Phase 0 frontend: just two buttons that call the backend.

document.getElementById("backend-url-display").textContent = BACKEND_URL;

async function callBackend(path, resultElementId) {
  const el = document.getElementById(resultElementId);
  el.textContent = "Loading...";
  const start = performance.now();
  try {
    const response = await fetch(`${BACKEND_URL}${path}`);
    const elapsed = Math.round(performance.now() - start);
    if (!response.ok) {
      const text = await response.text();
      el.textContent = `HTTP ${response.status} after ${elapsed} ms\n\n${text}`;
      return;
    }
    const data = await response.json();
    el.textContent = `OK in ${elapsed} ms\n\n${JSON.stringify(data, null, 2)}`;
  } catch (err) {
    const elapsed = Math.round(performance.now() - start);
    el.textContent = `Error after ${elapsed} ms: ${err.message}`;
  }
}

document
  .getElementById("test-backend")
  .addEventListener("click", () => callBackend("/api/hello", "backend-result"));

document
  .getElementById("test-db")
  .addEventListener("click", () => callBackend("/api/test-db", "db-result"));
