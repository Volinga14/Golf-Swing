export function downloadJson(filename, data) {
  downloadBlob(filename, JSON.stringify(data, null, 2), "application/json");
}

export function downloadCsv(filename, metrics) {
  const rows = Object.entries(metrics).map(([key, value]) => [key, value == null ? "" : value]);
  const csv = [["metric", "value"], ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  downloadBlob(filename, csv, "text/csv;charset=utf-8");
}

export function downloadPng(filename, video, overlayCanvas) {
  const canvas = document.createElement("canvas");
  const width = overlayCanvas.canvas.width || 1280;
  const height = overlayCanvas.canvas.height || 720;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  overlayCanvas.render(ctx, { width, height }, true);
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(filename, blob, "image/png");
  }, "image/png");
}

function downloadBlob(filename, body, type) {
  const blob = body instanceof Blob ? body : new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
