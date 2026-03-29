import { useState, useEffect, useMemo } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, update, set, push } from "firebase/database";

// ── Firebase setup ─────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCieVjrHHWQjBd7a-XYsAEbAOEqnu6n83g",
  authDomain: "mcm-schedule-4d8a6.firebaseapp.com",
  databaseURL: "https://mcm-schedule-4d8a6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mcm-schedule-4d8a6",
  storageBucket: "mcm-schedule-4d8a6.firebasestorage.app",
  messagingSenderId: "371496181519",
  appId: "1:371496181519:web:3fb50dc8dd8b35ce48a87a",
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

// ── Constants ─────────────────────────────────────────────────────────────────

// CS rotation order — Wilson (tech) is fixed, never rotates
const CS_PRIORITY_ORDER = ["Gabi", "Vanessa", "Jonathan"];
const WORK_SHIFTS       = new Set(["9-18", "13-22"]);

// schedulable:true → appears in every day cell; false → special/on-demand only
const MEMBERS = [
  { id: "Summer",   team: "客服組", schedulable: false },
  { id: "Gabi",     team: "客服組", schedulable: true  },
  { id: "Vanessa",  team: "客服組", schedulable: true  },
  { id: "Jonathan", team: "客服組", schedulable: true  },
  { id: "Wilson",   team: "技術組", schedulable: true  },
];

