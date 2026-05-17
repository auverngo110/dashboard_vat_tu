const ALL_TYPES_KEY = "__all__";
const KQ_PRESET_FILES = ["data/kq-thau/KQ thầu 2-25.csv"];

const zoomState = {
  chart: null
};
const baseColors = [
  "#0f766e", "#0b6e99", "#b45309", "#b84b5f", "#2855a6",
  "#0d9488", "#a16207", "#1d4ed8", "#e76f51", "#4d908e",
  "#6d28d9", "#ca8a04", "#2f6a4f", "#9a3412"
];

function normalizeText(value) {
  return (value || "").toString().replace(/\s+/g, " ").trim();
}

function parseNumber(value) {
  if (value == null) {
    return 0;
  }

  let text = normalizeText(value);
  if (!text) {
    return 0;
  }

  text = text.replace(/\u00A0/g, "");
  text = text.replace(/\s/g, "");
  text = text.replace(/%/g, "");
  text = text.replace(/[^\d,.-]/g, "");

  if (text.includes(",") && text.includes(".")) {
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
      text = text.replace(/\./g, "").replace(/,/g, ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (text.includes(",")) {
    const chunks = text.split(",");
    if (chunks.length === 2 && chunks[1].length <= 2) {
      text = text.replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if ((text.match(/\./g) || []).length > 1) {
    text = text.replace(/\./g, "");
  }

  const result = Number(text);
  return Number.isFinite(result) ? result : 0;
}

function colorAt(index, alpha) {
  const hex = baseColors[index % baseColors.length].replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
}

function formatInt(value) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value || 0);
}

function formatMoney(value) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(value || 0);
}

/** KPI / summary: short scale (tr, tỷ) when amount is large */
function formatLargeVnd(value) {
  const number = Number(value) || 0;
  const abs = Math.abs(number);

  if (abs >= 1000000000) {
    const x = number / 1000000000;
    const mx = Math.abs(x);
    const frac = mx >= 100 ? 0 : mx >= 10 ? 1 : 2;
    return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: frac }).format(x) + " tỷ";
  }
  if (abs >= 1000000) {
    const x = number / 1000000;
    const mx = Math.abs(x);
    const frac = mx >= 100 ? 0 : mx >= 10 ? 1 : 2;
    return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: frac }).format(x) + " tr";
  }
  return formatMoney(number);
}

function axisTitle(text) {
  return {
    display: true,
    text,
    font: { weight: "bold" }
  };
}

function formatCompactMoney(value) {
  const number = Number(value) || 0;
  const abs = Math.abs(number);

  if (abs >= 1000000000) {
    return (number / 1000000000).toFixed(1) + " tỷ";
  }
  if (abs >= 1000000) {
    return (number / 1000000).toFixed(0) + " tr";
  }
  return formatInt(number);
}

function compactAxisLabel(label, maxLength = 14) {
  const text = normalizeText(label);
  if (text.length <= maxLength) {
    return text;
  }

  const words = text.split(" ").filter(Boolean);
  if (words.length >= 3) {
    const acronym = words.map(word => word[0]).join("").toUpperCase();
    if (acronym.length <= maxLength) {
      return acronym;
    }
  }

  return text.slice(0, maxLength - 1) + "...";
}

function presetBasename(filePath) {
  const name = normalizeText(filePath);
  const parts = name.split("/");
  return parts[parts.length - 1] || name;
}
function deepClonePreserveFunctions(value) {
  if (Array.isArray(value)) {
    return value.map(item => deepClonePreserveFunctions(item));
  }

  if (value && typeof value === "object") {
    const clone = {};
    for (const [key, val] of Object.entries(value)) {
      clone[key] = deepClonePreserveFunctions(val);
    }
    return clone;
  }

  return value;
}

