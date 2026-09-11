// 상담 접수 관리 - 사내 서버용 백엔드
// Express + JSON 파일 저장(별도 DB 설치 불필요). 소규모 내부 도구 용도로
// 동시 요청이 많지 않다는 전제 하에, 파일 읽기/쓰기를 동기(sync)로 처리해
// 경쟁 조건(race condition) 없이 단순하게 구현했습니다.

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const INTAKES_FILE = path.join(DATA_DIR, "intakes.json");
const STAFF_FILE = path.join(DATA_DIR, "staff.json");

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(INTAKES_FILE)) fs.writeFileSync(INTAKES_FILE, "[]", "utf8");
  if (!fs.existsSync(STAFF_FILE)) {
    fs.writeFileSync(STAFF_FILE, JSON.stringify({ names: ["근무자1", "근무자2", "근무자3"] }, null, 2), "utf8");
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return fallback;
  }
}

function writeJson(file, data) {
  // 임시 파일에 먼저 쓰고 이름을 바꿔치기해, 쓰는 도중 서버가 죽어도
  // 원본 파일이 깨지지 않도록 합니다.
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

ensureDataFiles();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------- 상담 접수 (intakes) ----------

app.get("/api/intakes", (req, res) => {
  res.json(readJson(INTAKES_FILE, []));
});

app.post("/api/intakes", (req, res) => {
  const body = req.body || {};
  if (!body.name || !String(body.name).trim()) {
    return res.status(400).json({ error: "invalid_argument", message: "이름은 필수입니다." });
  }
  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    name: String(body.name).trim(),
    phone: String(body.phone || "").trim(),
    intakeDate: body.intakeDate || now.slice(0, 10),
    type: body.type || "",
    summary: body.summary || "",
    assignee: body.assignee || "",
    status: body.status || "대기",
    followUpType: body.followUpType || "없음",
    followUpDate: body.followUpDate || "",
    followUpTime: body.followUpTime || "",
    followUpNote: body.followUpNote || "",
    createdAt: now,
    updatedAt: now,
  };
  const list = readJson(INTAKES_FILE, []);
  list.push(record);
  writeJson(INTAKES_FILE, list);
  res.status(201).json(record);
});

app.patch("/api/intakes/:id", (req, res) => {
  const list = readJson(INTAKES_FILE, []);
  const idx = list.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "not_found" });
  list[idx] = { ...list[idx], ...req.body, id: list[idx].id, updatedAt: new Date().toISOString() };
  writeJson(INTAKES_FILE, list);
  res.json(list[idx]);
});

app.delete("/api/intakes/:id", (req, res) => {
  const list = readJson(INTAKES_FILE, []);
  const next = list.filter((r) => r.id !== req.params.id);
  if (next.length === list.length) return res.status(404).json({ error: "not_found" });
  writeJson(INTAKES_FILE, next);
  res.status(204).end();
});

// ---------- 담당자 목록 (staff) ----------

app.get("/api/staff", (req, res) => {
  res.json(readJson(STAFF_FILE, { names: [] }));
});

app.put("/api/staff", (req, res) => {
  const names = req.body && Array.isArray(req.body.names) ? req.body.names.filter((n) => typeof n === "string" && n.trim()) : null;
  if (!names) return res.status(400).json({ error: "invalid_argument", message: "names 배열이 필요합니다." });
  const saved = { names, updatedAt: new Date().toISOString() };
  writeJson(STAFF_FILE, saved);
  res.json(saved);
});

app.listen(PORT, () => {
  console.log(`상담 접수 관리 서버 실행 중: http://localhost:${PORT}`);
  console.log(`데이터 저장 위치: ${DATA_DIR}`);
});