const SHIFT_STYLES = {
  "9-18":  { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE", label: "09–18", fullLabel: "Morning (09:00–18:00)" },
  "13-22": { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE", label: "13–22", fullLabel: "Evening (13:00–22:00)" },
  "例":    { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A", label: "例",    fullLabel: "例假 (Statutory Off)" },
  "休":    { bg: "#FFF1F2", text: "#BE123C", border: "#FECDD3", label: "休",    fullLabel: "休假 (Rest Day)" },
  "國休":  { bg: "#FFF1F2", text: "#BE123C", border: "#FECDD3", label: "國休",  fullLabel: "國定假日 (Public Holiday)" },
  "特修":  { bg: "#FFF1F2", text: "#BE123C", border: "#FECDD3", label: "特休",  fullLabel: "特別休假 (Special Leave)" },
  "補休":  { bg: "#FFF1F2", text: "#BE123C", border: "#FECDD3", label: "補休",  fullLabel: "補休 (Compensatory)" },
};

const SHIFT_OPTIONS = [
  { key: "9-18",  letter: "A" },
  { key: "13-22", letter: "B" },
  { key: "例",    letter: "C" },
  { key: "休",    letter: "D" },
  { key: "國休",  letter: "E" },
  { key: "特修",  letter: "F" },
  { key: "補休",  letter: "G" },
];

const INITIAL_SCHEDULE = {
  "2026-03": {
    Summer:   { 1:"13-22",2:"13-22",3:"13-22",4:"13-22",7:"13-22",8:"13-22",9:"13-22" },
    Vanessa:  { 1:"9-18",2:"9-18",3:"休",4:"國休",5:"9-18",6:"9-18",7:"9-18",8:"例",9:"9-18",
                10:"9-18",11:"13-22",12:"休",13:"13-22",14:"例",15:"13-22",16:"13-22",17:"13-22",
                18:"13-22",19:"例",20:"例",21:"休",22:"9-18",23:"13-22",24:"13-22",25:"休",
                26:"國休",27:"例",28:"9-18",29:"9-18",30:"9-18",31:"9-18" },
    Gabi:     { 1:"休",2:"例",3:"9-18",4:"9-18",5:"13-22",6:"13-22",7:"休",8:"9-18",9:"例",
                10:"國休",11:"9-18",12:"9-18",13:"9-18",14:"9-18",15:"9-18",16:"例",17:"休",
                18:"9-18",19:"13-22",20:"13-22",21:"13-22",22:"13-22",23:"例",24:"9-18",
                25:"13-22",26:"13-22",27:"13-22",28:"例",29:"13-22",30:"休",31:"國休" },
    Jonathan: { 2:"9-18",3:"9-18",4:"9-18",5:"9-18",6:"9-18",7:"例",8:"休",9:"9-18",
                10:"9-18",11:"9-18",12:"9-18",13:"9-18",14:"例",15:"休",16:"9-18",17:"9-18",
                18:"例",19:"9-18",20:"9-18",21:"9-18",22:"休",23:"9-18",24:"例",25:"9-18",
                26:"9-18",27:"9-18",28:"13-22",29:"休",30:"13-22",31:"13-22" },
    Wilson:   { 1:"休",2:"9-18",3:"9-18",4:"9-18",5:"9-18",6:"9-18",7:"例",8:"休",9:"9-18",
                10:"9-18",11:"9-18",12:"9-18",13:"9-18",14:"例",15:"休",16:"9-18",17:"9-18",
                18:"9-18",19:"9-18",20:"9-18",21:"例",22:"休",23:"9-18",24:"9-18",25:"9-18",
                26:"9-18",27:"9-18",28:"例",29:"休",30:"9-18",31:"9-18" },
  },
  "2026-04": {},
};

const MONTH_LABELS = ["January","February","March","April","May","June",
                      "July","August","September","October","November","December"];
const DAY_LABELS   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// ── Rule logic ────────────────────────────────────────────────────────────────

// Rule 1 — Priority rotates through CS_PRIORITY_ORDER, starting March 2026 = Gabi
function getPriorityForMonth(year, month) {
  const offset = (year - 2026) * 12 + (month - 2); // March 2026 = 0
  const idx    = ((offset % CS_PRIORITY_ORDER.length) + CS_PRIORITY_ORDER.length) % CS_PRIORITY_ORDER.length;
  return CS_PRIORITY_ORDER[idx];
}

// Rule 2 — Coverage completeness check; showReminder only fires at ≥80% fill rate
function checkScheduleCompletion(monthData, year, month) {
  const days       = getDaysInMonth(year, month);
  const schedulable = MEMBERS.filter(m => m.schedulable);
  let filled = 0;
  for (const m of schedulable)
    for (let d = 1; d <= days; d++)
      if (monthData[m.id]?.[d]) filled++;

  const fillRate       = filled / (schedulable.length * days);
  const incompleteDays = [];
  for (let d = 1; d <= days; d++) {
    const cov = getCoverage(monthData, d);
    if (cov.morning === 0 || cov.evening === 0)
      incompleteDays.push({ day: d, morning: cov.morning, evening: cov.evening });
  }
  return { incompleteDays, fillRate, showReminder: fillRate >= 0.95 && incompleteDays.length > 0 };
}

// Rule 3 — Consecutive work days streak including the day being set
function getConsecutiveStreak(memberData, day, daysInMonth, newShift) {
  if (!WORK_SHIFTS.has(newShift)) return 0;
  const isWork = d => WORK_SHIFTS.has(d === day ? newShift : memberData?.[d]);
  let bwd = 0, fwd = 0;
  for (let d = day - 1; d >= 1; d--)          { if (isWork(d)) bwd++; else break; }
  for (let d = day + 1; d <= daysInMonth; d++) { if (isWork(d)) fwd++; else break; }
  return bwd + 1 + fwd;
}

// Rule 4 — 13-22 on prev day → 9-18 next day = only 11h rest (min 12h required)
function getRestViolatedShifts(memberData, day) {
  return memberData?.[day - 1] === "13-22" ? ["9-18"] : [];
}

// ── Finish logic ──────────────────────────────────────────────────────────────

// All schedulable members (except Summer) must have every day assigned
function isFullyScheduled(monthData, daysInMonth) {
  const targets = MEMBERS.filter(m => m.schedulable && m.id !== "Summer");
  return targets.every(member => {
    for (let d = 1; d <= daysInMonth; d++) {
      if (!monthData[member.id]?.[d]) return false;
    }
    return true;
  });
}

// ── Calendar helpers ──────────────────────────────────────────────────────────

function getDaysInMonth(y, m)    { return new Date(y, m + 1, 0).getDate(); }
function getFirstDayMonSun(y, m) { return (new Date(y, m, 1).getDay() + 6) % 7; }
function prevMonthInfo(y, m)     { return m === 0  ? { year: y-1, month: 11 } : { year: y, month: m-1 }; }
function nextMonthInfo(y, m)     { return m === 11 ? { year: y+1, month: 0  } : { year: y, month: m+1 }; }
const isWeekendCol = col => col === 5 || col === 6;

function getCoverage(data, day) {
  if (!data) return { morning: 0, evening: 0 };
  let morning = 0, evening = 0;
  MEMBERS.forEach(m => {
    const s = data[m.id]?.[day];
    if (s === "9-18")  morning++;
    if (s === "13-22") evening++;
  });
  return { morning, evening };
}

function clampDropdown(rect) {
  const W = 200, H = 290, M = 8;
  let x = rect.left;
  const spaceBelow = window.innerHeight - rect.bottom - M - 5;
  const spaceAbove = rect.top - M - 5;
  let y, maxH;
  if (spaceBelow >= 160 || spaceBelow >= spaceAbove) {
    y = rect.bottom + 5;
    maxH = Math.min(H, Math.max(160, spaceBelow));
  } else {
    maxH = Math.min(H, spaceAbove);
    y = rect.top - maxH - 5;
  }
  if (x + W > window.innerWidth - M) x = rect.right - W;
  return { x: Math.max(M, x), y: Math.max(M, y), maxH };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ShiftChip({ memberId, shift, isPriority, onClick }) {
  const s = SHIFT_STYLES[shift];
  if (!s) return null;
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "2px 6px", borderRadius: 5, cursor: "pointer",
      background: s.bg, border: `1px solid ${s.border}`, gap: 4,
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "flex", alignItems: "center", gap: 2 }}>
        {memberId}
        {isPriority && <span style={{ fontSize: 11, color: "#FBBF24" }}>★</span>}
      </span>
      <span style={{ fontSize: 12, color: s.text, fontWeight: 600 }}>{s.label}</span>
    </div>
  );
}

function EmptySlot({ memberId, isPriority, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "2px 6px", borderRadius: 5, cursor: "pointer",
      background: "transparent", border: "1px dashed #E2E8F0", gap: 4, opacity: 0.75,
    }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: "#CBD5E1", display: "flex", alignItems: "center", gap: 2 }}>
        {memberId}
        {isPriority && <span style={{ fontSize: 11, color: "#FBBF24" }}>★</span>}
      </span>
      <span style={{ fontSize: 11, color: "#CBD5E1" }}>+</span>
    </div>
  );
}

function CoveragePill({ count, type }) {
  const ok = count >= 1;
  return (
    <span title={`${type === "morning" ? "09–18" : "13–22"}: ${count} staff`} style={{
      fontSize: 11, padding: "1px 4px", borderRadius: 4, fontWeight: 700,
      background: ok ? "#DCFCE7" : "#FEE2E2",
      color:      ok ? "#15803D" : "#B91C1C",
    }}>
      {type === "morning" ? "☀" : "🌙"}{count}
    </span>
  );
}