function closeZoomModal() {
  const modal = document.getElementById("chartZoomModal");
  const body = document.getElementById("chartZoomBody");

  if (zoomState.chart) {
    zoomState.chart.destroy();
    zoomState.chart = null;
  }

  body.innerHTML = "";
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function openZoomModal(targetId, kind, titleText) {
  const modal = document.getElementById("chartZoomModal");
  const title = document.getElementById("chartZoomTitle");
  const body = document.getElementById("chartZoomBody");

  closeZoomModal();
  title.textContent = titleText || "Phóng to biểu đồ";
  body.innerHTML = "";

  if (kind === "heatmap") {
    const source = document.getElementById(targetId);
    if (!source) {
      return;
    }
    const clone = source.cloneNode(true);
    clone.removeAttribute("id");
    clone.style.height = "100%";
    body.appendChild(clone);
  } else {
    const sourceCanvas = document.getElementById(targetId);
    const sourceChart = sourceCanvas ? Chart.getChart(sourceCanvas) : null;
    if (!sourceChart) {
      return;
    }

    const canvas = document.createElement("canvas");
    body.appendChild(canvas);
    const configSource = sourceChart.config && sourceChart.config._config
      ? sourceChart.config._config
      : sourceChart.config;
    const configClone = deepClonePreserveFunctions(configSource);
    configClone.options = configClone.options || {};
    configClone.options.maintainAspectRatio = false;
    zoomState.chart = new Chart(canvas, configClone);
  }

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function setupZoomButtons() {
  const buttons = document.querySelectorAll(".chart-zoom-btn");
  buttons.forEach(button => {
    button.addEventListener("click", () => {
      const targetId = button.getAttribute("data-target");
      const kind = button.getAttribute("data-kind") || "canvas";
      const card = button.closest(".chart-card");
      const title = card ? (card.querySelector("h3") || {}).textContent : "Phóng to biểu đồ";
      openZoomModal(targetId, kind, title || "Phóng to biểu đồ");
    });
  });

  document.getElementById("chartZoomClose").addEventListener("click", closeZoomModal);
  document.getElementById("chartZoomBackdrop").addEventListener("click", closeZoomModal);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeZoomModal();
    }
  });
}
async function loadCsvFromCurrentFolder(sourceUrl) {
  const response = await fetch(sourceUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Không thể tải " + sourceUrl + " (HTTP " + response.status + ")");
  }
  return response.text();
}
const ktChartRefs = [];
const kqState = {
  allRows: [],
  selectedNhom: ALL_TYPES_KEY,
  selectedDataUrl: "",
  sourceLabel: ""
};

function destroyKqCharts() {
  while (ktChartRefs.length) {
    ktChartRefs.pop().destroy();
  }
}

function createChartKq(canvasId, chartConfig) {
  const chart = new Chart(document.getElementById(canvasId), chartConfig);
  ktChartRefs.push(chart);
}

function setKqStatus(message, isError) {
  const node = document.getElementById("kqStatusText");
  node.textContent = message;
  node.style.color = isError ? "#a0142f" : "#576175";
}

function kqRowField(row, ...names) {
  const want = names.map(nameValue => normalizeText(nameValue).toLowerCase());
  for (const key of Object.keys(row)) {
    if (want.includes(normalizeText(key).toLowerCase())) {
      return row[key];
    }
  }
  return "";
}

function parseKqCsv(csvText) {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: header => normalizeText(header)
  });

  if (parsed.errors.length) {
    console.warn("KQ CSV warnings:", parsed.errors.slice(0, 5));
  }

  const rows = [];

  parsed.data.forEach(raw => {
    const code = normalizeText(kqRowField(raw, "Mã"));
    if (!code) {
      return;
    }

    const donGia = parseNumber(kqRowField(raw, "Đơn giá bộ"));
    const slThau = parseNumber(kqRowField(raw, "SL thầu"));
    const sl2025 = parseNumber(kqRowField(raw, "2025"));
    const slTruoc = parseNumber(kqRowField(raw, "SL thầu năm trước"));
    const pctThau = parseNumber(kqRowField(raw, "% thầu 2025"));
    const tongRaw = parseNumber(kqRowField(raw, "Tổng"));

    let usageValue = donGia * sl2025;
    if (tongRaw >= 100000) {
      usageValue = tongRaw;
    }

    rows.push({
      code,
      nhom: normalizeText(kqRowField(raw, "Nhóm")) || "Khác",
      ten: normalizeText(kqRowField(raw, "Tên")) || code,
      donGia,
      congTy: normalizeText(kqRowField(raw, "Công ty")) || "Chưa rõ",
      hang: normalizeText(kqRowField(raw, "Hãng")) || "Chưa rõ",
      pctThau,
      slThau,
      sl2025,
      slTruoc,
      tongRaw,
      usageValue,
      tenderValue: donGia * slThau
    });
  });

  return rows;
}

function populateKqNhomFilter(rows) {
  const select = document.getElementById("kqNhomFilter");
  const previous = kqState.selectedNhom;
  const setNhom = new Set();

  rows.forEach(row => {
    if (row.nhom) {
      setNhom.add(row.nhom);
    }
  });

  const ordered = Array.from(setNhom).sort((a, b) => a.localeCompare(b, "vi"));

  select.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = ALL_TYPES_KEY;
  allOption.textContent = "Tất cả (" + formatInt(rows.length) + ")";
  select.appendChild(allOption);

  ordered.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name.length > 70 ? name.slice(0, 69) + "…" : name;
    option.title = name;
    select.appendChild(option);
  });

  if (ordered.includes(previous)) {
    select.value = previous;
    kqState.selectedNhom = previous;
  } else {
    select.value = ALL_TYPES_KEY;
    kqState.selectedNhom = ALL_TYPES_KEY;
  }
}

function getActiveKqRows() {
  if (kqState.selectedNhom === ALL_TYPES_KEY) {
    return kqState.allRows;
  }
  return kqState.allRows.filter(row => row.nhom === kqState.selectedNhom);
}

function updateKqKpi(rows) {
  let sumSlThau = 0;
  let sumTenderMoney = 0;
  let sumValue = 0;

  rows.forEach(row => {
    sumSlThau += row.slThau;
    sumTenderMoney += row.tenderValue;
    sumValue += row.usageValue;
  });

  const vtTrungThau = rows.length;
  const vtKhongSuDung = rows.filter(
    row => (row.sl2025 || 0) <= 0 && (row.usageValue || 0) <= 0
  ).length;
  document.getElementById("kqKpiRows").textContent =
    formatInt(vtKhongSuDung) + " / " + formatInt(vtTrungThau);
  document.getElementById("kqKpiSlThau").textContent = formatInt(sumSlThau);
  document.getElementById("kqKpiTenderMoney").textContent = formatLargeVnd(sumTenderMoney);
  document.getElementById("kqKpiValue").textContent = formatLargeVnd(sumValue);
}

const KQ_CHART_DETAIL_IDS = [
  "kqChart1Detail",
  "kqChart2Detail",
  "kqChart3Detail",
  "kqChart4Detail",
  "kqChart5Detail",
  "kqChart6Detail"
];

function clearKqChartDetails() {
  KQ_CHART_DETAIL_IDS.forEach(id => {
    const node = document.getElementById(id);
    if (node) {
      node.textContent = "";
    }
  });
}

function companiesJoinedForHang(rows, hangName) {
  if (!hangName) {
    return "Chưa rõ";
  }
  const names = new Set();
  rows.forEach(row => {
    if (row.hang === hangName && row.congTy) {
      names.add(row.congTy);
    }
  });
  const list = Array.from(names);
  return list.length ? list.join(" · ") : "Chưa rõ";
}

function fillKqChartDetail(elementId, hang, congTy) {
  const el = document.getElementById(elementId);
  if (!el) {
    return;
  }
  if (arguments.length === 1) {
    el.textContent = "";
    return;
  }
  const h = hang ? String(hang).trim() : "";
  const c = congTy ? String(congTy).trim() : "";
  if (!h && !c) {
    el.textContent = "";
    return;
  }
  el.textContent = "Hãng: " + (h || "Chưa rõ") + "\nCông ty: " + (c || "Chưa rõ");
}

/** Scatter/bubble: click → detail panel Hãng / Công ty (raw point must carry hang, congTy). */
function kqPointChartClickHandler(detailId) {
  return function (event, elements, chart) {
    if (!elements.length) {
      fillKqChartDetail(detailId);
      return;
    }
    const { datasetIndex, index } = elements[0];
    const pt = chart.data.datasets[datasetIndex]?.data[index];
    if (!pt || typeof pt !== "object") {
      fillKqChartDetail(detailId);
      return;
    }
    fillKqChartDetail(detailId, pt.hang, pt.congTy);
  };
}