// Floating shift picker — Rule 4: disabledShifts greys out options
// readonly=true: dropdown opens for inspection only; selections have no effect
function ShiftDropdown({ target, onSelect, onClear, onClose, readonly = false }) {
  const pos            = clampDropdown(target);
  const currentShift   = target.currentShift;
  const disabledShifts = target.disabledShifts || [];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 998 }} />
      <div style={{
        position: "fixed", top: pos.y, left: pos.x, zIndex: 999,
        background: "white", borderRadius: 10, width: 200,
        boxShadow: "0 8px 30px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)",
        border: "1px solid #E2E8F0", overflow: "hidden",
        maxHeight: pos.maxH, display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "8px 12px 6px", background: "#F8FAFC", borderBottom: "1px solid #F1F5F9", flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{target.memberId}</div>
          <div style={{ fontSize: 12, color: "#94A3B8" }}>{target.monthLabel} {target.day}</div>
        </div>

        {/* Locked banner shown in readonly (finished) mode */}
        {readonly && (
          <div style={{
            padding: "5px 12px", background: "#FFF7ED", borderBottom: "1px solid #FED7AA",
            fontSize: 11, color: "#B45309", display: "flex", alignItems: "center", gap: 5,
            flexShrink: 0,
          }}>
            🔒 Schedule locked
          </div>
        )}

        <div style={{ overflowY: "auto", flex: 1 }}>
        {[
          { label: "Shift",     keys: ["9-18","13-22"] },
          { label: "Statutory", keys: ["例"] },
          { label: "Off",       keys: ["休","國休","特修","補休"] },
        ].map(group => (
          <div key={group.label}>
            <div style={{ padding: "4px 12px 2px", fontSize: 11, fontWeight: 700, color: "#94A3B8",
              letterSpacing: "0.08em", textTransform: "uppercase",
              background: "#FAFAFA", borderTop: "1px solid #F1F5F9" }}>
              {group.label}
            </div>
            {group.keys.map(key => {
              const s        = SHIFT_STYLES[key];
              const opt      = SHIFT_OPTIONS.find(o => o.key === key);
              const active   = currentShift === key;
              const disabled = !readonly && disabledShifts.includes(key);
              return (
                <button key={key}
                  onClick={readonly ? onClose : (disabled ? undefined : () => onSelect(key))}
                  title={disabled ? "⛔ Rest rule: prev shift ends 22:00 — only 11h before 09:00 (min 12h required)" : undefined}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 12px", border: "none", textAlign: "left",
                    cursor:     disabled ? "not-allowed" : "pointer",
                    background: disabled ? "#F9FAFB" : active ? s.bg : "white",
                    borderLeft: active   ? `3px solid ${s.border}` : "3px solid transparent",
                    opacity:    disabled ? 0.4 : 1,
                  }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", width: 10 }}>{opt.letter}</span>
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    padding: "1px 7px", borderRadius: 4,
                    background: s.bg, border: `1px solid ${s.border}`,
                    fontSize: 13, fontWeight: 700, color: s.text,
                    textDecoration: disabled ? "line-through" : "none",
                  }}>{s.label}</span>
                  <span style={{ fontSize: 12, color: disabled ? "#CBD5E1" : "#6B7280", flex: 1 }}>
                    {disabled ? "Rest violation" : s.fullLabel.split("(")[0].trim()}
                  </span>
                  {disabled && <span style={{ fontSize: 12 }}>⛔</span>}
                </button>
              );
            })}
          </div>
        ))}

        {/* Clear button hidden in readonly mode */}
        {!readonly && currentShift && (
          <div style={{ borderTop: "1px solid #F1F5F9" }}>
            <button onClick={onClear} style={{
              width: "100%", padding: "7px 12px", border: "none", background: "white",
              cursor: "pointer", textAlign: "left", fontSize: 13, color: "#9CA3AF",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ fontSize: 14 }}>✕</span> Clear
            </button>
          </div>
        )}
        </div>
      </div>
    </>
  );
}

// Rule 3 — Auto-dismissing toast for consecutive days warning
function ConsecutiveToast({ warning, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 1100,
      background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 12,
      padding: "14px 16px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
      display: "flex", alignItems: "flex-start", gap: 10, maxWidth: 300,
    }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#92400E" }}>Consecutive Days Warning</div>
        <div style={{ fontSize: 14, color: "#B45309", marginTop: 3, lineHeight: 1.4 }}>
          <strong>{warning.memberId}</strong> will work{" "}
          <strong>{warning.streak} consecutive days</strong> — max is 6.
        </div>
      </div>
      <button onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "#D97706", fontSize: 18, flexShrink: 0 }}>✕</button>
    </div>
  );
}

// Rule 2 — Coverage gap banner, only shown when ≥80% of schedule is filled
function CoverageWarningBanner({ incompleteDays, month, onDismiss }) {
  const gaps = incompleteDays.map(({ day, morning, evening }) => {
    const parts = [];
    if (morning === 0) parts.push("AM");
    if (evening === 0) parts.push("PM");
    return `${day}(${parts.join("+")})`;
  });
  return (
    <div style={{
      background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12,
      padding: "10px 16px", marginBottom: 14,
      display: "flex", alignItems: "flex-start", gap: 10,
    }}>
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>⚠️</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#92400E" }}>
          Coverage Gaps — {MONTH_LABELS[month]}
        </div>
        <div style={{ fontSize: 13, color: "#B45309", marginTop: 3, lineHeight: 1.5 }}>
          {gaps.length} day{gaps.length > 1 ? "s" : ""} missing coverage:{" "}
          <span style={{ fontWeight: 600 }}>{gaps.join(", ")}</span>
        </div>
      </div>
      <button onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "#D97706", fontSize: 16, flexShrink: 0, marginTop: 1 }}>✕</button>
    </div>
  );
}