function kqAggregateByHang(rows) {
  const map = new Map();

  rows.forEach(row => {
    const key = row.hang || "Chưa rõ";
    if (!map.has(key)) {
      map.set(key, { hang: key, sl2025: 0, usageValue: 0 });
    }
    const bucket = map.get(key);
    bucket.sl2025 += row.sl2025;
    bucket.usageValue += row.usageValue;
  });

  return Array.from(map.values()).sort((a, b) => b.usageValue - a.usageValue);
}

/** Map money amounts to bubble radius (px); log-scaled so different totals read visibly. */
function bubbleRadiiFromAmounts(amounts, rMin = 6, rMax = 26) {
  if (!amounts.length) {
    return [];
  }

  const vals = amounts.map(a => Math.max(Number(a) || 0, 1));
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);

  if (maxV <= minV * 1.0001) {
    const mid = (rMin + rMax) / 2;
    return vals.map(() => mid);
  }

  const logMin = Math.log10(minV);
  const logMax = Math.log10(maxV);
  const denom = Math.max(logMax - logMin, 1e-9);

  return vals.map(v => {
    const t = (Math.log10(v) - logMin) / denom;
    const clamped = Math.min(1, Math.max(0, t));
    return rMin + clamped * (rMax - rMin);
  });
}

function kqRenderChart1(rows) {
  const candidates = rows.filter(row => row.sl2025 > 0 && row.donGia > 0);
  const radii = bubbleRadiiFromAmounts(candidates.map(row => row.usageValue));

  const grouped = new Map();

  candidates.forEach((row, index) => {
    if (!grouped.has(row.nhom)) {
      grouped.set(row.nhom, []);
    }

    grouped.get(row.nhom).push({
      x: row.donGia,
      y: row.sl2025,
      r: radii[index],
      label: row.code + " · " + row.ten,
      usageValue: row.usageValue,
      nhom: row.nhom,
      hang: row.hang,
      congTy: row.congTy
    });
  });

  const datasets = Array.from(grouped.entries()).map(([groupName, points], index) => ({
    label: compactAxisLabel(groupName, 42),
    data: points,
    backgroundColor: colorAt(index, 0.5),
    borderColor: colorAt(index, 0.96),
    borderWidth: 1.2
  }));

  createChartKq("kqChart1", {
    type: "bubble",
    data: { datasets },
    options: {
      maintainAspectRatio: false,
      onClick: kqPointChartClickHandler("kqChart1Detail"),
      plugins: {
        legend: { position: "bottom", labels: { font: { weight: "normal" } } },
        tooltip: {
          callbacks: {
            title: context => context[0].raw.label,
            label: context => {
              const point = context.raw;
              return [
                " Nhóm: " + compactAxisLabel(point.nhom, 80),
                " Đơn giá: " + formatMoney(point.x),
                " Số lượng sử dụng: " + formatInt(point.y),
                " Tổng tiền: " + formatMoney(point.usageValue),
                " Hãng: " + (point.hang || "Chưa rõ"),
                " Công ty: " + (point.congTy || "Chưa rõ")
              ];
            }
          }
        }
      },
      scales: {
        x: {
          title: axisTitle("Đơn giá"),
          ticks: { callback: value => (Number(value) / 1000000).toFixed(0) + " tr" },
          grid: { color: "rgba(56, 73, 97, 0.13)" }
        },
        y: {
          title: axisTitle("Số lượng sử dụng"),
          ticks: { callback: value => formatInt(value) },
          grid: { color: "rgba(56, 73, 97, 0.13)" }
        }
      }
    }
  });
}

function kqRenderChart2(rows) {
  const points = rows
    .filter(row => row.tenderValue > 0 && row.donGia > 0)
    .map(row => ({
      x: row.donGia,
      y: row.tenderValue,
      label: row.code + " · " + row.ten,
      slThau: row.slThau,
      hang: row.hang,
      congTy: row.congTy
    }));

  createChartKq("kqChart2", {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Mặt hàng",
          data: points,
          backgroundColor: colorAt(3, 0.55),
          borderColor: colorAt(3, 0.95),
          borderWidth: 1.2,
          pointRadius: 5,
          pointHoverRadius: 7
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      onClick: kqPointChartClickHandler("kqChart2Detail"),
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => (items[0] && items[0].raw ? items[0].raw.label : ""),
            label: item => {
              const raw = item.raw;
              return [
                " Đơn giá: " + formatMoney(raw.x),
                " Tổng thầu: " + formatMoney(raw.y),
                " SL thầu: " + formatInt(raw.slThau),
                " Hãng: " + (raw.hang || "Chưa rõ"),
                " Công ty: " + (raw.congTy || "Chưa rõ")
              ];
            }
          }
        }
      },
      scales: {
        x: {
          title: axisTitle("Đơn giá"),
          ticks: { callback: value => (Number(value) / 1000000).toFixed(0) + " tr" },
          grid: { color: "rgba(56, 73, 97, 0.13)" }
        },
        y: {
          title: axisTitle("Tổng thầu (đơn giá × SL thầu)"),
          ticks: { callback: value => formatCompactMoney(value) },
          grid: { color: "rgba(56, 73, 97, 0.13)" }
        }
      }
    }
  });
}

function kqRenderChart3(rows) {
  const grouped = new Map();

  rows.forEach(row => {
    if (row.donGia <= 0) {
      return;
    }

    if (!grouped.has(row.nhom)) {
      grouped.set(row.nhom, []);
    }

    grouped.get(row.nhom).push({
      x: row.donGia,
      y: row.slThau,
      label: row.code + " · " + row.ten,
      tenderValue: row.tenderValue,
      hang: row.hang,
      congTy: row.congTy
    });
  });

  const datasets = Array.from(grouped.entries()).map(([groupName, points], index) => ({
    label: compactAxisLabel(groupName, 42),
    data: points,
    backgroundColor: colorAt(index, 0.52),
    borderColor: colorAt(index, 0.94),
    borderWidth: 1.2,
    pointRadius: 5,
    pointHoverRadius: 7
  }));

  createChartKq("kqChart3", {
    type: "scatter",
    data: { datasets },
    options: {
      maintainAspectRatio: false,
      onClick: kqPointChartClickHandler("kqChart3Detail"),
      plugins: {
        legend: { position: "bottom", labels: { font: { weight: "normal" } } },
        tooltip: {
          callbacks: {
            title: items => (items[0] && items[0].raw ? items[0].raw.label : ""),
            label: item => {
              const raw = item.raw;
              return [
                " Đơn giá: " + formatMoney(raw.x),
                " SL thầu: " + formatInt(raw.y),
                " Tổng thầu: " + formatMoney(raw.tenderValue),
                " Hãng: " + (raw.hang || "Chưa rõ"),
                " Công ty: " + (raw.congTy || "Chưa rõ")
              ];
            }
          }
        }
      },
      scales: {
        x: {
          title: axisTitle("Đơn giá"),
          ticks: { callback: value => (Number(value) / 1000000).toFixed(0) + " tr" },
          grid: { color: "rgba(56, 73, 97, 0.13)" }
        },
        y: {
          title: axisTitle("Số lượng thầu (SL thầu)"),
          ticks: { callback: value => formatInt(value) },
          grid: { color: "rgba(56, 73, 97, 0.13)" }
        }
      }
    }
  });
}