// ── Save / Modify message modal ───────────────────────────────────────────────
function SaveMessageModal({ message, onClose }) {
  const isSaved = message === "saved";
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2000,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.35)",
    }}>
      <div style={{
        background: "white", borderRadius: 20, padding: "36px 48px",
        textAlign: "center", boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        minWidth: 280,
      }}>
        <div style={{ fontSize: 48 }}>{isSaved ? "✅" : "✏️"}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>
          {isSaved ? "Schedule has been saved" : "Schedule has been modified"}
        </div>
        <button onClick={onClose} style={{
          marginTop: 8, padding: "9px 32px", borderRadius: 10,
          border: "none", background: "#1D4ED8", color: "white",
          fontSize: 15, fontWeight: 600, cursor: "pointer",
        }}>OK</button>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function ScheduleApp() {
  const realToday = new Date();

  const [year,            setYear]           = useState(2026);
  const [month,           setMonth]          = useState(3); // April = index 3
  const [selectedTeam,    setSelectedTeam]   = useState("All");
  const [visibleMembers,  setVisibleMembers] = useState(MEMBERS.map(m => m.id));
  const [selectedDay,     setSelectedDay]    = useState(null);
  const [scheduleState,   setScheduleState]  = useState({});
  const [fbLoading,       setFbLoading]      = useState(true);
  const [openDropdown,    setOpenDropdown]   = useState(null);
  const [consecutiveWarn, setConsecutiveWarn]= useState(null); // Rule 3
  const [bannerDismissed, setBannerDismissed]= useState(false); // Rule 2

  // ── Finish / Modify state ───────────────────────────────────────────────────
  const [finishedMonths,    setFinishedMonths]    = useState({}); // { [monthKey]: true }
  const [finishedSnapshots, setFinishedSnapshots] = useState({}); // { [monthKey]: scheduleData }
  const [modifyModes,       setModifyModes]       = useState({}); // { [monthKey]: true }
  const [preModifySnaps,    setPreModifySnaps]    = useState({}); // local only — reset on refresh
  const [changeLogs,        setChangeLogs]        = useState({}); // { [monthKey]: [...entries] }
  const [saveMessage,       setSaveMessage]       = useState(null); // null | "saved" | "modified"

  // Reset banner dismiss when navigating to a new month
  useEffect(() => { setBannerDismissed(false); }, [year, month]);

  // ── Firebase real-time sync: schedule ────────────────────────────────────────
  useEffect(() => {
    const scheduleRef = ref(db, "schedule");
    const unsub = onValue(scheduleRef, (snapshot) => {
      const data = snapshot.val();
      if (data === null) {
        // First launch: seed the database with the initial March 2026 schedule
        set(scheduleRef, INITIAL_SCHEDULE);
      } else {
        setScheduleState(data);
      }
      setFbLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Firebase real-time sync: meta (finished state + changelog) ───────────────
  useEffect(() => {
    const metaRef = ref(db, "meta");
    const unsub = onValue(metaRef, (snapshot) => {
      const data = snapshot.val() || {};
      setFinishedMonths(data.finished || {});
      setFinishedSnapshots(data.finishedSnapshots || {});
      setModifyModes(data.modifyMode || {});
      // Convert Firebase push-keyed objects → sorted arrays
      const rawLogs = data.changelog || {};
      const parsed  = {};
      for (const [mk, entries] of Object.entries(rawLogs)) {
        parsed[mk] = Object.values(entries).sort((a, b) => a.timestamp - b.timestamp);
      }
      setChangeLogs(parsed);
    });
    return () => unsub();
  }, []);

  const monthKey     = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthData    = scheduleState[monthKey] || {};
  const daysInMonth  = getDaysInMonth(year, month);
  const firstDay     = getFirstDayMonSun(year, month);
  const currentMonthKey = `${realToday.getFullYear()}-${String(realToday.getMonth() + 1).padStart(2, "0")}`;
  const hasData      = (monthKey in scheduleState) || (monthKey >= currentMonthKey);
  const priorityName = getPriorityForMonth(year, month); // Rule 1

  // Rule 2 — recompute whenever schedule changes
  const completion = useMemo(
    () => checkScheduleCompletion(monthData, year, month),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(monthData), year, month]
  );

  // ── Finish / Modify derived state ─────────────────────────────────────────
  const isFinished     = !!finishedMonths[monthKey];
  const isModifying    = !!modifyModes[monthKey];
  const isReadOnly     = isFinished && !isModifying;           // schedule locked
  const fullyScheduled = hasData && isFullyScheduled(monthData, daysInMonth);

  const isToday = d =>
    realToday.getFullYear() === year &&
    realToday.getMonth()    === month &&
    realToday.getDate()     === d;

  function navigate(dir) {
    const next = month + dir;
    if (next < 0)    { setYear(y => y - 1); setMonth(11); }
    else if (next > 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(next);
    setSelectedDay(null);
    setOpenDropdown(null);
  }

  function jumpToday() {
    setYear(realToday.getFullYear());
    setMonth(realToday.getMonth());
    setSelectedDay(realToday.getDate());
    setOpenDropdown(null);
  }

  function toggleMember(id) {
    setVisibleMembers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function setShift(day, memberId, shift) {
    if (isReadOnly) return; // blocked while schedule is locked
    // Optimistic local update for instant UI response
    setScheduleState(prev => ({
      ...prev,
      [monthKey]: {
        ...(prev[monthKey] || {}),
        [memberId]: { ...(prev[monthKey]?.[memberId] || {}), [day]: shift },
      },
    }));
    // Sync to Firebase — everyone else sees the change in real time
    update(ref(db, `schedule/${monthKey}/${memberId}`), { [String(day)]: shift });
    // Rule 3: warn if streak exceeds 6 (reminder only, not a block)
    const streak = getConsecutiveStreak(monthData[memberId] || {}, day, daysInMonth, shift);
    if (streak > 6) setConsecutiveWarn({ memberId, streak });
  }

  function clearShift(day, memberId) {
    if (isReadOnly) return; // blocked while schedule is locked
    setScheduleState(prev => {
      const memberData = { ...(prev[monthKey]?.[memberId] || {}) };
      delete memberData[day];
      return { ...prev, [monthKey]: { ...(prev[monthKey] || {}), [memberId]: memberData } };
    });
    // null removes the key in Firebase
    update(ref(db, `schedule/${monthKey}/${memberId}`), { [String(day)]: null });
  }

  function openFor(e, day, memberId) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    // Rule 4: block morning shift if previous day was evening
    const disabledShifts = getRestViolatedShifts(monthData[memberId] || {}, day);
    setOpenDropdown({
      memberId, day, disabledShifts,
      currentShift: monthData[memberId]?.[day] || null,
      monthLabel: MONTH_LABELS[month],
      ...rect.toJSON(),
    });
  }

  function addSummer(e, day) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const disabledShifts = getRestViolatedShifts(monthData["Summer"] || {}, day);
    setOpenDropdown({
      memberId: "Summer", day, disabledShifts,
      currentShift: monthData["Summer"]?.[day] || null,
      monthLabel: MONTH_LABELS[month],
      ...rect.toJSON(),
    });
  }

  // ── Finish / Modify handlers ──────────────────────────────────────────────

  function handleFinish() {
    const snapshot = JSON.parse(JSON.stringify(monthData));
    // Optimistic local update
    setFinishedMonths(prev => ({ ...prev, [monthKey]: true }));
    setFinishedSnapshots(prev => ({ ...prev, [monthKey]: snapshot }));
    // Persist to Firebase
    update(ref(db, "meta"), {
      [`finished/${monthKey}`]:          true,
      [`finishedSnapshots/${monthKey}`]: snapshot,
    });
    setSaveMessage("saved");
  }

  function handleStartModify() {
    // Capture current (finished) state as the restore point
    setPreModifySnaps(prev => ({
      ...prev,
      [monthKey]: JSON.parse(JSON.stringify(monthData)),
    }));
    // Optimistic local update
    setModifyModes(prev => ({ ...prev, [monthKey]: true }));
    update(ref(db, "meta"), { [`modifyMode/${monthKey}`]: true });
  }

  function handleDiscard() {
    // Restore to the snapshot captured when Modify was clicked (or the finished snapshot)
    const snap = preModifySnaps[monthKey] || finishedSnapshots[monthKey] || {};
    // Restore local schedule state
    setScheduleState(prev => ({ ...prev, [monthKey]: snap }));
    // Restore Firebase schedule
    set(ref(db, `schedule/${monthKey}`), snap);
    // Exit modify mode
    setModifyModes(prev => ({ ...prev, [monthKey]: false }));
    setPreModifySnaps(prev => { const n = { ...prev }; delete n[monthKey]; return n; });
    update(ref(db, "meta"), { [`modifyMode/${monthKey}`]: false });
  }

  function handleSave() {
    const before = preModifySnaps[monthKey] || finishedSnapshots[monthKey] || {};
    const after  = monthData;
    const targets = MEMBERS.filter(m => m.schedulable);

    // Compute diff between before and after
    const changes = [];
    for (const member of targets) {
      for (let d = 1; d <= daysInMonth; d++) {
        const from = (before[member.id] || {})[d] ?? null;
        const to   = (after[member.id]  || {})[d] ?? null;
        if (from !== to) changes.push({ day: d, memberId: member.id, from, to });
      }
    }
    changes.sort((a, b) => a.day - b.day || a.memberId.localeCompare(b.memberId));

    // Persist change log entry if anything actually changed
    if (changes.length > 0) {
      const entry = {
        timestamp:    Date.now(),
        timestampStr: new Date().toLocaleString("zh-TW", { hour12: false }),
        changes,
      };
      const logRef = push(ref(db, `meta/changelog/${monthKey}`));
      set(logRef, entry);
    }

    // Update finished snapshot & exit modify mode
    const newSnapshot = JSON.parse(JSON.stringify(monthData));
    setFinishedSnapshots(prev => ({ ...prev, [monthKey]: newSnapshot }));
    setModifyModes(prev => ({ ...prev, [monthKey]: false }));
    setPreModifySnaps(prev => { const n = { ...prev }; delete n[monthKey]; return n; });
    update(ref(db, "meta"), {
      [`finishedSnapshots/${monthKey}`]: newSnapshot,
      [`modifyMode/${monthKey}`]:        false,
    });

    setSaveMessage("modified");
  }

  const filteredSchedulable = MEMBERS.filter(m =>
    m.schedulable &&
    (selectedTeam === "All" || m.team === selectedTeam) &&
    visibleMembers.includes(m.id)
  );
  const csMembers   = filteredSchedulable.filter(m => m.team === "客服組");
  const techMembers = filteredSchedulable.filter(m => m.team === "技術組");

  // Build overflow-aware cell array
  const prev     = prevMonthInfo(year, month);
  const next     = nextMonthInfo(year, month);
  const prevDays = getDaysInMonth(prev.year, prev.month);
  const prevKey  = `${prev.year}-${String(prev.month + 1).padStart(2, "0")}`;
  const nextKey  = `${next.year}-${String(next.month + 1).padStart(2, "0")}`;
  const cells    = [];
  for (let i = 0; i < firstDay; i++)
    cells.push({ day: prevDays - firstDay + 1 + i, overflow: true, overflowKey: prevKey });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ day: d, overflow: false });
  let trail = 1;
  while (cells.length % 7 !== 0)
    cells.push({ day: trail++, overflow: true, overflowKey: nextKey });

  const card = { background: "white", borderRadius: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", padding: "18px 22px" };

  if (fbLoading) return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#F0F4F8", minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 40 }}>📅</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>Connecting to live schedule…</div>
      <div style={{ fontSize: 15, color: "#94A3B8" }}>Syncing with Firebase</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", background: "#F0F4F8", minHeight: "100vh", padding: 20 }}>

      {/* ── Header ── */}
      <div style={{ ...card, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg,#1D4ED8,#7C3AED)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 22 }}>📅</span>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", letterSpacing: -0.5 }}>MC Markets</div>
            <div style={{ fontSize: 14, color: "#94A3B8", marginTop: 1 }}>Team Schedule</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={jumpToday} style={{ padding: "7px 16px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "white", cursor: "pointer", fontSize: 15, color: "#475569", fontWeight: 600 }}>Today</button>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#F8FAFC", borderRadius: 10, padding: "4px 8px", border: "1px solid #E2E8F0" }}>
            <button onClick={() => navigate(-1)} style={{ width: 30, height: 30, borderRadius: 7, border: "none", background: "white", cursor: "pointer", fontSize: 20, color: "#64748B", boxShadow: "0 1px 2px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", minWidth: 160, textAlign: "center" }}>{MONTH_LABELS[month]} {year}</span>
            <button onClick={() => navigate(1)} style={{ width: 30, height: 30, borderRadius: 7, border: "none", background: "white", cursor: "pointer", fontSize: 20, color: "#64748B", boxShadow: "0 1px 2px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
          </div>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div style={{ ...card, marginBottom: 14, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 5 }}>
          {["All","客服組","技術組"].map(t => (
            <button key={t} onClick={() => setSelectedTeam(t)} style={{
              padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer",
              fontSize: 14, fontWeight: 600,
              background: selectedTeam === t ? "#1D4ED8" : "#F1F5F9",
              color:      selectedTeam === t ? "white"   : "#64748B",
            }}>{t}</button>
          ))}
        </div>
        <div style={{ width: 1, height: 22, background: "#E2E8F0" }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {MEMBERS.filter(m => m.schedulable).map(m => {
            if (selectedTeam !== "All" && m.team !== selectedTeam) return null;
            const active = visibleMembers.includes(m.id);
            return (
              <button key={m.id} onClick={() => toggleMember(m.id)} style={{
                padding: "5px 14px", borderRadius: 20, cursor: "pointer",
                border: "1.5px solid #CBD5E1", fontSize: 14, fontWeight: 600,
                background: active ? "#1E293B" : "white",
                color:      active ? "white"   : "#64748B",
                display: "flex", alignItems: "center", gap: 4,
              }}>
                {m.id}
                {m.id === priorityName && <span style={{ fontSize: 12, color: "#FBBF24", opacity: active ? 0.9 : 0.5 }}>★</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Rule 2: Coverage gap banner (only when ≥80% schedule filled) ── */}
      {completion.showReminder && !bannerDismissed && (
        <CoverageWarningBanner
          incompleteDays={completion.incompleteDays}
          month={month}
          onDismiss={() => setBannerDismissed(true)}
        />
      )}

      {/* ── Calendar ── */}
      <div style={{ borderRadius: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", marginBottom: 14, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ background: "white", borderRadius: 16, minWidth: 900 }}>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {DAY_LABELS.map((d, i) => {
            const wk = isWeekendCol(i);
            return (
              <div key={d} style={{
                padding: "11px 6px", textAlign: "center", fontSize: 15, fontWeight: 700,
                letterSpacing: "0.06em", textTransform: "uppercase",
                background:   wk ? "#FEE2E2" : "#F8FAFC",
                color:        wk ? "#BE123C" : "#000000",
                borderBottom: wk ? "2px solid #FECDD3" : "2px solid #F1F5F9",
              }}>{d}</div>
            );
          })}
        </div>

        {!hasData && (
          <div style={{ padding: 60, textAlign: "center", color: "#94A3B8" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>No schedule data for this month</div>
          </div>
        )}

        {hasData && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {cells.map((cell, idx) => {
              const col         = idx % 7;
              const wk          = isWeekendCol(col);
              const { day, overflow, overflowKey } = cell;
              const isTodayCell = !overflow && isToday(day);
              const isSelected  = !overflow && day === selectedDay;
              const coverage    = !overflow ? getCoverage(monthData, day) : null;
              const notLastCol  = col < 6;
              const notLastRow  = idx < cells.length - 7;
              // Rule 2: amber tint on gap days (only when banner is active)
              const hasCoverageGap = !overflow && completion.showReminder &&
                completion.incompleteDays.some(id => id.day === day);

              let bg = "white";
              if (overflow)           bg = wk ? "#FFF5F5" : "#FAFAFA";
              else if (hasCoverageGap) bg = isSelected ? "#FFFBEB" : "#FFFEF7";
              else if (wk)            bg = isSelected ? "#FFF0F0" : "#FFF5F5";
              else if (isSelected)    bg = "#EFF6FF";

              return (
                <div key={idx}
                  onClick={() => !overflow && setSelectedDay(day === selectedDay ? null : day)}
                  style={{
                    minHeight: 128, padding: "8px 6px 7px", position: "relative",
                    borderRight:  notLastCol ? `1px solid ${wk ? "#FECDD3" : "#F1F5F9"}` : "none",
                    borderBottom: notLastRow ? `1px solid ${wk ? "#FECDD3" : "#F1F5F9"}` : "none",
                    background: bg,
                    cursor: overflow ? "default" : "pointer",
                    opacity: overflow ? 0.4 : 1,
                  }}>

                  {/* Date number + coverage pills */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: "50%",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontSize: 17, fontWeight: isTodayCell ? 800 : 500,
                      background: isTodayCell ? "#1D4ED8" : "transparent",
                      color: isTodayCell ? "white" : wk ? "#BE123C" : overflow ? "#9CA3AF" : "#000000",
                      boxShadow:   isTodayCell     ? "0 2px 6px rgba(29,78,216,0.35)" : "none",
                      // Rule 2: amber ring on gap days
                      outline:      hasCoverageGap && !isTodayCell ? "2px solid #FCD34D" : "none",
                      outlineOffset: 1,
                    }}>{day}</span>
                    {coverage && (
                      <div style={{ display: "flex", gap: 2 }}>
                        <CoveragePill count={coverage.morning} type="morning" />
                        <CoveragePill count={coverage.evening} type="evening" />
                      </div>
                    )}
                  </div>

                  {/* Current month — interactive chips */}
                  {!overflow && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }} onClick={e => e.stopPropagation()}>
                      {csMembers.map(member => {
                        const shift = monthData[member.id]?.[day];
                        const props = { memberId: member.id, isPriority: member.id === priorityName };
                        return shift
                          ? <ShiftChip key={member.id} {...props} shift={shift} onClick={e => openFor(e, day, member.id)} />
                          : <EmptySlot key={member.id} {...props} onClick={e => openFor(e, day, member.id)} />;
                      })}
                      {csMembers.length > 0 && techMembers.length > 0 && (
                        <div style={{ height: 1, background: "#E5E7EB", margin: "2px 1px" }} />
                      )}
                      {techMembers.map(member => {
                        const shift = monthData[member.id]?.[day];
                        const props = { memberId: member.id, isPriority: member.id === priorityName };
                        return shift
                          ? <ShiftChip key={member.id} {...props} shift={shift} onClick={e => openFor(e, day, member.id)} />
                          : <EmptySlot key={member.id} {...props} onClick={e => openFor(e, day, member.id)} />;
                      })}
                      {/* Summer chip — only shown when assigned */}
                      {(() => {
                        const s = monthData["Summer"]?.[day];
                        return s ? <ShiftChip memberId="Summer" shift={s} isPriority={false} onClick={e => openFor(e, day, "Summer")} /> : null;
                      })()}
                      {/* ✦ Summer call-in button — hidden when schedule is locked */}
                      {!isReadOnly && (
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 1 }}>
                          <button onClick={e => addSummer(e, day)} title="Add Summer as cover"
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#CBD5E1", fontWeight: 700, padding: "1px 2px", lineHeight: 1 }}>✦</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Overflow — read-only chips from neighboring month */}
                  {overflow && overflowKey && scheduleState[overflowKey] && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, pointerEvents: "none" }}>
                      {MEMBERS.filter(m => m.schedulable).map(member => {
                        const shift = scheduleState[overflowKey][member.id]?.[day];
                        if (!shift) return null;
                        const s = SHIFT_STYLES[shift];
                        if (!s) return null;
                        return (
                          <div key={member.id} style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "2px 6px", borderRadius: 5, gap: 4,
                            background: s.bg, border: `1px solid ${s.border}`,
                          }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{member.id}</span>
                            <span style={{ fontSize: 12, color: s.text, fontWeight: 600 }}>{s.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>

      {/* ── Selected Day Panel ── */}
      {selectedDay && hasData && (
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>{MONTH_LABELS[month]} {selectedDay}, {year}</div>
              <div style={{ fontSize: 14, color: "#94A3B8", marginTop: 2 }}>
                {DAY_LABELS[(new Date(year, month, selectedDay).getDay() + 6) % 7]} · Full day breakdown
              </div>
            </div>
            {(() => {
              const cov = getCoverage(monthData, selectedDay);
              return (
                <div style={{ display: "flex", gap: 8 }}>
                  {[{ type:"morning", emoji:"☀️", label:"09–18" }, { type:"evening", emoji:"🌙", label:"13–22" }].map(({ type, emoji, label }) => {
                    const count = cov[type]; const ok = count >= 1;
                    return (
                      <div key={type} style={{ textAlign: "center", padding: "8px 16px", borderRadius: 10, background: ok ? "#DCFCE7" : "#FEE2E2" }}>
                        <div style={{ fontSize: 20 }}>{emoji}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: ok ? "#15803D" : "#B91C1C" }}>{count} staff</div>
                        <div style={{ fontSize: 12, color: "#6B7280" }}>{label}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          {[["客服組", MEMBERS.filter(m => m.team === "客服組")],
            ["技術組", MEMBERS.filter(m => m.team === "技術組")]].map(([team, members], gi) => (
            <div key={team}>
              {gi > 0 && <div style={{ height: 1, background: "#F1F5F9", margin: "10px 0" }} />}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                {members.map(member => {
                  const shift      = monthData[member.id]?.[selectedDay];
                  const shiftStyle = shift ? SHIFT_STYLES[shift] : null;
                  if (member.id === "Summer" && !shift) return null;
                  return (
                    <div key={member.id} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12,
                      border: `1.5px solid ${shiftStyle ? shiftStyle.border : "#F1F5F9"}`,
                      background: shiftStyle ? shiftStyle.bg : "#FAFAFA",
                    }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#E2E8F0", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                        {member.id.slice(0,2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", display: "flex", alignItems: "center", gap: 5 }}>
                          {member.id}
                          {member.id === priorityName && <span style={{ fontSize: 13, color: "#FBBF24", fontWeight: 400 }}>★</span>}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: shiftStyle ? shiftStyle.text : "#9CA3AF", marginTop: 1 }}>
                          {shiftStyle ? shiftStyle.fullLabel : "Not scheduled"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Finish / Modify / Discard / Save buttons ── */}
      {hasData && (() => {
        if (isModifying) {
          // Modify mode: Discard + Save
          return (
            <div style={{
              display: "flex", justifyContent: "center", gap: 12, marginBottom: 14,
            }}>
              <button onClick={handleDiscard} style={{
                padding: "10px 28px", borderRadius: 10,
                border: "1.5px solid #E2E8F0", background: "white",
                cursor: "pointer", fontSize: 15, color: "#64748B", fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
              }}>↩ Discard</button>
              <button onClick={handleSave} style={{
                padding: "10px 28px", borderRadius: 10,
                border: "none", background: "#1D4ED8", color: "white",
                cursor: "pointer", fontSize: 15, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
                boxShadow: "0 2px 8px rgba(29,78,216,0.25)",
              }}>💾 Save</button>
            </div>
          );
        }
        if (isFinished) {
          // Finished state: Modify button
          return (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <button onClick={handleStartModify} style={{
                padding: "10px 28px", borderRadius: 10,
                border: "1.5px solid #CBD5E1", background: "white",
                cursor: "pointer", fontSize: 15, color: "#475569", fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
              }}>✏️ Modify</button>
            </div>
          );
        }
        if (fullyScheduled) {
          // All filled: Finish button
          return (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <button onClick={handleFinish} style={{
                padding: "10px 32px", borderRadius: 10,
                border: "none", background: "#059669", color: "white",
                cursor: "pointer", fontSize: 15, fontWeight: 700,
                display: "flex", alignItems: "center", gap: 7,
                boxShadow: "0 2px 8px rgba(5,150,105,0.3)",
              }}>✓ Finish</button>
            </div>
          );
        }
        return null;
      })()}

      {/* ── Monthly Workload Summary ── */}
      {hasData && (() => {
        const summaryMembers = MEMBERS.filter(m => m.schedulable);
        return (
          <div style={{ background: "white", borderRadius: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", padding: "16px 20px", marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>
              {MONTH_LABELS[month]} Workload
            </div>
            <div style={{ display: "flex", gap: 12, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 4 }}>
              {summaryMembers.map(member => {
                const data = monthData[member.id] || {};
                const days = Object.values(data);
                const working  = days.filter(s => s === "9-18" || s === "13-22").length;
                const rei      = days.filter(s => s === "例").length;
                const xiu      = days.filter(s => s === "休").length;
                const guoxiu   = days.filter(s => s === "國休").length;
                const special  = days.filter(s => s === "特修" || s === "補休").length;
                const rows = [
                  { label: "Working days", value: working, color: "#1D4ED8", bg: "#EFF6FF" },
                  { label: "例",           value: rei,     color: "#B45309", bg: "#FFFBEB" },
                  { label: "休",           value: xiu,     color: "#BE123C", bg: "#FFF1F2" },
                  { label: "國休",         value: guoxiu,  color: "#BE123C", bg: "#FFF1F2" },
                  { label: "特休 & 補休",  value: special, color: "#BE123C", bg: "#FFF1F2" },
                ];
                return (
                  <div key={member.id} style={{ flex: "0 0 auto", minWidth: 130, background: "#F8FAFC", borderRadius: 12, padding: "12px 14px", border: "1px solid #E2E8F0" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 8, borderBottom: "1px solid #E2E8F0", paddingBottom: 6 }}>
                      {member.id}
                      {member.id === priorityName && <span style={{ fontSize: 11, color: "#FBBF24", marginLeft: 4 }}>★</span>}
                    </div>
                    {rows.map(row => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "#64748B" }}>{row.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, padding: "1px 8px", borderRadius: 6, background: row.value > 0 ? row.bg : "#F1F5F9", color: row.value > 0 ? row.color : "#94A3B8" }}>
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Change Log ── */}
      {hasData && changeLogs[monthKey] && changeLogs[monthKey].length > 0 && (
        <div style={{ background: "white", borderRadius: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", padding: "16px 20px", marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>
            {MONTH_LABELS[month]} Modification History
          </div>
          {[...changeLogs[monthKey]].reverse().map((entry, i, arr) => (
            <div key={i} style={{
              paddingBottom: 14, marginBottom: i < arr.length - 1 ? 14 : 0,
              borderBottom: i < arr.length - 1 ? "1px solid #F1F5F9" : "none",
            }}>
              {/* Timestamp row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, background: "#F1F5F9", borderRadius: 6, padding: "2px 8px", color: "#64748B", fontWeight: 600 }}>
                  {entry.timestampStr}
                </span>
                <span style={{ fontSize: 11, color: "#94A3B8" }}>
                  {entry.changes.length} change{entry.changes.length !== 1 ? "s" : ""}
                </span>
              </div>
              {/* Change rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {entry.changes.map((c, j) => {
                  const fromLabel = c.from ? (SHIFT_STYLES[c.from]?.label ?? c.from) : "(unset)";
                  const toLabel   = c.to   ? (SHIFT_STYLES[c.to]?.label   ?? c.to)  : "(unset)";
                  const fromStyle = c.from ? SHIFT_STYLES[c.from] : null;
                  const toStyle   = c.to   ? SHIFT_STYLES[c.to]   : null;
                  return (
                    <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <span style={{ color: "#94A3B8", minWidth: 48, fontWeight: 600 }}>
                        {MONTH_LABELS[month].slice(0,3)} {c.day}
                      </span>
                      <span style={{ fontWeight: 700, color: "#374151", minWidth: 64 }}>{c.memberId}</span>
                      <span style={{
                        padding: "1px 7px", borderRadius: 5, fontSize: 12, fontWeight: 700,
                        background: fromStyle ? fromStyle.bg : "#F1F5F9",
                        color:      fromStyle ? fromStyle.text : "#94A3B8",
                        border:     `1px solid ${fromStyle ? fromStyle.border : "#E2E8F0"}`,
                      }}>{fromLabel}</span>
                      <span style={{ color: "#94A3B8", fontSize: 13 }}>→</span>
                      <span style={{
                        padding: "1px 7px", borderRadius: 5, fontSize: 12, fontWeight: 700,
                        background: toStyle ? toStyle.bg : "#F1F5F9",
                        color:      toStyle ? toStyle.text : "#94A3B8",
                        border:     `1px solid ${toStyle ? toStyle.border : "#E2E8F0"}`,
                      }}>{toLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Floating dropdown ── */}
      {openDropdown && (
        <ShiftDropdown
          target={openDropdown}
          readonly={isReadOnly}
          onSelect={key => { setShift(openDropdown.day, openDropdown.memberId, key); setOpenDropdown(null); }}
          onClear={() => { clearShift(openDropdown.day, openDropdown.memberId); setOpenDropdown(null); }}
          onClose={() => setOpenDropdown(null)}
        />
      )}

      {/* ── Rule 3: Consecutive days toast ── */}
      {consecutiveWarn && (
        <ConsecutiveToast warning={consecutiveWarn} onDismiss={() => setConsecutiveWarn(null)} />
      )}

      {/* ── Save / Modify message modal ── */}
      {saveMessage && (
        <SaveMessageModal message={saveMessage} onClose={() => setSaveMessage(null)} />
      )}

    </div>
  );
}