function kqRenderChart4(rows) {
  const sorted = [...rows].sort(
    (a, b) => Math.max(b.slThau, b.slTruoc) - Math.max(a.slThau, a.slTruoc)
  );
  const view = sorted.slice(0, 14);

  createChartKq("kqChart4", {
    type: "bar",
    data: {
      labels: view.map(row => row.code),
      datasets: [
        {
          label: "SL thầu năm trước",
          data: view.map(row => row.slTruoc),
          backgroundColor: colorAt(5, 0.72),
          borderRadius: 5
        },
        {
          label: "SL thầu hiện tại",
          data: view.map(row => row.slThau),
          backgroundColor: colorAt(2, 0.76),
          borderRadius: 5
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      onClick(event, elements) {
        if (!elements.length) {
          fillKqChartDetail("kqChart4Detail");
          return;
        }
        const row = view[elements[0].index];
        fillKqChartDetail("kqChart4Detail", row ? row.hang : "", row ? row.congTy : "");
      },
      plugins: {
        legend: { position: "bottom", labels: { font: { weight: "normal" } } },
        tooltip: {
          callbacks: {
            afterTitle: items => {
              const row = view[items[0].dataIndex];
              return row ? row.ten : "";
            },
            afterBody: items => {
              const row = view[items[0].dataIndex];
              if (!row) {
                return [];
              }
              return [" Hãng: " + (row.hang || "Chưa rõ"), " Công ty: " + (row.congTy || "Chưa rõ")];
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { maxRotation: 45, minRotation: 0 }
        },
        y: {
          title: axisTitle("Số lượng thầu"),
          ticks: { callback: value => formatInt(value) },
          grid: { color: "rgba(56, 73, 97, 0.13)" }
        }
      }
    }
  });
}

function kqRenderChart5(rows) {
  const brands = kqAggregateByHang(rows).slice(0, 10);

  createChartKq("kqChart5", {
    type: "bar",
    data: {
      labels: brands.map(entry => compactAxisLabel(entry.hang, 16)),
      datasets: [
        {
          label: "Số lượng sử dụng",
          data: brands.map(entry => entry.sl2025),
          yAxisID: "yQty",
          backgroundColor: colorAt(1, 0.78),
          borderRadius: 6
        },
        {
          label: "Thành tiền sử dụng",
          data: brands.map(entry => entry.usageValue),
          type: "line",
          yAxisID: "yValue",
          borderColor: colorAt(4, 0.95),
          backgroundColor: colorAt(4, 0.22),
          borderWidth: 2.4,
          tension: 0.26,
          pointRadius: 2.8
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      onClick(event, elements) {
        if (!elements.length) {
          fillKqChartDetail("kqChart5Detail");
          return;
        }
        const idx = elements[0].index;
        const entry = brands[idx];
        fillKqChartDetail(
          "kqChart5Detail",
          entry && entry.hang,
          entry ? companiesJoinedForHang(rows, entry.hang) : ""
        );
      },
      plugins: {
        legend: { position: "bottom", labels: { font: { weight: "normal" } } },
        tooltip: {
          callbacks: {
            title: items => {
              const idx = items[0].dataIndex;
              return brands[idx] && brands[idx].hang ? brands[idx].hang : "";
            },
            label: context => {
              if (context.dataset.yAxisID === "yValue") {
                return " Thành tiền: " + formatMoney(context.parsed.y);
              }
              return " Số lượng: " + formatInt(context.parsed.y);
            },
            footer: items => {
              const idx = items[0].dataIndex;
              const hang = brands[idx] && brands[idx].hang;
              if (!hang) {
                return "";
              }
              return " Công ty: " + companiesJoinedForHang(rows, hang);
            }
          }
        }
      },
      scales: {
        x: {
          title: axisTitle("Hãng"),
          ticks: {
            callback: (_, index) => compactAxisLabel(brands[index] ? brands[index].hang : "", 14)
          }
        },
        yQty: {
          type: "linear",
          position: "left",
          ticks: { callback: value => formatInt(value) },
          grid: { color: "rgba(56, 73, 97, 0.13)" },
          title: axisTitle("Số lượng")
        },
        yValue: {
          type: "linear",
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: { callback: value => formatCompactMoney(value) },
          title: axisTitle("Thành tiền")
        }
      }
    }
  });
}

function kqRenderChart6(rows) {
  const sorted = [...rows].filter(row => row.usageValue > 0 || row.sl2025 > 0);
  sorted.sort((a, b) => b.usageValue - a.usageValue);
  const view = sorted.slice(0, 16);

  createChartKq("kqChart6", {
    type: "bar",
    data: {
      labels: view.map(row => compactAxisLabel(row.code, 24)),
      datasets: [
        {
          label: "Số lượng sử dụng",
          data: view.map(row => row.sl2025),
          xAxisID: "xQty",
          backgroundColor: colorAt(6, 0.76),
          borderRadius: 5
        },
        {
          label: "Thành tiền sử dụng",
          data: view.map(row => row.usageValue),
          xAxisID: "xMoney",
          backgroundColor: colorAt(0, 0.55),
          borderRadius: 5
        }
      ]
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      onClick(event, elements) {
        if (!elements.length) {
          fillKqChartDetail("kqChart6Detail");
          return;
        }
        const row = view[elements[0].index];
        fillKqChartDetail("kqChart6Detail", row ? row.hang : "", row ? row.congTy : "");
      },
      plugins: {
        legend: { position: "bottom", labels: { font: { weight: "normal" } } },
        tooltip: {
          callbacks: {
            title: items => {
              const row = view[items[0].dataIndex];
              return row ? row.ten : "";
            },
            label: ctx => {
              if (ctx.dataset.xAxisID === "xMoney") {
                return " Thành tiền: " + formatMoney(ctx.parsed.x);
              }
              return " SL (2025): " + formatInt(ctx.parsed.x);
            },
            afterBody: items => {
              const row = view[items[0].dataIndex];
              if (!row) {
                return [];
              }
              return [" Hãng: " + (row.hang || "Chưa rõ"), " Công ty: " + (row.congTy || "Chưa rõ")];
            }
          }
        }
      },
      scales: {
        y: {
          ticks: {
            autoSkip: false,
            font: { size: 10 }
          }
        },
        xQty: {
          type: "linear",
          position: "bottom",
          title: axisTitle("Số lượng"),
          ticks: { callback: value => formatInt(value) },
          grid: { color: "rgba(56, 73, 97, 0.13)" }
        },
        xMoney: {
          type: "linear",
          position: "top",
          grid: { drawOnChartArea: false },
          title: axisTitle("Thành tiền (VNĐ)"),
          ticks: { callback: value => formatCompactMoney(value) }
        }
      }
    }
  });
}

function renderKqDashboard() {
  const rows = getActiveKqRows();
  closeZoomModal();
  destroyKqCharts();
  clearKqChartDetails();
  updateKqKpi(rows);

  kqRenderChart1(rows);
  kqRenderChart2(rows);
  kqRenderChart3(rows);
  kqRenderChart4(rows);
  kqRenderChart5(rows);
  kqRenderChart6(rows);

  const nhLabel = kqState.selectedNhom === ALL_TYPES_KEY ? "Tất cả nhóm" : compactAxisLabel(kqState.selectedNhom, 48);
  setKqStatus(
    "Nguồn: " + presetBasename(kqState.sourceLabel) + " | " + nhLabel + " | " + formatInt(rows.length) + " dòng.",
    false
  );
}

async function applyKqCsvText(csvText, sourceLabel) {
  const rows = parseKqCsv(csvText);
  if (!rows.length) {
    throw new Error("Không đọc được dòng dữ liệu KQ thầu (thiếu cột hoặc không có mã vật tư).");
  }

  kqState.allRows = rows;
  kqState.sourceLabel = sourceLabel;
  populateKqNhomFilter(rows);
  renderKqDashboard();
}

function populateKqPresetSelect() {
  const select = document.getElementById("kqPresetSelect");
  select.innerHTML = "";

  KQ_PRESET_FILES.forEach(path => {
    const option = document.createElement("option");
    option.value = path;
    option.textContent = presetBasename(path);
    select.appendChild(option);
  });

  const preferred = kqState.selectedDataUrl && KQ_PRESET_FILES.includes(kqState.selectedDataUrl)
    ? kqState.selectedDataUrl
    : KQ_PRESET_FILES[0];
  select.value = preferred;
  kqState.selectedDataUrl = preferred;
}

async function initKq() {
  populateKqPresetSelect();
  try {
    const sourceUrl = kqState.selectedDataUrl || KQ_PRESET_FILES[0];
    setKqStatus("Đang tải " + presetBasename(sourceUrl) + "...", false);
    const csvText = await loadCsvFromCurrentFolder(sourceUrl);
    await applyKqCsvText(csvText, sourceUrl);
  } catch (error) {
    console.error(error);
    setKqStatus("Không đọc được dữ liệu KQ thầu: " + error.message, true);
  }
}

document.getElementById("kqReloadBtn").addEventListener("click", () => {
  initKq();
});

document.getElementById("kqPresetSelect").addEventListener("change", async event => {
  kqState.selectedDataUrl = event.target.value;
  await initKq();
});

document.getElementById("kqNhomFilter").addEventListener("change", event => {
  kqState.selectedNhom = event.target.value;
  renderKqDashboard();
});

document.getElementById("kqFileInput").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  try {
    setKqStatus("Đang đọc file " + file.name + " ...", false);
    const csvText = await file.text();
    await applyKqCsvText(csvText, file.name);
  } catch (error) {
    console.error(error);
    setKqStatus("Đọc file CSV thất bại: " + error.message, true);
  }
});

setupZoomButtons();
initKq();
