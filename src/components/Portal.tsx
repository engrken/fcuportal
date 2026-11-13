"use client";
import { Fragment, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import ChangeEmailForm from "./ChangeEmailForm";
import GradeVisibilityManager from "./GradeVisibilityManager";
import GradeContributionPanel from "./GradeContributionPanel";
// These large interactive tools are only downloaded when opened.
const GradeWhatIfSimulator = dynamic(() => import("./GradeWhatIfSimulator"));
const HelpCenter = dynamic(() => import("./PortalGuides").then(module => module.HelpCenter));
const OnboardingGuide = dynamic(() => import("./PortalGuides").then(module => module.OnboardingGuide));
const PhilippineHolidayCalendar = dynamic(() => import("./PhilippineHolidayCalendar").then(module => module.PhilippineHolidayCalendar));
import { calculateCategoryPercent, calculateFinal, calculateGradeBreakdown, convertRawPercent, remainingChildAllocation } from "@/lib/grades";
import { classWorkspaceHref, resolveClassSelection, type ClassSection } from "@/lib/class-navigation";
import { scheduleWeekdays, weekdayFromDate } from "@/lib/schedule-days";
import { buildWorkbookPages, workbookWidths } from "@/lib/scorebook-layout";

type User = { id: string; role: string; fullName: string; email: string; isTenantManager?: boolean; emailDeliveryEnabled?: boolean; profileImagePath: string | null; studentNumber: string | null; courseProgram?: string | null; yearLevel?: string | null; school: { id: string; slug: string; name: string; shortName: string; portalTitle: string; logoText: string; logoPath: string | null; primaryColor: string } };
type WorkbookChange = { subjectId: string; enrollmentId: string; assessmentId: string; points: number | null; remark: "EXCUSED" | "ABSENT" | "DID_NOT_SUBMIT" | null };
type AttendanceMark = { subjectId: string; enrollmentId: string; assessmentId: string; remark: "PRESENT" | "ABSENT" | "EXCUSED" | null };
type Subject = { id: string; classId: string | null; code: string; title: string; term: string; academicYear: string; schedule: string | null; courseYear: string | null; isPublished: boolean; gradeStatus: "DRAFT" | "SUBMITTED" | "VERIFIED"; submittedAt: string | null; verifiedAt: string | null; _count?: { enrollments: number } };
type Category = { id: string; parentId: string | null; name: string; weight: number; conversionBase: number; sortOrder: number };
type Assessment = { id: string; categoryId: string; title: string; maxScore: number; weight: number | null; dueDate: string | null; scheduleOverrideReason?: string | null; attendanceType?: "FACE_TO_FACE" | "ONLINE" | null };
type Enrollment = { id: string; studentName: string; studentNumber: string | null; studentUserId: string | null; remarks: string | null; finalGradeOverride?: string | null; gradeChangeHistory?: Array<{ id:string; previousFinalGrade:string|null; previousRemarks:string|null; newFinalGrade:string|null; newRemarks:string|null; reason:string; createdAt:string; actor:{fullName:string} }>; scores: Array<{ assessmentId: string; points: number | null; remark: string | null }>; finalPercent: number | null };
type GradeBand = { id: string; minPercent: number; finalGrade: string; remarks: string };
type Detail = Subject & { categories: Category[]; gradeBands: GradeBand[]; assessments: Assessment[]; enrollments: Enrollment[] };
type Grade = { id: string; code: string; title: string; term: string; academicYear: string; teacher: string; status: "DRAFT" | "SUBMITTED" | "VERIFIED"; submittedAt: string | null; verifiedAt: string | null; percent: number | null; finalGrade: string | null; remarks: string; gradeBands: Array<{ minPercent: number; finalGrade: string; remarks: string }>; categories: Array<{ id: string; name: string; weight: number; conversionBase: number; assessments: Array<{id:string;title:string;points:number|null;remark:string|null;maxScore:number;weight:number|null}> }> };
type StudentSearchMatch = { enrollmentId: string; studentName: string; studentNumber: string | null; studentRemark: string | null; class: { id: string; classId: string | null; code: string; title: string; term: string; academicYear: string; status: "DRAFT" | "SUBMITTED" | "VERIFIED" }; finalPercent: number | null; finalGrade: string | null; finalRemark: string; records: Array<{id:string;title:string;category:string;points:number|null;remark:string|null;maxScore:number;dueDate:string|null}> };
type ScheduleRow = { label: string; day: string; startTime: string; endTime: string };
type OverviewItem = { id: string; title: string; date: string | null; subjectId: string; code: string; subjectTitle: string; attendanceType?: "FACE_TO_FACE" | "ONLINE" | null; scheduleOverrideReason?: string | null; markedCount?: number; studentCount?: number };
type TodayClass = { id: string; code: string; title: string; classId: string | null; schedule: string[]; canRecordAttendance: boolean };
type OverviewData = {
  stats: { activeClasses: number; activeStudents: number; activities: number; tests: number; pendingReviews: number; attendanceLogs: number };
  attendance: { present: number; absent: number; excused: number };
  submissions: { draft: number; provisional: number; final: number };
  enrollment: Array<{ id: string; label: string; title: string; code: string; count: number }>;
  today: string;
  todayClasses: TodayClass[];
  upcoming: { attendance: OverviewItem[]; assessments: OverviewItem[] };
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function newScheduleRow(): ScheduleRow {
  return { label: "Lecture", day: "Monday", startTime: "07:30 AM", endTime: "09:00 AM" };
}
function todayDateInput() { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function formatOverviewDate(value: string | null) { return value ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(value)) : "Date not set"; }
function scoreSheetCategoryLabel(name: string) {
  const label = name.trim();
  if (/^laboratory\s+exam\b/i.test(label)) return "Lab Exam";
  if (/^laboratory\s+exercises?\b/i.test(label)) return "Lab Exercises";
  if (/^self[-\s]?evaluation\s+exercises?\b/i.test(label)) return "Self-Evaluation";
  if (/^major\s+examinations?\b/i.test(label)) return "Major Exams";
  return label.replace(/\blaboratory\b/gi, "Lab");
}
function shiftDateInput(value: string, days: number) { const date = new Date(`${value}T00:00:00`); date.setDate(date.getDate() + days); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function pieGradient(values: number[], colors: string[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return "conic-gradient(#dbe3ef 0% 100%)";
  let edge = 0;
  const segments = values.map((value, index) => {
    const start = edge;
    edge += (value / total) * 100;
    return `${colors[index]} ${start}% ${edge}%`;
  });
  return `conic-gradient(${segments.join(",")})`;
}

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers || {}) } });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(text || `The server returned an unreadable response (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(data.error || `Request failed (HTTP ${response.status}).`);
  return data;
}
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase(); }
function formatSchedule(raw: string | null) {
  if (!raw) return "";
  try {
    const rows = JSON.parse(raw) as ScheduleRow[];
    if (Array.isArray(rows)) return rows.map(row => `${row.label || "Class"} · ${row.day}, ${row.startTime}–${row.endTime}`).join("  /  ");
  } catch { /* Legacy free-text schedules are displayed unchanged. */ }
  return raw;
}
function updateTime(value: string, part: "hour" | "minute" | "period", next: string) {
  const match = /^(\d{2}):(\d{2})\s(AM|PM)$/.exec(value) || ["", "07", "30", "AM"];
  const hour = part === "hour" ? next : match[1];
  const minute = part === "minute" ? next : match[2];
  const period = part === "period" ? next : match[3];
  return `${hour}:${minute} ${period}`;
}
function TimeDropdown({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const match = /^(\d{2}):(\d{2})\s(AM|PM)$/.exec(value) || ["", "07", "30", "AM"];
  return <div className="schedule-time"><label className="form-label">{label}</label><div className="schedule-time-controls"><select className="form-select" aria-label={`${label} hour`} value={match[1]} onChange={e => onChange(updateTime(value, "hour", e.target.value))}>{Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map(hour => <option key={hour}>{hour}</option>)}</select><span>:</span><select className="form-select" aria-label={`${label} minute`} value={match[2]} onChange={e => onChange(updateTime(value, "minute", e.target.value))}>{Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(minute => <option key={minute}>{minute}</option>)}</select><select className="form-select period-select" aria-label={`${label} AM or PM`} value={match[3]} onChange={e => onChange(updateTime(value, "period", e.target.value))}><option>AM</option><option>PM</option></select></div></div>;
}
function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"' && quoted && input[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && input[i + 1] === "\n") i++; row.push(cell); if (row.some(value => value.trim())) rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  row.push(cell); if (row.some(value => value.trim())) rows.push(row);
  if (rows.length < 2) throw new Error("The CSV has no student rows.");
  const headers = rows.shift()!.map(value => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
  const nameIndex = headers.findIndex(value => ["student name", "full name", "name"].includes(value));
  const numberIndex = headers.findIndex(value => ["student number", "student id", "id number"].includes(value));
  if (nameIndex < 0) throw new Error("CSV needs a Student Name column.");
  return rows.map(values => [values[nameIndex] || "", numberIndex < 0 ? "" : values[numberIndex] || ""].map(value => value.trim())).filter(values => values[0]).map(values => values.join("\t")).join("\n");
}
function parseCsvRows(text: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false; const input = text.replace(/^\uFEFF/, "");
  for (let i=0;i<input.length;i++) { const char=input[i]; if(char==='"'&&quoted&&input[i+1]==='"'){cell+='"';i++;}else if(char==='"')quoted=!quoted;else if(char===","&&!quoted){row.push(cell);cell="";}else if((char==="\n"||char==="\r")&&!quoted){if(char==="\r"&&input[i+1]==="\n")i++;row.push(cell);if(row.some(value=>value.trim()))rows.push(row);row=[];cell="";}else cell+=char; }
  row.push(cell);if(row.some(value=>value.trim()))rows.push(row);if(quoted)throw new Error("The CSV has an unfinished quoted field.");return rows;
}
function csvValue(value: unknown) { const text=String(value??""); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text; }
function xmlEscape(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
function excelColumn(index: number) {
  let value = index + 1;
  let column = "";
  while (value) { value--; column = String.fromCharCode(65 + value % 26) + column; value = Math.floor(value / 26); }
  return column;
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipStored(files: Array<{ name: string; content: string | Uint8Array }>) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const write16 = (view: DataView, position: number, value: number) => view.setUint16(position, value, true);
  const write32 = (view: DataView, position: number, value: number) => view.setUint32(position, value, true);
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = typeof file.content === "string" ? encoder.encode(file.content) : file.content;
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    write32(localView, 0, 0x04034b50); write16(localView, 4, 20); write16(localView, 6, 0x0800);
    write16(localView, 8, 0); write32(localView, 14, crc); write32(localView, 18, data.length); write32(localView, 22, data.length);
    write16(localView, 26, name.length); local.set(name, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    write32(centralView, 0, 0x02014b50); write16(centralView, 4, 20); write16(centralView, 6, 20); write16(centralView, 8, 0x0800);
    write16(centralView, 10, 0); write32(centralView, 16, crc); write32(centralView, 20, data.length); write32(centralView, 24, data.length);
    write16(centralView, 28, name.length); write32(centralView, 42, offset); central.set(name, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  }
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50); write16(endView, 8, files.length); write16(endView, 10, files.length);
  write32(endView, 12, centralSize); write32(endView, 16, offset);
  const size = offset + centralSize + end.length;
  const archive = new Uint8Array(size);
  let cursor = 0;
  for (const part of [...localParts, ...centralParts, end]) { archive.set(part, cursor); cursor += part.length; }
  return archive;
}
function downloadXlsx(filename: string, sheetName: string, headers: string[], rows: unknown[][]) {
  const allRows = [headers, ...rows];
  const worksheetRows = allRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${excelColumn(columnIndex)}${rowIndex + 1}`;
      if (typeof value === "number" && Number.isFinite(value)) return `<c r="${reference}"><v>${value}</v></c>`;
      if (typeof value === "boolean") return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
      const text = xmlEscape(value);
      return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const safeSheetName = sheetName.replace(/[\\/?*\[\]:]/g, " ").slice(0, 31) || "Export";
  const files = [
    { name: "[Content_Types].xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(safeSheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: "xl/worksheets/sheet1.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${worksheetRows}</sheetData></worksheet>` }
  ];
  const url = URL.createObjectURL(new Blob([zipStored(files) as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function downloadFcuGradeXlsx(filename: string, sheetName: string, detail: Detail, categories: Category[], teacherName: string) {
  // The FCU template contains one complete header image, not independent text cells.
  // Use the same artwork in Print and Excel; no external IMAGE() formula required.
  let logoPng: Uint8Array | null = null;
  try {
    const headerResponse = await fetch("/fcu-grading-header.png");
    if (!headerResponse.ok) throw new Error("Official FCU header graphic not found");
    logoPng = new Uint8Array(await headerResponse.arrayBuffer());
  } catch (error) {
    alert("Unable to include the official FCU header. Please reload and retry.");
    console.error("FCU grade-sheet header unavailable:", error);
    return;
  }
  // The supplied ISO template uses A:K, with student names merged across A:D.
  // E:H are grading components, I is Total Grade, J is Final Grade, K is Remarks.
  const gradeSlots = Math.max(4, categories.length);
  // FCU's original form reserves E:H for components. When fewer than four
  // components are configured, merge unused slots into the visible columns.
  const componentRanges = categories.map((category, index) => ({
    category,
    start: 4 + Math.floor(index * gradeSlots / categories.length),
    end: 3 + Math.floor((index + 1) * gradeSlots / categories.length)
  }));
  const columnCount = gradeSlots + 7;
  const last = excelColumn(columnCount - 1);
  const totalCol = columnCount - 3;
  const cells: Array<Array<{ value: unknown; style: number }>> = [];
  const row = (values: Array<{ col: number; value: unknown; style?: number }>) => {
    const result = Array.from({ length: columnCount }, () => ({ value: "", style: 0 } as {value: unknown; style: number}));
    for (const item of values) result[item.col] = { value: item.value, style: item.style ?? 1 };
    cells.push(result);
  };
  for (let i = 0; i < 9; i++) row([]); // A1:K9: official university header image
  row([]);
  row([{ col: 0, value: { runs: [
    { text: "Course No.  " },
    { text: "  " + detail.code + "     ", underline: true },
    { text: "    Descriptive Title  " },
    { text: "   " + detail.title + "                                      ", underline: true }
  ] }, style: 2 }]);
  row([{ col: 0, value: "_______________________________________________   ", style: 2 }]);
  row([{ col: 0, value: { runs: [
    { text: "Class I.D.  " },
    { text: "  " + (detail.classId || "—") + "    ", underline: true },
    { text: "          Semester  " },
    { text: "  " + detail.term + "    ", underline: true },
    { text: "          Academic Year  " },
    { text: "  " + detail.academicYear + "   ", underline: true }
  ] }, style: 2 }]);
  row([{ col: 0, value: "-----------------------------------------------------------------------------------------------------------------------------------------------", style: 6 }]);
  row([
    { col: 0, value: "NAME OF STUDENTS", style: 4 },
    ...componentRanges.map(range => ({ col: range.start, value: ": " + range.category.name.toUpperCase() + " :", style: 4 })),
    { col: totalCol, value: ": TG :", style: 4 },
    { col: totalCol + 1, value: ": FG :", style: 4 },
    { col: totalCol + 2, value: ": REMARKS :", style: 4 }
  ]);
  row([{ col: 0, value: "-----------------------------------------------------------------------------------------------------------------------------------------------", style: 6 }]);
  for (const [index, enrollment] of detail.enrollments.entries()) {
    const band = detail.gradeBands.slice().sort((a, b) => b.minPercent - a.minPercent).find(item => enrollment.finalPercent !== null && enrollment.finalPercent >= item.minPercent);
    const suppress = ["INC", "DROPPED"].includes(enrollment.remarks || "");
    const componentValues = componentRanges.map(range => {
      const percent = weightedCategoryPercent(enrollment, range.category, detail.categories, detail.assessments);
      return { col: range.start, value: suppress || percent === null ? "" : Number((percent * effectiveCategoryWeight(range.category, detail.categories) / 100).toFixed(2)), style: 5 };
    });
    const gradeString = suppress ? "" : enrollment.finalGradeOverride || band?.finalGrade || "";
    const gradeNumber = gradeString && /^[0-9]+(?:\.[0-9]+)?$/.test(gradeString) ? Number(gradeString) : gradeString;
    row([
      { col: 0, value: (index + 1) + ". " + enrollment.studentName.toLocaleUpperCase(), style: 5 },
      ...componentValues,
      { col: totalCol, value: suppress || enrollment.finalPercent === null ? "" : Number(enrollment.finalPercent.toFixed(2)), style: 5 },
      { col: totalCol + 1, value: gradeNumber, style: 5 },
      { col: totalCol + 2, value: (enrollment.remarks || band?.remarks) ? ":   " + (enrollment.remarks || band?.remarks) + "   :" : "", style: 6 }
    ]);
  }
  // The official workbook places two signature columns below the grading list.
  row([]);
  row([{ col: 0, value: "Submitted by:                                                                         Noted:", style: 2 }]);
  row([]);
  row([{ col: 0, value: { runs: [
    { text: "              " + teacherName.toLocaleUpperCase() + "              ", underline: true },
    { text: "                           ________________________________", underline: true }
  ] }, style: 2 }]);
  row([{ col: 0, value: "TEACHER'S SIGNATURE OVER PRINTED NAME                         DEAN'S SIGNATURE OVER PRINTED NAME", style: 2 }]);
  const xmlRows = cells.map((values, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const xmlCells = values.map((cell, colIndex) => {
      const reference = `${excelColumn(colIndex)}${rowNumber}`;
      if (typeof cell.value === "number" && Number.isFinite(cell.value)) return `<c r="${reference}" s="${cell.style}"><v>${cell.value}</v></c>`;
      if (cell.value && typeof cell.value === "object" && "runs" in cell.value) {
        const runs = (cell.value as { runs: Array<{ text: string; underline?: boolean }> }).runs;
        return `<c r="${reference}" s="${cell.style}" t="inlineStr"><is>${runs.map(run => `<r><rPr><rFont val="Arial"/><sz val="11"/>${run.underline ? '<u/>' : ''}</rPr><t xml:space="preserve">${xmlEscape(run.text)}</t></r>`).join("")}</is></c>`;
      }
      const text = xmlEscape(cell.value);
      return `<c r="${reference}" s="${cell.style}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
    }).join("");
    const height = rowIndex < 9 ? ' ht="15.5" customHeight="1"' : rowIndex === 13 ? ' ht="10.95" customHeight="1"' : rowIndex === 15 ? ' ht="10.05" customHeight="1"' : rowIndex >= 16 && rowIndex < 16 + detail.enrollments.length ? ' ht="13.8" customHeight="1"' : ' ht="15" customHeight="1"';
    return `<row r="${rowNumber}"${height}>${xmlCells}</row>`;
  }).join("");
  const merges = [
    "A1:" + last + "9", "A11:" + last + "11", "A12:" + last + "12", "A13:" + last + "13",
    "A14:" + last + "14", "A15:D15", "A16:" + last + "16",
    ...detail.enrollments.map((_, index) => "A" + (index + 17) + ":D" + (index + 17)),
    ...componentRanges.flatMap(range => range.start === range.end ? [] : [
      excelColumn(range.start) + "15:" + excelColumn(range.end) + "15",
      ...detail.enrollments.map((_, index) => excelColumn(range.start) + (index + 17) + ":" + excelColumn(range.end) + (index + 17))
    ]),
    ...[detail.enrollments.length + 18, detail.enrollments.length + 20, detail.enrollments.length + 21].map(index => "A" + index + ":" + last + index)
  ];
  const mergeXml = merges.map(range => '<mergeCell ref="' + range + '"/>').join("");
  const widths = '<cols><col min="1" max="1" width="8.44" customWidth="1"/>' +
    '<col min="2" max="2" width="8" customWidth="1"/><col min="3" max="3" width="8.22" customWidth="1"/>' +
    '<col min="4" max="4" width="9.55" customWidth="1"/>' +
    '<col min="5" max="' + totalCol + '" width="9" customWidth="1"/>' +
    '<col min="' + (totalCol + 1) + '" max="' + (totalCol + 2) + '" width="8.3" customWidth="1"/>' +
    '<col min="' + (totalCol + 3) + '" max="' + columnCount + '" width="13" customWidth="1"/></cols>';
  const worksheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"><pane ySplit="16" topLeftCell="A17" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' + widths + '<sheetData>' + xmlRows + '</sheetData>' +
    '<mergeCells count="' + merges.length + '">' + mergeXml + '</mergeCells>' +
    '<printOptions horizontalCentered="1"/><pageMargins left="0.275" right="0.20" top="0.39" bottom="0.24" header="0.20" footer="0.20"/>' +
    '<pageSetup paperSize="14" orientation="portrait" fitToWidth="1" fitToHeight="0"/>' +
    '<drawing r:id="rId1"/></worksheet>';
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;:   &quot;0.00&quot;  :&quot;"/></numFmts>' +
    '<fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><b/><sz val="15"/><name val="Arial"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="dotted"/><right style="dotted"/><top/><bottom style="dotted"/><diagonal/></border>' +
    '<border><left/><right/><top style="dashed"/><bottom style="dashed"/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const safeSheetName = sheetName.replace(/[\\/?*\[\]:]/g, " ").slice(0, 31) || "FCU Grades";
  const files = [
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${logoPng ? '<Default Extension="png" ContentType="image/png"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ""}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(safeSheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: "xl/worksheets/sheet1.xml", content: worksheet },
    { name: "xl/styles.xml", content: styles },
    ...(logoPng ? [
      { name: "xl/worksheets/_rels/sheet1.xml.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>' },
      { name: "xl/drawings/drawing1.xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="7040000" cy="1755000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Official FCU ISO grading header"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>' },
      { name: "xl/drawings/_rels/drawing1.xml.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>' },
      { name: "xl/media/image1.png", content: logoPng }
    ] : [])
  ];
  const url = URL.createObjectURL(new Blob([zipStored(files) as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function categoryPercent(enrollment: Enrollment, category: Category, assessments: Assessment[], categories: Category[]) {
  const items = assessments.filter(assessment => assessment.categoryId === category.id);
  if (!items.length) return null;
  const base = category.parentId ? categories.find(item => item.id === category.parentId)?.conversionBase : category.conversionBase;
  return calculateCategoryPercent({ conversionBase: base ?? 50, assessments: items.map(item => ({ title: item.title, maxScore: item.maxScore, weight: item.weight, scores: enrollment.scores.filter(score => score.assessmentId === item.id) })) });
}
function assessmentScoreDetails(enrollment: Enrollment, assessment: Assessment, category: Category, categories: Category[], assessments: Assessment[]) {
  const score = enrollment.scores.find(item => item.assessmentId === assessment.id);
  if ((!score || (score.points === null && !score.remark)) || score.remark === "EXCUSED") return { equivalent: null, contribution: null };
  const rawPoints = score.remark === "ABSENT" || score.remark === "DID_NOT_SUBMIT" ? 0 : score.points ?? 0;
  const base = category.parentId ? categories.find(item => item.id === category.parentId)?.conversionBase : category.conversionBase;
  const equivalent = convertRawPercent(rawPoints / assessment.maxScore * 100, base ?? 50);
  const categoryItems = assessments.filter(item => item.categoryId === category.id && !item.title.toLocaleLowerCase().startsWith("attendance ·"));
  const activeItems = categoryItems.filter(item => enrollment.scores.find(value => value.assessmentId === item.id)?.remark !== "EXCUSED");
  const hasExplicitWeights = categoryItems.some(item => item.weight !== null);
  const denominator = hasExplicitWeights ? activeItems.reduce((sum, item) => sum + (item.weight ?? 0), 0) : activeItems.reduce((sum, item) => sum + item.maxScore, 0);
  const itemWeight = hasExplicitWeights ? assessment.weight ?? 0 : assessment.maxScore;
  const share = denominator ? itemWeight / denominator : 0;
  return { equivalent, contribution: Math.round(equivalent * effectiveCategoryWeight(category, categories) / 100 * share * 100) / 100 };
}
function weightedCategoryPercent(enrollment: Enrollment, category: Category, categories: Category[], assessments: Assessment[]): number | null {
  const children = categories.filter(item => item.parentId === category.id);
  if (!children.length) return categoryPercent(enrollment, category, assessments, categories);
  if (!children.some(child => categoryHasScores(enrollment, child, categories, assessments))) return null;
  const totalWeight = children.reduce((sum, child) => sum + child.weight, 0);
  return totalWeight ? children.reduce((sum, child) => sum + (weightedCategoryPercent(enrollment, child, categories, assessments) ?? 0) * child.weight / totalWeight, 0) : null;
}
function categoryHasScores(enrollment: Enrollment, category: Category, categories: Category[], assessments: Assessment[]): boolean {
  const children = categories.filter(item => item.parentId === category.id);
  if (children.length) return children.some(child => categoryHasScores(enrollment, child, categories, assessments));
  return assessments.some(item => item.categoryId === category.id && enrollment.scores.some(score => score.assessmentId === item.id && (score.points !== null || (!!score.remark && score.remark !== "EXCUSED"))));
}
function attendanceSummary(enrollment: Enrollment, assessments: Assessment[]) {
  const sessions = assessments.filter(item => item.title.toLocaleLowerCase().startsWith("attendance ·"));
  const counts = { present: 0, absent: 0, excused: 0 };
  for (const item of sessions) {
    const score = enrollment.scores.find(value => value.assessmentId === item.id);
    if (score?.remark === "EXCUSED") counts.excused++;
    else if (score?.remark === "ABSENT" || score?.remark === "DID_NOT_SUBMIT") counts.absent++;
    else if (score?.remark === "PRESENT" || (score?.points != null && score.points > 0)) counts.present++;
  }
  const counted = counts.present + counts.absent;
  const absencePercent = counted ? counts.absent / counted * 100 : null;
  return { ...counts, sessions: sessions.length, percent: counted ? counts.present / counted * 100 : null, absencePercent, alertLevel: absencePercent === null ? "none" as const : absencePercent > 20 ? "critical" as const : absencePercent >= 10 ? "early" as const : "none" as const, atRisk: absencePercent !== null && absencePercent > 20 };
}

function leafCategories(categories: Category[]) { return categories.filter(category => !categories.some(item => item.parentId === category.id)); }
function categoryPath(category: Category, categories: Category[]) {
  const names = [category.name]; let parent = categories.find(item => item.id === category.parentId);
  while (parent) { names.unshift(parent.name); parent = categories.find(item => item.id === parent?.parentId); }
  return names.join(" / ");
}
function rootCategory(category: Category, categories: Category[]) {
  let root = category;
  const visited = new Set([category.id]);
  while (root.parentId) {
    if (visited.has(root.parentId)) break;
    visited.add(root.parentId);
    const parent = categories.find(item => item.id === root.parentId);
    if (!parent) break;
    root = parent;
  }
  return root;
}
function categoryWeightLabel(category: Category, categories: Category[]) {
  return category.parentId ? `${category.weight.toFixed(2)}% within ${rootCategory(category, categories).name}` : `${category.weight.toFixed(2)}% of course`;
}
function effectiveCategoryWeight(category: Category, categories: Category[]) {
  let root = category;
  const visited = new Set([category.id]);
  while (root.parentId) {
    if (visited.has(root.parentId)) return 0;
    visited.add(root.parentId);
    const parent = categories.find(item => item.id === root.parentId);
    if (!parent) return 0;
    root = parent;
  }
  return category.id === root.id ? root.weight : root.weight * category.weight / 100;
}
export default function Portal({ user, initialPage = "overview", initialClassId = "", initialClassSection = "setup", initialClassStudent = "", initialAttendanceToday = false }: {
  user: User;
  initialPage?: "overview" | "classes" | "profile" | "simulator";
  initialClassId?: string;
  initialClassSection?: ClassSection;
  initialClassStudent?: string;
  initialAttendanceToday?: boolean;
}) {
  const router = useRouter(); const teacher = user.role === "TEACHER"; const onboardingStorageKey = "saga-onboarding-complete:" + user.id;
  const [tab, setTab] = useState(initialPage); const [classSection, setClassSection] = useState<ClassSection>(initialClassSection); const [subjects, setSubjects] = useState<Subject[]>([]); const [activeId, setActiveId] = useState(initialClassId); const [detail, setDetail] = useState<Detail | null>(null); const [grades, setGrades] = useState<Grade[]>([]); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [loadingDetail, setLoadingDetail] = useState(false); const [notice, setNotice] = useState(""); const [err, setErr] = useState("");
  const [createOpen, setCreateOpen] = useState(false); const [editOpen, setEditOpen] = useState(false); const [editDetails, setEditDetails] = useState({ classId: "", code: "", title: "", term: "1st Semester", academicYear: "", courseYear: "" }); const [editScheduleRows, setEditScheduleRows] = useState<ScheduleRow[]>([]); const [rosterOpen, setRosterOpen] = useState(false); const [assessmentOpen, setAssessmentOpen] = useState(false); const [attendanceOpen, setAttendanceOpen] = useState(false); const [attendanceDate, setAttendanceDate] = useState(todayDateInput); const [attendanceType, setAttendanceType] = useState<"FACE_TO_FACE" | "ONLINE">("FACE_TO_FACE"); const [attendanceReason, setAttendanceReason] = useState(""); const [assessmentCategoryOverrides, setAssessmentCategoryOverrides] = useState<Record<string, boolean>>({});
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([]); const [copyFromId, setCopyFromId] = useState(""); const [rosterText, setRosterText] = useState(""); const [rosterFileName, setRosterFileName] = useState(""); const [categoryName, setCategoryName] = useState(""); const [categoryParent, setCategoryParent] = useState(""); const [categoryWeight, setCategoryWeight] = useState("50"); const [categoryOpen, setCategoryOpen] = useState(false);
  const [lectureCourseWeight, setLectureCourseWeight] = useState("60"); const [laboratoryCourseWeight, setLaboratoryCourseWeight] = useState("40");
  const [gradingSetupType, setGradingSetupType] = useState<"SINGLE" | "COMBINED">("SINGLE"); const [singleGroupType, setSingleGroupType] = useState<"LECTURE" | "LABORATORY">("LECTURE");
  const [theme, setTheme] = useState<"light" | "dark">("light"); const [schoolYearFilter, setSchoolYearFilter] = useState("All School Years"); const [termFilter, setTermFilter] = useState("All Terms"); const [rosterEdit, setRosterEdit] = useState<{ id: string; studentName: string; studentNumber: string } | null>(null); const [printMode, setPrintMode] = useState<"roster" | "grades" | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); const [classNavOpen, setClassNavOpen] = useState(false); const [onboardingOpen, setOnboardingOpen] = useState(false); const [helpOpen, setHelpOpen] = useState(false); const [helpInitialTab, setHelpInitialTab] = useState<"quick" | "faq" | "student" | "faculty">("quick"); const [subjectPage, setSubjectPage] = useState(1); const [classPage, setClassPage] = useState(1); const [rosterPage, setRosterPage] = useState(1);
  const [studentLookupQuery, setStudentLookupQuery] = useState(""); const [studentLookupMatches, setStudentLookupMatches] = useState<StudentSearchMatch[]>([]); const [studentLookupBusy, setStudentLookupBusy] = useState(false); const [classStudentFilter, setClassStudentFilter] = useState(initialClassStudent);
  const [studentGradeQuery, setStudentGradeQuery] = useState(""); const [studentYearFilter, setStudentYearFilter] = useState("All School Years"); const [studentTermFilter, setStudentTermFilter] = useState("All Terms");
  const [profileName, setProfileName] = useState(user.fullName); const [passwordCurrent, setPasswordCurrent] = useState(""); const [passwordNew, setPasswordNew] = useState(""); const [passwordConfirm, setPasswordConfirm] = useState(""); const [passwordOtp, setPasswordOtp] = useState(""); const [passwordOtpSent, setPasswordOtpSent] = useState(false);
  const [profileImagePath, setProfileImagePath] = useState(user.profileImagePath); const [schoolLogoPath, setSchoolLogoPath] = useState(user.school.logoPath);
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null); const [overviewLoading, setOverviewLoading] = useState(false); const [overviewRefresh, setOverviewRefresh] = useState(0);
  const [overviewTo, setOverviewTo] = useState(todayDateInput); const [overviewFrom, setOverviewFrom] = useState(() => shiftDateInput(todayDateInput(), -29));
  const [bulkScoresOpen, setBulkScoresOpen] = useState(false); const [bulkFileName, setBulkFileName] = useState(""); const [bulkOperations, setBulkOperations] = useState<Array<{enrollmentId:string;assessmentId:string;points:number|null;remark:"EXCUSED"|"ABSENT"|"DID_NOT_SUBMIT"|null}>>([]); const [bulkRowsPreview, setBulkRowsPreview] = useState<Array<{row:number;student:string;studentNumber:string;cells:number;errors:string[]}>>([]); const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [gradeChangeEnrollmentId, setGradeChangeEnrollmentId] = useState(""); const [gradeChangeGrade, setGradeChangeGrade] = useState("AUTO"); const [gradeChangeRemark, setGradeChangeRemark] = useState("AUTO"); const [gradeChangeReason, setGradeChangeReason] = useState("");
  const [attendanceQuickOpenId, setAttendanceQuickOpenId] = useState(initialAttendanceToday && initialClassId ? initialClassId : "");
  const workbookPendingRef = useRef<Map<string, WorkbookChange>>(new Map());
  const workbookTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workbookInflightRef = useRef<Promise<boolean> | null>(null);
  const workbookFailedRef = useRef(false);
  const [workbookSaveState, setWorkbookSaveState] = useState<"idle" | "queued" | "saving" | "saved" | "error">("idle");
  const attendancePendingRef = useRef<Map<string, AttendanceMark>>(new Map());
  const attendanceSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attendanceSavingRef = useRef(false);
  const attendanceFailedRef = useRef(false);
  const [attendanceSaveState, setAttendanceSaveState] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  useEffect(() => {
    const onPageHide = () => {
      if (attendanceSaveTimerRef.current) clearTimeout(attendanceSaveTimerRef.current);
      void flushAttendanceMarks();
      void flushWorkbookScores();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => { window.removeEventListener("pagehide", onPageHide); onPageHide(); };
  }, []);
  const [showWeightBreakdown, setShowWeightBreakdown] = useState(false);
  const [scorebookView, setScorebookView] = useState<"auto" | "all">("auto");
  const [scorebookPage, setScorebookPage] = useState(0);
  const [scorebookWidth, setScorebookWidth] = useState(1250);
  const scorebookRegionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (classSection !== "record") return;
    const region = scorebookRegionRef.current;
    if (!region) return;
    const recalc = () => {
      const width = Math.max(760, Math.round(region.clientWidth - 32));
      setScorebookWidth(previous => previous === width ? previous : width);
    };
    recalc();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(recalc);
      observer.observe(region);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [classSection, activeId, detail?.id, sidebarCollapsed]);
  useEffect(() => { setScorebookPage(0); setScorebookView("auto"); }, [activeId]);
  const [visibilityManagerQuery, setVisibilityManagerQuery] = useState<string | null>(null);
  const [simulatingGradeId, setSimulatingGradeId] = useState<string | null>(null);
  useEffect(() => { if (!notice && !err) return; const timer = window.setTimeout(() => { setNotice(""); setErr(""); }, err ? 20000 : 5500); return () => window.clearTimeout(timer); }, [notice, err]);
  function closeOnboarding() { window.localStorage.setItem(onboardingStorageKey, "done"); setOnboardingOpen(false); }
  function openHelp(tab: "quick" | "faq" | "student" | "faculty" = "quick") { setHelpInitialTab(tab); setHelpOpen(true); }
  function openHelpFromTour() { closeOnboarding(); openHelp("quick"); }
  function navigatePage(page: "overview" | "classes" | "profile" | "simulator") {
    if (page === "simulator" && teacher) return;
    if (page === "classes") {
      if (!teacher) return;
      const id = resolveClassSelection(subjects, activeId, schoolYearFilter, termFilter);
      const section = id === activeId ? classSection : "setup";
      if (id) setActiveId(id);
      if (id !== activeId) setClassSection("setup");
      setTab("classes");
      router.push(classWorkspaceHref(user.school.slug, id, section, undefined, subjects));
      return;
    }
    setTab(page);
    router.push(`/${encodeURIComponent(user.school.slug)}/${page}`);
  }
  function openClass(subjectId: string, section: ClassSection = "setup", options: { student?: string; attendanceToday?: boolean } = {}, replace = false) {
    const subject = subjects.find(item => item.id === subjectId);
    if (!subject) {
      navigatePage("classes");
      return;
    }
    // When opening a class directly from the sidebar or Overview, the filters
    // must not hide that class before its details are loaded.
    if (schoolYearFilter !== "All School Years" && schoolYearFilter !== subject.academicYear) setSchoolYearFilter(subject.academicYear);
    if (termFilter !== "All Terms" && termFilter !== subject.term) setTermFilter(subject.term);
    setClassStudentFilter(options.student || "");
    setActiveId(subjectId);
    setClassSection(section);
    setAttendanceQuickOpenId(options.attendanceToday ? subjectId : "");
    setTab("classes");
    setClassNavOpen(true);
    const href = classWorkspaceHref(user.school.slug, subjectId, section, options, subjects);
    if (replace) router.replace(href, { scroll: false });
    else router.push(href);
  }
  function openClassSection(section: ClassSection) {
    setClassSection(section);
    if (activeId) router.replace(classWorkspaceHref(user.school.slug, activeId, section, classStudentFilter ? { student: classStudentFilter } : undefined, subjects), { scroll: false });
  }
  useEffect(() => { setTab(initialPage); }, [initialPage]);
  useEffect(() => {
    if (!teacher || initialPage !== "classes") return;
    setActiveId(initialClassId);
    setClassSection(initialClassSection);
    setClassStudentFilter(initialClassStudent);
    if (initialAttendanceToday && initialClassId) setAttendanceQuickOpenId(initialClassId);
  }, [teacher, initialPage, initialClassId, initialClassSection, initialClassStudent, initialAttendanceToday]);
  async function loadSubjects() { const d = await api("/api/teacher/subjects"); setSubjects(d.subjects); setOverviewRefresh(value => value + 1); }
  async function loadDetail(id = activeId) { if (!id) { setDetail(null); return; } setLoadingDetail(true); try { const d = await api(`/api/teacher/subjects/${id}`); setDetail(d.subject); } finally { setLoadingDetail(false); } }
  async function loadGrades() { const d = await api("/api/student/grades"); setGrades(d.grades); }
  useEffect(() => { (teacher ? loadSubjects() : loadGrades()).catch(e => setErr(e.message)).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    if (!teacher || tab !== "overview" || !overviewFrom || !overviewTo || overviewFrom > overviewTo) return;
    const controller = new AbortController();
    setOverviewLoading(true);
    api(`/api/teacher/overview?from=${encodeURIComponent(overviewFrom)}&to=${encodeURIComponent(overviewTo)}`, { signal: controller.signal })
      .then(data => setOverviewData(data as OverviewData))
      .catch(error => { if (error?.name !== "AbortError") setErr(error instanceof Error ? error.message : "Could not load teaching analytics."); })
      .finally(() => { if (!controller.signal.aborted) setOverviewLoading(false); });
    return () => controller.abort();
  }, [teacher, tab, overviewFrom, overviewTo, overviewRefresh]);
  useEffect(() => {
    const query = studentLookupQuery.trim();
    if (!teacher || tab !== "overview" || query.length < 2) {
      setStudentLookupMatches([]);
      setStudentLookupBusy(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setStudentLookupBusy(true);
      const params = new URLSearchParams({ q: query });
      if (schoolYearFilter !== "All School Years") params.set("academicYear", schoolYearFilter);
      if (termFilter !== "All Terms") params.set("term", termFilter);
      api(`/api/teacher/student-search?${params}`, { signal: controller.signal })
        .then(data => setStudentLookupMatches((data.matches || []) as StudentSearchMatch[]))
        .catch(error => { if (error?.name !== "AbortError") setErr(error instanceof Error ? error.message : "Could not search student records."); })
        .finally(() => { if (!controller.signal.aborted) setStudentLookupBusy(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [teacher, tab, studentLookupQuery, schoolYearFilter, termFilter]);
  useEffect(() => { const saved = window.localStorage.getItem("saga-portal-theme"); if (saved === "dark" || saved === "light") setTheme(saved); }, []);
  useEffect(() => { if (window.localStorage.getItem(onboardingStorageKey) !== "done") setOnboardingOpen(true); }, [onboardingStorageKey]);
  useEffect(() => { setSidebarCollapsed(window.localStorage.getItem("saga-sidebar-collapsed") === "true"); }, []);
  useEffect(() => { if (teacher && tab === "classes") setClassNavOpen(true); }, [teacher, tab]);
  useEffect(() => {
    if (!teacher || loading || !activeId || !subjects.some(subject => subject.id === activeId)) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetail(current => current?.id === activeId ? current : null);
    setLoadingDetail(true);
    api(`/api/teacher/subjects/${activeId}`)
      .then(result => { if (!cancelled) setDetail(result.subject); })
      .catch(error => { if (!cancelled) setErr(error instanceof Error ? error.message : "Could not load class records."); })
      .finally(() => { if (!cancelled) setLoadingDetail(false); });
    return () => { cancelled = true; };
  }, [teacher, loading, activeId, subjects.some(subject => subject.id === activeId)]);
  useEffect(() => {
    if (!attendanceQuickOpenId || detail?.id !== attendanceQuickOpenId) return;
    const scheduledToday = overviewData?.today || todayDateInput();
    const todaySession = scheduledToday && detail.assessments.some(item => item.title.toLocaleLowerCase() === `attendance · ${scheduledToday}`.toLocaleLowerCase());
    setAttendanceQuickOpenId("");
    if (detail.gradeStatus !== "VERIFIED" && !todaySession) void addAttendanceSession(scheduledToday);
  }, [attendanceQuickOpenId, detail, overviewData?.today]);
  useEffect(() => { setCopyFromId(""); }, [activeId]);
  useEffect(() => {
    if (!teacher || loading || tab !== "classes") return;
    const selectedId = resolveClassSelection(subjects, activeId, schoolYearFilter, termFilter);
    if (selectedId === activeId) return;
    setActiveId(selectedId);
    setDetail(null);
    setClassSection("setup");
    setClassStudentFilter("");
    setAttendanceQuickOpenId("");
    router.replace(classWorkspaceHref(user.school.slug, selectedId, "setup", undefined, subjects), { scroll: false });
  }, [teacher, loading, tab, subjects, activeId, schoolYearFilter, termFilter, router, user.school.slug]);
  useEffect(() => {
    if (!printMode) return;
    let cancelled = false;
    const afterPrint = () => setPrintMode(null);
    window.addEventListener("afterprint", afterPrint);
    async function openPrint() {
      if (user.school.slug === "fcu") {
        const image = document.querySelector<HTMLImageElement>(".fcu-print-official-header");
        if (image && !image.complete) {
          await new Promise<void>(resolve => {
            const finish = () => resolve();
            image.addEventListener("load", finish, { once: true });
            image.addEventListener("error", finish, { once: true });
          });
        }
      }
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (!cancelled) window.print();
    }
    void openPrint();
    return () => { cancelled = true; window.removeEventListener("afterprint", afterPrint); };
  }, [printMode, user.school.slug]);
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }
  function toggleClassNav() {
    if (tab !== "classes") navigatePage("classes");
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
      window.localStorage.setItem("saga-sidebar-collapsed", "false");
      setClassNavOpen(true);
      return;
    }
    setClassNavOpen(open => tab === "classes" ? !open : true);
  }
  function openSidebarClass(subjectId: string) {
    openClass(subjectId, "setup");
  }
  function openStudentSearchMatch(match: StudentSearchMatch) {
    openClass(match.class.id, "record", { student: match.studentNumber || match.studentName });
  }
  function notificationTarget(message: string) {
    const lower=message.toLocaleLowerCase();
    if(/weight|categor|grading path|allocation|parent/.test(lower)) return { label:"Grading setup", section:"setup" };
    if(/attendance|schedule|class date/.test(lower)) return { label:"Attendance", section:"attendance" };
    if(/assessment|perfect score|item weight/.test(lower)) return { label:"Assessment items", section:"items" };
    if(/score|student record|missing/.test(lower)) return { label:"Record scores", section:"record" };
    if(/student|roster/.test(lower)) return { label:"Class roster", section:"roster" };
    if(/grade band|equivalent|threshold/.test(lower)) return { label:"Final-grade equivalents", section:"setup" };
    return null;
  }
  function goToNotificationTarget() {
    if(!err||!detail)return; const target=notificationTarget(err); if(!target)return; openClassSection(target.section as ClassSection); window.setTimeout(()=>document.getElementById(`class-section-${target.section}`)?.scrollIntoView({behavior:"smooth",block:"start"}),100);
  }
  async function run(action: () => Promise<void>, success = "Saved.") { setBusy(true); setErr(""); setNotice(""); try { await action(); setNotice(success); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(false); } }
  async function createSubject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = { ...Object.fromEntries(new FormData(e.currentTarget)), schedule: scheduleRows.length ? JSON.stringify(scheduleRows) : undefined };
    await run(async () => { const d = await api("/api/teacher/subjects", { method: "POST", body: JSON.stringify(data) }); await loadSubjects(); setActiveId(d.subject.id); setClassSection("setup"); router.replace(classWorkspaceHref(user.school.slug, d.subject.id, "setup", undefined, [...subjects, d.subject]), { scroll: false }); setCreateOpen(false); setScheduleRows([]); }, "Subject created. Add your class roll and assessments next.");
  }
  function openSubjectEditor() {
    if (!detail) return;
    setEditDetails({ classId: detail.classId || "", code: detail.code, title: detail.title, term: detail.term, academicYear: detail.academicYear, courseYear: detail.courseYear || "" });
    try { const parsed = JSON.parse(detail.schedule || "[]"); setEditScheduleRows(Array.isArray(parsed) ? parsed : []); } catch { setEditScheduleRows(detail.schedule ? [{ ...newScheduleRow(), label: "Class", day: "Monday", startTime: "07:30 AM", endTime: "09:00 AM" }] : []); }
    setEditOpen(true);
  }
  async function saveSubjectDetails(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!detail) return;
    const updated = { ...editDetails, courseYear: editDetails.courseYear || null, schedule: editScheduleRows.length ? JSON.stringify(editScheduleRows) : null };
    await run(async () => { await api(`/api/teacher/subjects/${detail.id}`, { method: "PATCH", body: JSON.stringify({ updateSubject: updated }) }); setDetail(current => current ? { ...current, ...updated } : current); setSubjects(current => current.map(subject => subject.id === detail.id ? { ...subject, ...updated } : subject)); setEditOpen(false); }, "Class details updated.");
  }
  async function deleteSubject() {
    if (!detail || !window.confirm(`Delete ${detail.code} — ${detail.title}? This permanently removes its roster, assessments, scores, attendance, and grading setup. Only draft classes can be deleted.`)) return;
    await run(async () => { await api(`/api/teacher/subjects/${detail.id}`, { method: "PATCH", body: JSON.stringify({ deleteSubject: true }) }); setDetail(null); setActiveId(""); await loadSubjects(); router.replace(classWorkspaceHref(user.school.slug), { scroll: false }); }, "Class deleted.");
  }
  async function addRoster(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const text = rosterText;
    const students = text.split("\n").map(line => line.trim()).filter(Boolean).map(line => { const [studentName, studentNumber] = line.split(/\t|\|/).map(x => x.trim()); return { studentName, studentNumber: studentNumber || undefined }; });
    await run(async () => { const result = await api(`/api/teacher/subjects/${activeId}`, { method: "POST", body: JSON.stringify({ students }) }); setDetail(current => current ? { ...current, enrollments: [...current.enrollments, ...result.enrollments.map((enrollment: { id: string; studentName: string; studentNumber: string | null; studentUserId: string | null }) => ({ ...enrollment, remarks: null, scores: [], finalPercent: null }))].sort((a,b) => a.studentName.localeCompare(b.studentName)) } : current); setSubjects(current => current.map(subject => subject.id === activeId ? { ...subject, _count: { enrollments: (subject._count?.enrollments || 0) + result.count } } : subject)); form.reset(); setRosterText(""); setRosterFileName(""); setRosterOpen(false); }, `${students.length} student record(s) added. Matching student accounts will see submitted grades automatically.`);
  }
  async function addAssessment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); const body = { title: f.get("title"), categoryId: f.get("categoryId"), maxScore: Number(f.get("maxScore")), weight: f.get("weight") === "" ? null : Number(f.get("weight")), dueDate: f.get("dueDate") || undefined };
    await run(async () => { const result = await api(`/api/teacher/subjects/${activeId}`, { method: "POST", body: JSON.stringify(body) }); setDetail(current => current ? { ...current, assessments: [...current.assessments, result.assessment] } : current); form.reset(); setAssessmentOpen(false); }, "Assessment added.");
  }
  async function addAttendanceSession(date = todayDateInput()) {
    if (!detail) return;
    const category = leafCategories(detail.categories).find(item => item.name.toLocaleLowerCase().includes("attendance"));
    if (!category) { setErr("Add an Attendance category under Grading setup first, then create dated attendance sessions here."); return; }
    if (!scheduleWeekdays(detail.schedule).length) { setErr("Add valid class days to the subject schedule before taking attendance."); return; }
    setAttendanceDate(date); setAttendanceType("FACE_TO_FACE"); setAttendanceReason(""); setAttendanceOpen(true);
  }
  async function createAttendanceDay(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!detail) return;
    const weekday = weekdayFromDate(attendanceDate); const scheduledDays = scheduleWeekdays(detail.schedule);
    if (weekday === null) { setErr("Choose a valid class date."); return; }
    if (!scheduledDays.includes(weekday) && attendanceReason.trim().length < 4) { setErr("This date is outside the class schedule. Enter a reason such as “Make-up class”."); return; }
    await run(async () => { const result = await api(`/api/teacher/subjects/${detail.id}/attendance`, { method: "POST", body: JSON.stringify({ date: attendanceDate, categoryId: leafCategories(detail.categories).find(item => item.name.toLocaleLowerCase().includes("attendance"))?.id, reason: attendanceReason.trim() || undefined, attendanceType }) }); setDetail(current => current ? { ...current, assessments: [...current.assessments, result.assessment], enrollments: current.enrollments.map(enrollment => ({ ...enrollment, scores: [...enrollment.scores, { assessmentId: result.assessment.id, points: null, remark: "PRESENT" }] })) } : current); setAttendanceOpen(false); }, "Attendance day added. Record each student as present, absent, or excused.");
  }
  async function saveWeights() {
    if (!detail) return; await run(async () => { await api(`/api/teacher/subjects/${detail.id}`, { method: "PATCH", body: JSON.stringify({ categories: detail.categories }) }); }, "Grading weights saved.");
  }
  async function addCategory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!detail) return;
    await run(async () => { const result = await api(`/api/teacher/subjects/${detail.id}`, { method: "POST", body: JSON.stringify({ category: { name: categoryName, parentId: categoryParent || null, weight: Number(categoryWeight) }, existingCategories: detail.categories }) }); setDetail(current => current ? { ...current, categories: [...current.categories, result.category] } : current); setCategoryName(""); setCategoryParent(""); setCategoryWeight("0"); setCategoryOpen(false); }, "Category added under its parent. Review the allocation, then save the grading path.");
  }
  async function removeCategory(categoryId: string) {
    if (!detail || !window.confirm("Remove this empty category?")) return;
    await run(async () => { await api(`/api/teacher/subjects/${detail.id}`, { method: "PATCH", body: JSON.stringify({ deleteCategoryId: categoryId }) }); setDetail(current => current ? { ...current, categories: current.categories.filter(category => category.id !== categoryId) } : current); }, "Empty grading category removed.");
  }
  async function saveAssessmentItems() {
    if (!detail) return;
    await run(async () => { await api(`/api/teacher/subjects/${detail.id}`, { method: "PATCH", body: JSON.stringify({ assessmentItems: detail.assessments.map(item => ({ id: item.id, categoryId: item.categoryId, title: item.title, maxScore: Number(item.maxScore), weight: item.weight == null ? null : Number(item.weight), dueDate: item.dueDate ? item.dueDate.slice(0,10) : null, scheduleOverrideReason: item.scheduleOverrideReason || null, attendanceType: item.attendanceType || null })) }) }); }, "Assessment setup saved.");
  }
  async function removeAssessment(assessmentId: string) {
    if (!detail || !window.confirm("Remove this assessment item and delete its scores and item remarks for every student? This cannot be undone.")) return;
    await run(async () => { await api(`/api/teacher/subjects/${detail.id}`, { method: "PATCH", body: JSON.stringify({ deleteAssessmentId: assessmentId }) }); setDetail(current => current ? { ...current, assessments: current.assessments.filter(item => item.id !== assessmentId), enrollments: current.enrollments.map(enrollment => ({ ...enrollment, scores: enrollment.scores.filter(score => score.assessmentId !== assessmentId) })) } : current); }, "Assessment and its associated scores removed.");
  }
  async function copyGrading() {
    if (!detail || !copyFromId) return; await run(async () => { await api(`/api/teacher/subjects/${detail.id}`, { method: "PATCH", body: JSON.stringify({ copyGradingFromSubjectId: copyFromId }) }); await loadDetail(); }, "Grading categories and grade scale copied.");
  }
  async function applyGradingTemplate(mode: "LECTURE_ONLY" | "LABORATORY_ONLY" | "LECTURE_LAB") {
    if (!detail || detail.gradeStatus !== "DRAFT") return;
    const lectureWeight = mode === "LECTURE_ONLY" ? 100 : mode === "LABORATORY_ONLY" ? 0 : Number(lectureCourseWeight);
    const laboratoryWeight = mode === "LABORATORY_ONLY" ? 100 : mode === "LECTURE_ONLY" ? 0 : Number(laboratoryCourseWeight);
    if (mode === "LECTURE_LAB" && (!Number.isFinite(lectureWeight) || !Number.isFinite(laboratoryWeight) || lectureWeight < 1 || laboratoryWeight < 1 || Math.abs(lectureWeight + laboratoryWeight - 100) > 0.01)) {
      setErr("Lecture and Laboratory weights must both be at least 1% and total exactly 100%.");
      return;
    }
    const modeLabel = mode === "LECTURE_ONLY" ? "Lecture-only (100%)" : mode === "LABORATORY_ONLY" ? "Laboratory-only (100%)" : `Lecture ${lectureWeight}% / Laboratory ${laboratoryWeight}%`;
    if (!window.confirm(`Apply the ${modeLabel} grading structure? Existing assessment items will be reassigned when their names and current categories match. Student scores and the grade scale will be kept. Items that cannot be safely matched stop the change without modifying anything.`)) return;
    await run(async () => { await api(`/api/teacher/subjects/${detail.id}`, { method: "PATCH", body: JSON.stringify({ gradingTemplate: mode, lectureWeight, laboratoryWeight }) }); await loadDetail(); }, `${modeLabel} grading structure applied.`);
  }
  async function saveRemark(enrollmentId: string, remark: string) {
    const value = remark || null;
    await run(async () => { await api(`/api/teacher/subjects/${activeId}`, { method: "PATCH", body: JSON.stringify({ enrollmentId, remark: value }) }); setDetail(current => current ? { ...current, enrollments: current.enrollments.map(enrollment => enrollment.id === enrollmentId ? { ...enrollment, remarks: value } : enrollment) } : current); }, "Student remark saved.");
  }
  async function saveGradeBands() {
    if (!detail) return; await run(async () => { const result = await api(`/api/teacher/subjects/${detail.id}`, { method: "PATCH", body: JSON.stringify({ gradeBands: detail.gradeBands }) }); setDetail(current => current ? { ...current, gradeBands: result.gradeBands } : current); }, "Final-grade equivalents saved.");
  }
  async function saveGradeChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(!detail||!gradeChangeEnrollmentId)return;
    await run(async()=>{await api(`/api/teacher/subjects/${detail.id}`,{method:"PATCH",body:JSON.stringify({gradeChange:{enrollmentId:gradeChangeEnrollmentId,finalGrade:gradeChangeGrade,remarks:gradeChangeRemark,reason:gradeChangeReason}})});await loadDetail();setGradeChangeEnrollmentId("");setGradeChangeReason("");},"Grade correction saved with its history.");
  }
  async function submitGrades() {
    if (!detail || !window.confirm("Submit this grade record to students? Visibility is controlled separately in Manage grade visibility. Submitting the grade record will not change who can see it.")) return;
    if (!await ensureWorkbookSaved()) { setErr("Save pending workbook changes before changing grade status."); return; }
    await run(async () => { await api(`/api/teacher/subjects/${detail.id}`, { method: "PATCH", body: JSON.stringify({ submitGrades: true }) }); await loadDetail(); await loadSubjects(); }, "Class grade record submitted. Student visibility is unchanged. Mark Verified to Registrar only after the official school-record submission.");
  }
  async function verifyGrades() {
    if (!detail || detail.gradeStatus !== "SUBMITTED" || !window.confirm("Confirm that you have officially submitted this class's grades on the school's official records and to the Registrar? This will mark student results as final.")) return;
    if (!await ensureWorkbookSaved()) { setErr("Save pending workbook changes before changing grade status."); return; }
    await run(async () => { await api(`/api/teacher/subjects/${detail.id}`, { method: "PATCH", body: JSON.stringify({ verifyGrades: true }) }); await loadDetail(); await loadSubjects(); }, "Verified. Students now see the result as final and confirmed submitted to the Registrar.");
  }
  async function recallSubmittedGrades() {
    if (!detail || detail.gradeStatus === "DRAFT" || !window.confirm("Recall this grade record? Students will no longer see these grades, and the class record will return to draft for editing.")) return;
    if (!await ensureWorkbookSaved()) { setErr("Save pending workbook changes before changing grade status."); return; }
    await run(async () => { await api(`/api/teacher/subjects/${detail.id}`, { method: "PATCH", body: JSON.stringify({ recallGrades: true }) }); await loadDetail(); await loadSubjects(); }, "Submission recalled. The class record is back in draft and hidden from students.");
  }
  function updateScoreLocally(enrollmentId: string, assessmentId: string, points: number | null, remark: string | null) {
    setDetail(current => {
      if (!current) return current;
      const enrollments = current.enrollments.map(enrollment => {
        if (enrollment.id !== enrollmentId) return enrollment;
        const scores = enrollment.scores.some(score => score.assessmentId === assessmentId)
          ? enrollment.scores.map(score => score.assessmentId === assessmentId ? { ...score, points, remark: remark } : score)
          : [...enrollment.scores, { assessmentId, points, remark: remark }];
        const updated = { ...enrollment, scores };
        updated.finalPercent = calculateFinal(current.categories.map(category => ({ id: category.id, parentId: category.parentId, weight: category.weight, conversionBase: category.conversionBase, assessments: current.assessments.filter(item => item.categoryId === category.id).map(item => ({ title: item.title, maxScore: item.maxScore, weight: item.weight, scores: scores.filter(score => score.assessmentId === item.id) })) })));
        return updated;
      });
      return { ...current, enrollments };
    });
  }

  // Coalesce rapid attendance changes in small atomic requests.
  async function flushAttendanceMarks() {
    if (attendanceSavingRef.current || !attendancePendingRef.current.size || attendanceFailedRef.current) return;
    if (attendanceSaveTimerRef.current) clearTimeout(attendanceSaveTimerRef.current);
    attendanceSaveTimerRef.current = null;
    const entries = [...attendancePendingRef.current.entries()];
    const subjectId = entries[0][1].subjectId;
    const batch = entries.filter(([, mark]) => mark.subjectId === subjectId).slice(0, 50);
    for (const [key] of batch) attendancePendingRef.current.delete(key);
    attendanceSavingRef.current = true;
    setAttendanceSaveState("saving");
    try {
      await api(`/api/teacher/subjects/${subjectId}/attendance`, {
        method: "PUT", keepalive: true,
        body: JSON.stringify({ changes: batch.map(([, mark]) => ({
          enrollmentId: mark.enrollmentId, assessmentId: mark.assessmentId, remark: mark.remark
        })) })
      });
      setAttendanceSaveState(attendancePendingRef.current.size ? "pending" : "saved");
    } catch (error) {
      for (const [key, mark] of batch) {
        if (!attendancePendingRef.current.has(key)) attendancePendingRef.current.set(key, mark);
      }
      attendanceFailedRef.current = true;
      setAttendanceSaveState("error");
      setErr(error instanceof Error ? `Attendance not saved: ${error.message}` : "Attendance not saved. Retry the pending marks.");
    } finally {
      attendanceSavingRef.current = false;
      if (attendancePendingRef.current.size && !attendanceFailedRef.current) {
        attendanceSaveTimerRef.current = setTimeout(() => { void flushAttendanceMarks(); }, 80);
      }
    }
  }

  function saveAttendanceMark(enrollmentId: string, assessmentId: string, remark: AttendanceMark["remark"]) {
    if (!detail || detail.gradeStatus === "VERIFIED") return;
    updateScoreLocally(enrollmentId, assessmentId, null, remark);
    const subjectId = detail.id;
    attendancePendingRef.current.set(`${subjectId}:${enrollmentId}:${assessmentId}`, { subjectId, enrollmentId, assessmentId, remark });
    attendanceFailedRef.current = false;
    setAttendanceSaveState("pending");
    if (attendanceSaveTimerRef.current) clearTimeout(attendanceSaveTimerRef.current);
    attendanceSaveTimerRef.current = setTimeout(() => { void flushAttendanceMarks(); }, 300);
  }

  async function flushWorkbookScores(): Promise<boolean> {
    if (workbookInflightRef.current) return workbookInflightRef.current;
    if (workbookFailedRef.current) return false;
    if (workbookTimerRef.current) clearTimeout(workbookTimerRef.current);
    workbookTimerRef.current = null;
    if (!workbookPendingRef.current.size) return true;
    const entries = [...workbookPendingRef.current.entries()];
    const subjectId = entries[0][1].subjectId;
    const batch = entries.filter(([, score]) => score.subjectId === subjectId).slice(0, 50);
    for (const [key] of batch) workbookPendingRef.current.delete(key);
    setWorkbookSaveState("saving");
    const task = (async () => {
      try {
        await api(`/api/teacher/subjects/${subjectId}/bulk-scores`, {
          method: "POST", keepalive: true,
          body: JSON.stringify({ source: "workbook", scores: batch.map(([, {enrollmentId, assessmentId, points, remark}]) =>
            ({ enrollmentId, assessmentId, points, remark })) })
        });
        setWorkbookSaveState(workbookPendingRef.current.size ? "queued" : "saved");
        return true;
      } catch (error) {
        for (const [key, change] of batch) {
          if (!workbookPendingRef.current.has(key)) workbookPendingRef.current.set(key, change);
        }
        workbookFailedRef.current = true;
        setWorkbookSaveState("error");
        setErr(error instanceof Error ? `Workbook not saved: ${error.message}` : "Workbook not saved. Retry pending changes.");
        return false;
      } finally {
        workbookInflightRef.current = null;
        if (workbookPendingRef.current.size && !workbookFailedRef.current) {
          workbookTimerRef.current = setTimeout(() => { void flushWorkbookScores(); }, 80);
        }
      }
    })();
    workbookInflightRef.current = task;
    return task;
  }
  async function ensureWorkbookSaved(): Promise<boolean> {
    if (workbookTimerRef.current) clearTimeout(workbookTimerRef.current);
    while (workbookInflightRef.current || workbookPendingRef.current.size) {
      if (!await flushWorkbookScores()) return false;
    }
    return true;
  }
  function saveScore(enrollmentId: string, assessmentId: string, value: string, remark: string | null = null) {
    if (!detail || detail.gradeStatus === "VERIFIED") return;
    const item = detail.assessments.find(item => item.id === assessmentId);
    if (!item || item.title.toLocaleLowerCase().startsWith("attendance ·")) return;
    const points = remark ? null : value.trim() === "" ? null : Number(value);
    if (points !== null && (!Number.isFinite(points) || points < 0 || points > item.maxScore)) {
      setErr(`Enter a valid score between 0 and ${item.maxScore} for ${item.title}.`);
      return;
    }
    const scoreRemark = (remark || null) as WorkbookChange["remark"];
    setErr("");
    updateScoreLocally(enrollmentId, assessmentId, points, scoreRemark);
    const subjectId = detail.id;
    workbookPendingRef.current.set(`${subjectId}:${enrollmentId}:${assessmentId}`,
      { subjectId, enrollmentId, assessmentId, points, remark: scoreRemark });
    workbookFailedRef.current = false;
    setWorkbookSaveState("queued");
    if (workbookTimerRef.current) clearTimeout(workbookTimerRef.current);
    workbookTimerRef.current = setTimeout(() => { void flushWorkbookScores(); }, 300);
  }
  async function emailVerifiedGrades() {
    if (!detail || detail.gradeStatus !== "VERIFIED" || !window.confirm("Send each student's final grade summary to the email address on their student record? Emails will be sent individually.")) return;
    let summary = "";
    await run(async () => { const result = await api(`/api/teacher/subjects/${detail.id}/email-verified`, { method: "POST" }); summary = `Sent to ${result.sent} student(s); skipped ${result.skipped}, failed ${result.failed}.`; }, "");
    if (summary) setNotice(summary);
  }
  async function toggleTheme() { const next = theme === "light" ? "dark" : "light"; setTheme(next); window.localStorage.setItem("saga-portal-theme", next); }
  async function saveRosterStudent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!detail || !rosterEdit) return;
    await run(async () => { const result = await api(`/api/teacher/subjects/${detail.id}`, { method: "PATCH", body: JSON.stringify({ updateEnrollment: { enrollmentId: rosterEdit.id, studentName: rosterEdit.studentName, studentNumber: rosterEdit.studentNumber || null } }) }); setDetail(current => current ? { ...current, enrollments: current.enrollments.map(enrollment => enrollment.id === rosterEdit.id ? { ...enrollment, studentName: rosterEdit.studentName.trim(), studentNumber: rosterEdit.studentNumber.trim().toUpperCase() || null, studentUserId: result.studentUserId ?? null } : enrollment) } : current); setRosterEdit(null); }, "Roster details saved. Matching portal access updates automatically from the student number.");
  }
  async function deleteRosterStudent(enrollment: Enrollment) {
    if (!detail || !window.confirm(`Remove ${enrollment.studentName} from this class roster and delete this class's score records for them? Their portal account will not be deleted.`)) return;
    await run(async () => { await api(`/api/teacher/subjects/${detail.id}`, { method: "PATCH", body: JSON.stringify({ deleteEnrollmentId: enrollment.id }) }); setDetail(current => current ? { ...current, enrollments: current.enrollments.filter(item => item.id !== enrollment.id) } : current); setSubjects(current => current.map(subject => subject.id === detail.id ? { ...subject, _count: { enrollments: Math.max(0, (subject._count?.enrollments || 0) - 1) } } : subject)); }, "Student removed from the class roster.");
  }
  function printClass(mode: "roster" | "grades") { setPrintMode(mode); }
  async function saveProfile(e: FormEvent<HTMLFormElement>) { e.preventDefault(); await run(async () => { await api("/api/profile", { method: "PATCH", body: JSON.stringify({ fullName: profileName }) }); router.refresh(); }, "Profile updated."); }
  async function requestPasswordOtp() { await run(async () => { const result = await api("/api/profile/security-otp", { method: "POST", body: JSON.stringify({ purpose: "PASSWORD_CHANGE", currentPassword: passwordCurrent }) }); setPasswordOtpSent(true); setPasswordOtp(""); setNotice(result.message); }, ""); }
  async function changePassword(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if (passwordNew !== passwordConfirm) { setErr("The new passwords do not match."); return; } await run(async () => { await api("/api/profile/password", { method: "POST", body: JSON.stringify({ currentPassword: passwordCurrent, newPassword: passwordNew, code: passwordOtp }) }); setPasswordCurrent(""); setPasswordNew(""); setPasswordConfirm(""); setPasswordOtp(""); setPasswordOtpSent(false); window.setTimeout(() => { void logout(); }, 1200); }, "Password changed. Signing you out; sign in again with your new password."); }
  async function uploadProfileImage(kind: "profile" | "school-logo", file?: File) {
    if (!file) return;
    await run(async () => { const form = new FormData(); form.set("kind", kind); form.set("file", file); const response = await fetch("/api/profile/media", { method: "POST", body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Image upload failed."); if (kind === "profile") setProfileImagePath(data.pathname); else setSchoolLogoPath(data.pathname); router.refresh(); }, kind === "profile" ? "Profile picture uploaded." : "School logo uploaded.");
  }
  function exportRoster() {
    if (!detail) return;
    downloadXlsx(`${detail.code.replace(/[^a-z0-9-_]+/gi, "-")}-class-roster.xlsx`, "Class Roster", ["Student Name", "Student Number"], detail.enrollments.map(enrollment => [enrollment.studentName, enrollment.studentNumber || ""]));
  }
  function exportGrades() {
    if (!detail) return;
    if (user.school.slug === "fcu") {
      void downloadFcuGradeXlsx(`${detail.code.replace(/[^a-z0-9-_]+/gi,"-")}-fcu-grading-sheet.xlsx`, "FCU Grading Sheet", detail, printCategories, user.fullName);
      return;
    }
    const assessmentColumns = detail.assessments.map(item => `${categoryPath(detail.categories.find(category => category.id === item.categoryId)!, detail.categories)} — ${item.title} [${item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "No date"}; ${item.maxScore} points]`);
    const categoryColumns = printCategories.map(category => `${categoryPath(category, detail.categories)} (${effectiveCategoryWeight(category, detail.categories).toFixed(2)}% course contribution)`);
    const columns = ["School", "Class ID", "Course Code", "Course Description", "Term", "School Year", "Student ID", "Student Name", "Attendance Present", "Attendance Absent", "Attendance Excused", ...assessmentColumns, ...categoryColumns, "Total Grade (%)", "Final Grade", "Remarks"];
    const rows = detail.enrollments.map(enrollment => {
      const attendance = attendanceSummary(enrollment, detail.assessments);
      const band = detail.gradeBands.slice().sort((a,b)=>b.minPercent-a.minPercent).find(item=>enrollment.finalPercent!==null&&enrollment.finalPercent>=item.minPercent);
      const suppress = ["INC", "DROPPED"].includes(enrollment.remarks || "");
      const scores = detail.assessments.map(item => { const score = enrollment.scores.find(value => value.assessmentId === item.id); return score?.remark || (score?.points == null ? "" : `${score.points}/${item.maxScore}`); });
      const weighted = printCategories.map(category => { const percent = weightedCategoryPercent(enrollment, category, detail.categories, detail.assessments); return suppress || percent === null ? "" : (percent * effectiveCategoryWeight(category, detail.categories) / 100).toFixed(2); });
      return [user.school.name, detail.classId || "", detail.code, detail.title, detail.term, detail.academicYear, enrollment.studentNumber || "", enrollment.studentName, attendance.present, attendance.absent, attendance.excused, ...scores, ...weighted, suppress ? "" : enrollment.finalPercent ?? "", suppress ? "" : enrollment.finalGradeOverride || band?.finalGrade || "", enrollment.remarks || band?.remarks || ""];
    });
    downloadXlsx(`${detail.code.replace(/[^a-z0-9-_]+/gi,"-")}-itemized-grading-sheet.xlsx`, "Itemized Grades", columns, rows);
  }
  function downloadScoreCsv(blank=false) {
    if(!detail)return;
    const items=scorebookAssessments;
    const headers=["Student ID","Student Name",...items.map(item=>`Score:${item.id} - ${item.title} (max ${item.maxScore})`)];
    const rows=detail.enrollments.map(en=>[en.studentNumber||"",en.studentName,...items.map(item=>{if(blank)return "";const score=en.scores.find(value=>value.assessmentId===item.id);return score?.remark ?? score?.points ?? "";})]);
    const csv=[headers,...rows].map(row=>row.map(csvValue).join(",")).join("\r\n");
    const url=URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));const anchor=document.createElement("a");anchor.href=url;anchor.download=`${detail.code.replace(/[^a-z0-9-_]+/gi,"-")}-${blank?"score-template":"scores"}.csv`;anchor.click();URL.revokeObjectURL(url);
  }
  async function previewBulkScores(file: File) {
    if(!detail)return; setBulkFileName(file.name);setBulkOperations([]);setBulkRowsPreview([]);setBulkErrors([]);
    const errors:string[]=[];if(file.size>5*1024*1024){setBulkErrors(["File exceeds the 5 MB limit."]);return;}
    try {
      const rows=parseCsvRows(await file.text());if(rows.length<2)throw new Error("The CSV must include a header and at least one student row.");
      const headers=rows[0].map(value=>value.trim());const idIndex=headers.findIndex(value=>/^student id$/i.test(value));const nameIndex=headers.findIndex(value=>/^student name$/i.test(value));
      if(idIndex<0||nameIndex<0)throw new Error("Include Student ID and Student Name columns. Download a fresh score template for the required format.");
      const scoreColumns=headers.map((header,index)=>({header,index,assessmentId:/^Score:(.+?)\s+-\s+/i.exec(header)?.[1]})).filter(item=>item.assessmentId);
      if(!scoreColumns.length)throw new Error("No score columns found. Keep the Score:<assessment ID> headers from the downloaded template.");
      const knownAssessments=new Map(scorebookAssessments.map(item=>[item.id,item]));const headerIds=scoreColumns.map(item=>item.assessmentId||"");if(new Set(headerIds).size!==headerIds.length)throw new Error("The CSV repeats an assessment column. Keep one column per assessment.");const invalidHeaders=headerIds.filter(id=>!knownAssessments.has(id));if(invalidHeaders.length)throw new Error("The CSV has score columns from a different class or an outdated template. Download a fresh template.");const byNumber=new Map(detail.enrollments.filter(en=>en.studentNumber).map(en=>[en.studentNumber!.trim().toLocaleLowerCase(),en]));const byName=new Map<string,Enrollment[]>();for(const en of detail.enrollments){const key=en.studentName.trim().toLocaleLowerCase();byName.set(key,[...(byName.get(key)||[]),en]);}
      const operations:Array<{enrollmentId:string;assessmentId:string;points:number|null;remark:"EXCUSED"|"ABSENT"|"DID_NOT_SUBMIT"|null}>=[];const preview:Array<{row:number;student:string;studentNumber:string;cells:number;errors:string[]}>=[];const seenStudents=new Set<string>();
      for(let r=1;r<rows.length;r++){const values=rows[r];const lineErrors:string[]=[];const studentNumber=(values[idIndex]||"").trim();const studentName=(values[nameIndex]||"").trim();let enrollment=studentNumber?byNumber.get(studentNumber.toLocaleLowerCase()):undefined;
        if(!enrollment&&studentName){const matches=byName.get(studentName.toLocaleLowerCase())||[];if(matches.length===1)enrollment=matches[0];else if(matches.length>1)lineErrors.push("Name matches multiple students; include the student ID.");}
        if(!studentName&&!studentNumber)lineErrors.push("Student name and ID are both blank.");else if(!enrollment)lineErrors.push("Student is not enrolled in this class.");
        if(enrollment&&studentName&&studentName.toLocaleLowerCase()!==enrollment.studentName.toLocaleLowerCase())lineErrors.push("Student ID and name do not match the class roster.");
        if(enrollment&&seenStudents.has(enrollment.id))lineErrors.push("Duplicate student row.");if(enrollment)seenStudents.add(enrollment.id);
        let cellCount=0;
        for(const col of scoreColumns){const value=(values[col.index]||"").trim();if(!value)continue;const assessment=knownAssessments.get(col.assessmentId||"");if(!assessment){lineErrors.push(`Unknown score column: ${col.header}`);continue;}if(!enrollment)continue;let points:number|null=null;let remark:"EXCUSED"|"ABSENT"|"DID_NOT_SUBMIT"|null=null;const normalized=value.toLocaleUpperCase();if(normalized==="EXCUSED"||normalized==="EX"){remark="EXCUSED";}else if(normalized==="ABSENT"||normalized==="AB"){remark="ABSENT";}else if(normalized==="DID_NOT_SUBMIT"||normalized==="DNS"){remark="DID_NOT_SUBMIT";}else {points=Number(value);if(!Number.isFinite(points)||points<0)lineErrors.push(`${assessment.title}: enter a non-negative score or EXCUSED, ABSENT, or DNS.`);else if(points>assessment.maxScore)lineErrors.push(`${assessment.title}: ${points} exceeds the maximum ${assessment.maxScore}.`);}
          if(!lineErrors.some(message=>message.startsWith(`${assessment.title}:`))){operations.push({enrollmentId:enrollment.id,assessmentId:assessment.id,points,remark});cellCount++;}
        }
        preview.push({row:r+1,student:studentName||enrollment?.studentName||"—",studentNumber,cells:cellCount,errors:lineErrors});
      }
      if(operations.length>5000)errors.push("This file contains more than 5,000 score cells. Import smaller batches.");
      errors.push(...preview.flatMap(item=>item.errors.map(message=>`Row ${item.row}: ${message}`)));
      if(!operations.length&&!errors.length)errors.push("No non-blank score cells were found. Blank cells are left unchanged.");
      setBulkOperations(operations);setBulkRowsPreview(preview);setBulkErrors(errors);
    }catch(error){setBulkErrors([error instanceof Error?error.message:"Could not read this CSV file."]);}
  }
  async function applyBulkScores() {
    if(!detail||bulkErrors.length||!bulkOperations.length)return;
    if (!await ensureWorkbookSaved()) { setErr("Retry pending workbook changes before importing scores."); return; }
    await run(async()=>{await api(`/api/teacher/subjects/${detail.id}/bulk-scores`,{method:"POST",body:JSON.stringify({scores:bulkOperations})});await loadDetail();setBulkScoresOpen(false);setBulkFileName("");setBulkOperations([]);setBulkRowsPreview([]);setBulkErrors([]);},`${bulkOperations.length} score cell(s) imported.`);
  }
  function downloadRosterTemplate() {
    downloadXlsx("class-roster-sample-format.xlsx", "Roster Sample", ["Student Name", "Student Number", "Portal Account"], [["Santos, Juan D.", "2026-0001", ""], ["Reyes, Maria C.", "2026-0002", ""]]);
  }
  const selectedTitle = useMemo(() => subjects.find(s => s.id === activeId)?.code || "My classes", [subjects, activeId]);
  const schoolYears = useMemo(() => [...new Set(subjects.map(subject => subject.academicYear))].sort((a,b)=>b.localeCompare(a)), [subjects]);
  const terms = useMemo(() => [...new Set(subjects.map(subject => subject.term))].sort(), [subjects]);
  const visibleSubjects = useMemo(() => subjects.filter(subject => (schoolYearFilter === "All School Years" || subject.academicYear === schoolYearFilter) && (termFilter === "All Terms" || subject.term === termFilter)), [subjects, schoolYearFilter, termFilter]);
  const visibleClassCount = subjects.filter(subject => subject.isPublished).length;
  const filteredEnrollments = useMemo(() => (detail?.enrollments || []).filter(enrollment => {
    const query = classStudentFilter.trim().toLocaleLowerCase();
    return !query || enrollment.studentName.toLocaleLowerCase().includes(query) || (enrollment.studentNumber || "").toLocaleLowerCase().includes(query);
  }), [detail, classStudentFilter]);
  const studentGradeYears = useMemo(() => [...new Set(grades.map(grade => grade.academicYear))].sort((a,b)=>b.localeCompare(a)), [grades]);
  const studentGradeTerms = useMemo(() => [...new Set(grades.map(grade => grade.term))].sort(), [grades]);
  const visibleGrades = useMemo(() => grades.filter(grade =>
    (studentYearFilter === "All School Years" || grade.academicYear === studentYearFilter) &&
    (studentTermFilter === "All Terms" || grade.term === studentTermFilter) &&
    (!studentGradeQuery.trim() || `${grade.code} ${grade.title} ${grade.teacher}`.toLocaleLowerCase().includes(studentGradeQuery.trim().toLocaleLowerCase()))
  ), [grades, studentYearFilter, studentTermFilter, studentGradeQuery]);
  const subjectsPerPage = 9;
  const subjectPageCount = Math.max(1, Math.ceil(visibleSubjects.length / subjectsPerPage));
  const pageSubjects = visibleSubjects.slice((subjectPage - 1) * subjectsPerPage, subjectPage * subjectsPerPage);
  const classesPerPage = 20;
  const classPageCount = Math.max(1, Math.ceil(visibleSubjects.length / classesPerPage));
  const pageClassOptions = visibleSubjects.slice((classPage - 1) * classesPerPage, classPage * classesPerPage);
  const rosterPerPage = 25;
  const rosterPageCount = Math.max(1, Math.ceil(filteredEnrollments.length / rosterPerPage));
  const pageEnrollments = filteredEnrollments.slice((rosterPage - 1) * rosterPerPage, rosterPage * rosterPerPage);
  useEffect(() => { setSubjectPage(1); }, [schoolYearFilter, termFilter]);
  useEffect(() => { setClassPage(1); }, [schoolYearFilter, termFilter]);
  useEffect(() => { const index = visibleSubjects.findIndex(subject => subject.id === activeId); if (index >= 0) setClassPage(Math.floor(index / classesPerPage) + 1); }, [activeId, visibleSubjects]);
  useEffect(() => { setRosterPage(1); }, [activeId, classStudentFilter]);
  useEffect(() => { setAssessmentCategoryOverrides({}); }, [activeId]);
  useEffect(() => { if (rosterPage > rosterPageCount) setRosterPage(rosterPageCount); }, [rosterPage, rosterPageCount]);
  const recordCategories = useMemo(() => detail ? leafCategories(detail.categories) : [], [detail]);
  const assessmentItemGroups = useMemo(() => {
    if (!detail) return [] as Array<{ category: Category; items: Assessment[] }>;
    return recordCategories.map(category => ({
      category,
      items: detail.assessments.filter(item => item.categoryId === category.id)
    })).filter(group => group.items.length > 0);
  }, [detail, recordCategories]);
  const scorebookItems = useMemo(() => detail?.assessments.filter(item => !item.title.toLocaleLowerCase().startsWith("attendance ·")) ?? [], [detail]);
  const scorebookCategories = useMemo(() => recordCategories.filter(category => scorebookItems.some(item => item.categoryId === category.id)), [recordCategories, scorebookItems]);
  const scorebookGroups = useMemo(() => {
    if (!detail) return [] as Array<{ parent: Category; subcategories: Category[]; items: Assessment[] }>;
    const includedLeaves = new Set(scorebookCategories.map(category => category.id));
    const descendants = (categoryId: string): Category[] => {
      const children = detail.categories.filter(category => category.parentId === categoryId);
      if (!children.length) return includedLeaves.has(categoryId) ? detail.categories.filter(category => category.id === categoryId) : [];
      return children.slice().sort((a, b) => a.sortOrder - b.sortOrder).flatMap(child => descendants(child.id));
    };
    return detail.categories.filter(category => !category.parentId).slice().sort((a, b) => a.sortOrder - b.sortOrder).map(parent => {
      const subcategories = descendants(parent.id).filter(category => scorebookItems.some(item => item.categoryId === category.id && includedLeaves.has(item.categoryId)));
      const items = subcategories.flatMap(category => scorebookItems.filter(item => item.categoryId === category.id));
      return { parent, subcategories, items };
    }).filter(group => group.items.length > 0);
  }, [detail, scorebookCategories, scorebookItems]);
  // Keep all assessment data loaded. Auto-fit only changes which columns render,
  // never which recorded scores contribute to final grades or exports.
  const scorebookAssessments = useMemo(() => scorebookGroups.flatMap(group => group.items), [scorebookGroups]);
  const scorebookPages = useMemo(() => buildWorkbookPages(
    scorebookGroups.flatMap(group => group.subcategories.map(category => ({
      id: category.id,
      label: category.name,
      assessmentIds: group.items.filter(item => item.categoryId === category.id).map(item => item.id)
    }))),
    scorebookWidth
  ), [scorebookGroups, scorebookWidth]);
  const currentScorebookPage = Math.min(scorebookPage, Math.max(0, scorebookPages.length - 1));
  const scorebookDisplayGroups = useMemo(() => {
    if (scorebookView === "all") return scorebookGroups;
    const page = scorebookPages[currentScorebookPage];
    if (!page) return [] as typeof scorebookGroups;
    const shown = new Set(page.segments.flatMap(segment => segment.assessmentIds));
    return scorebookGroups.map(group => {
      const items = group.items.filter(item => shown.has(item.id));
      const subcategories = group.subcategories.filter(category => items.some(item => item.categoryId === category.id));
      return { parent: group.parent, items, subcategories };
    }).filter(group => group.items.length > 0);
  }, [scorebookGroups, scorebookPages, currentScorebookPage, scorebookView]);
  const scorebookVisibleAssessments = useMemo(() => scorebookDisplayGroups.flatMap(group => group.items), [scorebookDisplayGroups]);
  const scorebookVisibleCategories = useMemo(() => scorebookDisplayGroups.flatMap(group => group.subcategories), [scorebookDisplayGroups]);
  const scorebookDisplayColumns = useMemo(() => scorebookDisplayGroups.flatMap(group =>
    group.subcategories.flatMap(category => [
      ...group.items.filter(item => item.categoryId === category.id).map(item => ({ kind: "assessment" as const, category, item })),
      { kind: "equivalent" as const, category }
    ])
  ), [scorebookDisplayGroups]);
  const scorebookColumnWidths = workbookWidths(scorebookWidth);
  const scorebookTableMinWidth = scorebookColumnWidths.student + scorebookColumnWidths.attendance +
    scorebookColumnWidths.total + scorebookColumnWidths.final + scorebookColumnWidths.remark +
    scorebookDisplayColumns.reduce((total, column) =>
      total + (column.kind === "assessment" ? scorebookColumnWidths.assessment : scorebookColumnWidths.equivalent), 0);
  const scorebookHeaderRows = useMemo(() => {
    if (!detail || !scorebookVisibleAssessments.length) return { rows: [] as Array<Array<{ category: Category; colSpan: number; rowSpan: number }>>, rowSpan: 1 };
    const itemCounts = new Map<string, number>();
    const depthById = new Map<string, number>();
    const countItems = (category: Category, depth: number): number => {
      depthById.set(category.id, depth);
      const own = scorebookVisibleAssessments.filter(item => item.categoryId === category.id).length +
        (scorebookVisibleCategories.some(leaf => leaf.id === category.id) ? 1 : 0);
      const children = detail.categories.filter(item => item.parentId === category.id).slice().sort((a,b)=>a.sortOrder-b.sortOrder);
      const count = own + children.reduce((sum, child) => sum + countItems(child, depth + 1), 0);
      itemCounts.set(category.id, count);
      return count;
    };
    for (const group of scorebookDisplayGroups) countItems(group.parent, 0);
    const maxDepth = Math.max(0, ...scorebookVisibleAssessments.map(item => depthById.get(item.categoryId) ?? 0));
    const rows = Array.from({ length: maxDepth + 1 }, () => [] as Array<{ category: Category; colSpan: number; rowSpan: number }>);
    const append = (category: Category, depth: number) => {
      const colSpan = itemCounts.get(category.id) ?? 0;
      if (!colSpan) return;
      const children = detail.categories.filter(item => item.parentId === category.id && (itemCounts.get(item.id) ?? 0) > 0).slice().sort((a,b)=>a.sortOrder-b.sortOrder);
      rows[depth].push({ category, colSpan, rowSpan: children.length ? 1 : maxDepth - depth + 1 });
      children.forEach(child => append(child, depth + 1));
    };
    scorebookDisplayGroups.forEach(group => append(group.parent, 0));
    return { rows, rowSpan: maxDepth + 2 };
  }, [detail, scorebookDisplayGroups, scorebookVisibleAssessments, scorebookVisibleCategories]);
  // Include intermediate nodes such as Major Examinations in the workbook header.
  const printCategories = useMemo(() => detail ? leafCategories(detail.categories) : [], [detail]);
  const weightGroups = useMemo(() => {
    if (!detail) return [];
    const parentKeys = [...new Set(detail.categories.map(category => category.parentId ?? "root"))];
    return parentKeys.map(key => {
      const siblings = detail.categories.filter(category => (category.parentId ?? "root") === key);
      const parent = key === "root" ? null : detail.categories.find(category => category.id === key);
      const expected = !parent || !parent.parentId ? 100 : parent.weight;
      return { label: parent ? `${parent.name} subcategories` : "Overall course components", total: siblings.reduce((sum, category) => sum + category.weight, 0), expected };
    });
  }, [detail]);
  const submissionProblems = useMemo(() => {
    if (!detail) return [];
    const problems: string[] = [];
    if (weightGroups.some(group => Math.abs(group.total - group.expected) > 0.01)) problems.push("Top-level groups and first-level categories must total 100%. Deeper subcategories must add up to their parent’s allocation.");
    const leaves = leafCategories(detail.categories);
    const emptyCategories = leaves.filter(category => category.weight > 0 && !detail.assessments.some(item => item.categoryId === category.id));
    if (emptyCategories.length) problems.push(`${emptyCategories.length} weighted category/categories have no assessment items.`);
    const badItemWeights = leaves.filter(category => {
      const items = detail.assessments.filter(item => item.categoryId === category.id);
      return items.some(item => item.weight !== null) && (items.some(item => item.weight === null) || Math.abs(items.reduce((sum, item) => sum + (item.weight ?? 0), 0) - 100) > 0.01);
    });
    if (badItemWeights.length) problems.push(`Assessment weights must total 100% in ${badItemWeights.length} category/categories.`);
    const missingScoreRows = detail.enrollments.filter(enrollment => !enrollment.remarks && detail.assessments.some(item => !enrollment.scores.some(score => score.assessmentId === item.id && (score.points !== null || !!score.remark)))).length;
    if (missingScoreRows) problems.push(`${missingScoreRows} student record(s) have missing scores. Enter every assessment score or set an appropriate class remark.`);
    return problems;
  }, [detail, weightGroups]);

  const analytics = useMemo(() => {
    if (!detail) return { graded: [] as Enrollment[], average: null as number | null, passing: 0, atRisk: 0, failing: 0, attendanceDanger: 0, leader: null as Enrollment | null, bands: [] as Array<{ label: string; count: number }> };
    const graded = detail.enrollments.filter(enrollment => enrollment.finalPercent !== null && !["INC", "NP", "DROPPED"].includes(enrollment.remarks || ""));
    const average = graded.length ? graded.reduce((sum, item) => sum + (item.finalPercent ?? 0), 0) / graded.length : null;
    const bands = [{ label: "90–100%", count: 0 }, { label: "75–89%", count: 0 }, { label: "60–74%", count: 0 }, { label: "Below 60%", count: 0 }];
    for (const item of graded) { const score = item.finalPercent ?? 0; bands[score >= 90 ? 0 : score >= 75 ? 1 : score >= 60 ? 2 : 3].count++; }
    return { graded, average, passing: graded.filter(item => (item.finalPercent ?? 0) >= 75).length, atRisk: graded.filter(item => (item.finalPercent ?? 0) >= 60 && (item.finalPercent ?? 0) < 75).length, failing: graded.filter(item => (item.finalPercent ?? 0) < 60).length, attendanceDanger: detail.enrollments.filter(item => attendanceSummary(item, detail.assessments).atRisk).length, leader: [...graded].sort((a, b) => (b.finalPercent ?? 0) - (a.finalPercent ?? 0))[0] || null, bands };
  }, [detail]);

  const remainingWeight = (parentId: string | null, exceptId?: string) =>
    detail ? remainingChildAllocation(parentId, detail.categories, exceptId) : 0;
  const renderCategoryForm = (parent: Category | null): ReactNode => <form className="category-create-form category-path-form" onSubmit={addCategory}>
    <div><label className="form-label">{parent ? "Subcategory name" : "Course group name"}</label><input className="form-control" value={categoryName} onChange={e=>setCategoryName(e.target.value)} placeholder={parent ? "e.g. Midterm Exam, Final Exam" : "e.g. Lecture, Laboratory"} required maxLength={80}/></div>
    <div><label className="form-label">Parent category</label><div className="form-control bg-body-secondary">{parent ? categoryPath(parent, detail?.categories || []) : "Top level · course allocation"}</div></div>
    <div><label className="form-label">{parent ? `Weight within ${rootCategory(parent, detail?.categories || []).name} (%)` : "Weight of course (%)"}</label><div className="input-group"><input className="form-control" type="number" min="0" max={remainingWeight(parent?.id || null)} step="0.5" value={categoryWeight} onChange={e=>setCategoryWeight(e.target.value)} required/><span className="input-group-text">%</span></div><small className="muted">{remainingWeight(parent?.id || null).toFixed(2)}% remains in this allocation. First-level categories total 100%; deeper subcategories total their parent’s weight. Adding saves any unsaved edits to existing grading categories.</small></div>
    <div className="category-path-actions"><button type="button" className="btn btn-outline-secondary btn-sm" onClick={()=>setCategoryOpen(false)}>Cancel</button><button className="btn btn-primary btn-sm" disabled={busy||remainingWeight(parent?.id||null)<=0||Number(categoryWeight)>remainingWeight(parent?.id||null)}>Add to parent</button></div>
  </form>;
  const renderCategoryBranch = (category: Category, depth = 0): ReactNode => {
    if (!detail) return null;
    const children = detail.categories.filter(item => item.parentId === category.id);
    const hasItems = detail.assessments.some(item => item.categoryId === category.id);
    return <div className={`grading-node depth-${Math.min(depth, 3)}`} key={category.id}>
      <div className="grading-node-row">
        <div className="grading-node-title"><span className="grading-node-icon">{depth === 0 ? "1" : "↳"}</span><div><input className="form-control form-control-sm grading-category-name" aria-label="Category name" value={category.name} onChange={e=>setDetail({ ...detail, categories: detail.categories.map(item => item.id === category.id ? { ...item, name: e.target.value } : item) })}/><small>{depth === 0 ? "Parent category · % of course" : `Subcategory · allocated under ${detail.categories.find(item => item.id === category.parentId)?.name || "parent"}`}</small></div></div>
        <label className="grading-weight-field">{depth === 0 ? "Weight (% of course)" : `Weight within ${rootCategory(category, detail.categories).name} (%)`}<div className="input-group"><input className="form-control" type="number" min="0" max={Math.max(category.weight, remainingWeight(category.parentId, category.id))} step="0.5" value={category.weight} onChange={e => setDetail({ ...detail, categories: detail.categories.map(item => item.id === category.id ? { ...item, weight: Number(e.target.value) } : item) })}/><span className="input-group-text">%</span></div></label>
        {children.length === 0 && category.parentId ? <div className="grading-conversion-inherited"><small>Inherited equivalent base</small><b>{detail.categories.find(item => item.id === category.parentId)?.conversionBase ?? 50}%</b></div> : <label className="grading-conversion-field">{depth === 0 ? "Equivalent base (%)" : "Child equivalent base (%)"}<div className="input-group"><input className="form-control" type="number" min="1" max="100" step="1" value={category.conversionBase} onChange={e => setDetail({ ...detail, categories: detail.categories.map(item => item.id === category.id ? { ...item, conversionBase: Number(e.target.value) } : item) })}/><span className="input-group-text">%</span></div><small>Formula: raw% × base% + (100% − base)</small></label>}
        <div className="grading-effective-weight"><small>{category.parentId ? `Weight within ${rootCategory(category, detail.categories).name}` : "Weight of course"}</small><b>{category.weight.toFixed(2)}%</b>{children.length>0&&<small>Direct subcategories total {category.parentId ? `${detail.categories.find(item=>item.id===category.parentId)?.parentId ? category.weight : 100}%` : "100%"}</small>}</div>
        <div className="grading-node-actions"><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => { setCategoryParent(category.id); setCategoryWeight(String(remainingWeight(category.id))); setCategoryOpen(true); }} disabled={hasItems}>＋ Subcategory</button><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeCategory(category.id)} disabled={busy || hasItems || children.length > 0}>Remove</button></div>
      </div>
      <small className="grading-path">Path: {categoryPath(category, detail.categories)}</small>
      {categoryOpen && categoryParent===category.id && <div className="grading-children">{renderCategoryForm(category)}</div>}
      {children.length > 0 && <div className="grading-children">{children.map(child => renderCategoryBranch(child, depth + 1))}</div>}
    </div>;
  };

  return <div className={`portal-layout ${sidebarCollapsed ? "sidebar-collapsed" : ""}`} data-bs-theme={theme} style={{"--school-primary": user.school.primaryColor} as import("react").CSSProperties}><aside className={`sidebar ${classNavOpen && !sidebarCollapsed ? "sidebar-classes-expanded" : ""}`}><button type="button" className="sidebar-pin-toggle" aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => { const next = !sidebarCollapsed; setSidebarCollapsed(next); window.localStorage.setItem("saga-sidebar-collapsed", String(next)); }}><span aria-hidden="true">{sidebarCollapsed ? "☰" : "◧"}</span><span className="sidebar-toggle-label">{sidebarCollapsed ? "Expand menu" : "Collapse menu"}</span></button><a className="sidebar-brand" href={`/${encodeURIComponent(user.school.slug)}/overview`} aria-label={`${user.school.shortName} SAGA Portal overview`}><img className="sidebar-app-mark" src="/favicon.svg" alt="" width="38" height="38"/><span><strong>{user.school.shortName}</strong><small>SAGA PORTAL</small></span></a><div className="sidebar-label">WORKSPACE</div><button className={`side-link ${tab === "overview" ? "selected" : ""}`} onClick={() => navigatePage("overview")}><span className="nav-glyph">▦</span>Overview</button>{teacher && <div className="sidebar-nav-group"><button className={`side-link sidebar-classes-toggle ${tab === "classes" ? "selected" : ""}`} aria-expanded={classNavOpen} aria-controls="sidebar-class-list" onClick={toggleClassNav}><span className="nav-glyph">▤</span><span className="sidebar-nav-text">My classes</span><span className="sidebar-nav-caret" aria-hidden="true">{classNavOpen ? "⌄" : "›"}</span></button>{classNavOpen && !sidebarCollapsed && <div className="sidebar-class-list" id="sidebar-class-list">{subjects.length ? subjects.map(subject=><button type="button" key={subject.id} className={`sidebar-class-link ${tab === "classes" && activeId === subject.id ? "selected" : ""}`} onClick={()=>openSidebarClass(subject.id)}><span className="sidebar-class-link-copy"><b>{subject.classId || subject.code}</b><small>{subject.classId ? `${subject.code} · ` : ""}{subject.title}</small></span><em>{subject._count?.enrollments || 0}</em></button>) : <span className="sidebar-class-empty">No classes yet.</span>}</div>}</div>}{teacher && user.isTenantManager && <a className="side-link text-decoration-none" href="/manage"><span className="nav-glyph">⚙</span>Tenant management</a>}{!teacher && <button type="button" className={`side-link ${tab === "simulator" ? "selected" : ""}`} onClick={() => navigatePage("simulator")} title="Try hypothetical grades without changing your records"><span className="nav-glyph">▤</span><span className="sidebar-nav-text">Grade Simulator</span></button>}<button className={`side-link ${tab === "profile" ? "selected" : ""}`} onClick={() => navigatePage("profile")} title="Account and profile settings"><span className="nav-glyph">◉</span>My profile</button><button type="button" className="side-link" title="FAQs, onboarding tour, and manuals" onClick={()=>openHelp("quick")}><span className="nav-glyph">?</span><span className="sidebar-nav-text">Help &amp; guides</span></button><div className="sidebar-bottom"><div className="privacy-mini"><span>✓</span><div><b>Private by default</b><small>Only authorized users can view grades.</small></div></div><div className="sidebar-user"><span className="avatar">{initials(user.fullName)}</span><div className="user-meta"><b>{user.fullName}</b><small>{teacher ? "Teacher" : "Student"}</small></div><button className="logout-button" title="Sign out" onClick={logout}>↗</button></div></div></aside>
    <main className="main-area"><header className="topbar"><div><div className="crumb">{teacher ? "TEACHER SPACE" : "STUDENT SPACE"}<span>/</span>{tab === "profile" ? "PROFILE" : tab === "classes" ? selectedTitle.toUpperCase() : tab === "simulator" ? "GRADE SIMULATOR" : "OVERVIEW"}</div><h1>{tab === "profile" ? "Account settings" : tab === "classes" && teacher ? selectedTitle : tab === "simulator" ? "Grade Simulator" : teacher ? "Teaching overview" : "Academic overview"}</h1></div><div className="topbar-right"><span className="term-pill">Academic records <i>·</i> Private</span><button type="button" className="portal-help-trigger btn btn-outline-secondary btn-sm" onClick={()=>openHelp("quick")} aria-label="Open Help and guides"><span aria-hidden="true">?</span> Help</button><button type="button" className="theme-toggle btn btn-outline-secondary btn-sm" aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"} onClick={toggleTheme}>{theme === "light" ? "◐ Dark" : "☼ Light"}</button><span className="avatar avatar-top">{profileImagePath ? <img src={`/api/media?pathname=${encodeURIComponent(profileImagePath)}`} alt=""/> : initials(user.fullName)}</span></div></header>
      <div className="content-wrap">{(err||notice)&&!(teacher && tab === "classes" && classSection === "record" && detail)&&<div className="portal-toast-stack" aria-live="polite" aria-atomic="false">{err&&<div className="portal-toast error" role="alert"><div><b>Needs attention</b><p>{err}</p>{notificationTarget(err)&&<button className="toast-location" onClick={goToNotificationTarget}>Check {notificationTarget(err)?.label} ↗</button>}</div><button className="toast-dismiss" aria-label="Dismiss error" onClick={()=>setErr("")}>×</button></div>}{notice&&<div className="portal-toast success" role="status"><div><b>Saved</b><p>{notice}</p></div><button className="toast-dismiss" aria-label="Dismiss notification" onClick={()=>setNotice("")}>×</button></div>}</div>}
      {tab === "profile" ? <section className="surface profile-surface"><div className="section-heading"><div><span className="eyebrow">PERSONAL DETAILS</span><h2>Profile information</h2><p className="muted">Manage your profile image, sign-in email, and password.</p></div><span className="profile-avatar">{profileImagePath ? <img src={`/api/media?pathname=${encodeURIComponent(profileImagePath)}`} alt="Profile"/> : initials(user.fullName)}</span></div><div className="profile-media-grid"><div className="profile-media-card"><label className="form-label">Profile picture</label><p className="muted small">Private to your account. JPG, PNG, or WebP up to 3 MB.</p><input className="form-control" type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{void uploadProfileImage("profile",e.currentTarget.files?.[0]);e.currentTarget.value=""}}/></div>{teacher && <div className="profile-media-card"><label className="form-label">School logo</label><p className="muted small">Used on your school’s printed grading sheet. Visible only to signed-in users from this school.</p>{schoolLogoPath && <img className="school-logo-preview" src={`/api/media?pathname=${encodeURIComponent(schoolLogoPath)}`} alt="Current school logo"/>}<input className="form-control" type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{void uploadProfileImage("school-logo",e.currentTarget.files?.[0]);e.currentTarget.value=""}}/></div>}</div><form className="profile-form mt-4" onSubmit={saveProfile}><label className="form-label">Full name</label><input className="form-control" value={profileName} onChange={e => setProfileName(e.target.value)} required maxLength={120}/><label className="form-label mt-3">Sign-in email</label><input className="form-control" value={user.email} readOnly/><label className="form-label mt-3">Role</label><input className="form-control" readOnly value={teacher ? "Teacher" : "Student"}/>{user.studentNumber && <><label className="form-label mt-3">Student number</label><input className="form-control" readOnly value={user.studentNumber}/>{user.courseProgram && <><label className="form-label mt-3">Course / Program</label><input className="form-control" readOnly value={user.courseProgram}/></>}{user.yearLevel && <><label className="form-label mt-3">Year level</label><input className="form-control" readOnly value={user.yearLevel}/></>}</>}<button className="btn btn-primary mt-4" disabled={busy}>Save profile</button></form><ChangeEmailForm schoolId={user.school.id} emailDeliveryEnabled={user.emailDeliveryEnabled}/><div className="account-security-section"><h3>Change password</h3><p className="muted">Use at least 12 characters. A verification code will be sent to your current sign-in email. Changing your password signs out existing sessions.</p><form className="profile-form" onSubmit={changePassword}><label className="form-label">Current password</label><input className="form-control" type="password" autoComplete="current-password" value={passwordCurrent} onChange={e=>setPasswordCurrent(e.target.value)} required maxLength={100}/><label className="form-label mt-3">New password</label><input className="form-control" type="password" autoComplete="new-password" value={passwordNew} onChange={e=>setPasswordNew(e.target.value)} required minLength={12} maxLength={100}/><label className="form-label mt-3">Confirm new password</label><input className="form-control" type="password" autoComplete="new-password" value={passwordConfirm} onChange={e=>setPasswordConfirm(e.target.value)} required minLength={12} maxLength={100}/>{passwordOtpSent && <><label className="form-label mt-3">Six-digit code</label><input className="form-control" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" value={passwordOtp} onChange={e=>setPasswordOtp(e.target.value.replace(/\D/g, "").slice(0,6))} required/></>}<button type={passwordOtpSent ? "submit" : "button"} className="btn btn-primary mt-3" disabled={busy} onClick={!passwordOtpSent ? ()=>void requestPasswordOtp() : undefined}>{passwordOtpSent ? "Verify code and update password" : "Send verification code"}</button></form></div></section> : teacher ? <>{tab === "overview" && <><section className="welcome-strip"><div className="welcome-copy"><span className="eyebrow">YOUR TEACHING DESK</span><h2>Good day, {user.fullName.split(" ")[0]}.</h2><p>Manage class lists, grading rules, and published student results.</p></div><button className="btn btn-light" onClick={() => setCreateOpen(true)}><b>＋</b> Add subject</button><div className="welcome-decoration">✳</div></section><section className="surface student-smart-search"><div className="section-heading"><div><span className="eyebrow">QUICK LOOKUP</span><h2>Smart student search</h2><p className="muted">Search by student name or ID to see their classes and recorded assessment scores. Results follow the school year and term filters.</p></div></div><div className="student-search-controls"><label className="student-search-input"><span>Student name or ID</span><input className="form-control" type="search" value={studentLookupQuery} onChange={event=>setStudentLookupQuery(event.target.value)} placeholder="Start typing a name or student ID…" autoComplete="off"/></label><label><span>School year</span><select className="form-select" value={schoolYearFilter} onChange={event=>setSchoolYearFilter(event.target.value)}><option>All School Years</option>{schoolYears.map(year=><option key={year}>{year}</option>)}</select></label><label><span>Term</span><select className="form-select" value={termFilter} onChange={event=>setTermFilter(event.target.value)}><option>All Terms</option>{terms.map(term=><option key={term}>{term}</option>)}</select></label></div>{studentLookupQuery.trim().length < 2 ? <div className="student-search-hint">Enter at least 2 characters to search your class rosters.</div> : studentLookupBusy ? <div className="student-search-hint" role="status">Searching student records…</div> : studentLookupMatches.length ? <div className="student-search-results"><div className="student-search-count">{studentLookupMatches.length} matching class record{studentLookupMatches.length === 1 ? "" : "s"}{studentLookupMatches.length === 50 ? " · showing first 50" : ""}</div>{studentLookupMatches.map(match=><article className="student-search-result" key={match.enrollmentId}><div className="student-search-result-header"><div><b>{match.studentName}</b><span>{match.studentNumber || "No student ID"} · {match.class.classId ? `${match.class.classId} · ` : ""}{match.class.code} — {match.class.title}</span><small>{match.class.term} · {match.class.academicYear} · {match.class.status === "VERIFIED" ? "Final" : match.class.status === "SUBMITTED" ? "Provisional" : "Draft"}</small></div><div className="student-search-grade"><strong>{match.finalPercent === null ? "—" : `${match.finalPercent.toFixed(2)}%`}</strong><small>{match.finalGrade || match.finalRemark}</small></div><button type="button" className="btn btn-sm btn-outline-primary" onClick={()=>openStudentSearchMatch(match)}>Open scorebook</button></div>{match.records.length ? <div className="student-search-records">{match.records.map(record=><div className="student-search-record" key={record.id}><span><b>{record.title}</b><small>{record.category || "Uncategorized"}</small></span><strong>{record.remark || (record.points === null ? "Not entered" : `${record.points} / ${record.maxScore}`)}</strong></div>)}</div> : <div className="student-search-hint">No assessment items have been added to this class.</div>}</article>)}</div> : <div className="student-search-hint">No matching students found for these filters.</div>}</section><div className="overview-report-heading"><div><span className="eyebrow">TEACHER DASHBOARD</span><h2>Overview</h2><p className="muted">Choose a date range for activity and attendance metrics.</p></div><div className="overview-date-controls"><label>From<input className="form-control form-control-sm" type="date" value={overviewFrom} max={overviewTo || undefined} onChange={event=>setOverviewFrom(event.target.value)}/></label><label>To<input className="form-control form-control-sm" type="date" value={overviewTo} min={overviewFrom || undefined} onChange={event=>setOverviewTo(event.target.value)}/></label><button type="button" className="btn btn-outline-primary btn-sm" onClick={()=>{setOverviewTo(todayDateInput());setOverviewFrom(shiftDateInput(todayDateInput(),-29))}}>Last 30 days</button></div></div>
{overviewFrom > overviewTo ? <div className="inline-empty">The start date must be on or before the end date.</div> : overviewLoading && !overviewData ? <div className="overview-loading" role="status"><span className="spinner-border spinner-border-sm"/> Loading learning activity…</div> : overviewData && <>
<div className="overview-stat-grid">
  <article className="surface overview-stat-card accent-violet"><small>ACTIVE CLASSES</small><strong>{overviewData.stats.activeClasses}</strong><span>Classes assigned to you</span></article>
  <article className="surface overview-stat-card accent-cyan"><small>ACTIVE STUDENTS</small><strong>{overviewData.stats.activeStudents}</strong><span>Unique enrolled students</span></article>
  <article className="surface overview-stat-card accent-blue"><small>ACTIVITIES</small><strong>{overviewData.stats.activities}</strong><span>Scheduled in selected range</span></article>
  <article className="surface overview-stat-card accent-violet"><small>TESTS</small><strong>{overviewData.stats.tests}</strong><span>Exams and tests in selected range</span></article>
  <article className="surface overview-stat-card accent-cyan"><small>PENDING REVIEWS</small><strong>{overviewData.stats.pendingReviews}</strong><span>Provisional classes awaiting confirmation</span></article>
  <article className="surface overview-stat-card accent-blue"><small>ATTENDANCE LOGS</small><strong>{overviewData.stats.attendanceLogs}</strong><span>Attendance marks recorded in range</span></article>
</div>
<div className="overview-section-heading"><div><span className="eyebrow">REPORTS</span><h2>Learning activity</h2></div><span>Based on {new Date(`${overviewFrom}T00:00:00`).toLocaleDateString()} – {new Date(`${overviewTo}T00:00:00`).toLocaleDateString()}</span></div>
<div className="overview-chart-grid">
  <article className="surface overview-chart-card"><h3>Attendance</h3><p>Present, absent, and excused records.</p><div className="overview-pie-wrap"><div className="overview-pie-chart" role="img" aria-label={`Attendance: ${overviewData.attendance.present} present, ${overviewData.attendance.absent} absent, ${overviewData.attendance.excused} excused`} style={{background:pieGradient([overviewData.attendance.present,overviewData.attendance.absent,overviewData.attendance.excused],["#10a477","#e5252a","#5144dc"])}}/></div><div className="overview-chart-legend"><span><i className="legend-present"/>Present <b>{overviewData.attendance.present}</b></span><span><i className="legend-absent"/>Absent <b>{overviewData.attendance.absent}</b></span><span><i className="legend-excused"/>Excused <b>{overviewData.attendance.excused}</b></span></div></article>
  <article className="surface overview-chart-card"><h3>Grade submissions</h3><p>Current class record statuses.</p><div className="overview-pie-wrap"><div className="overview-pie-chart" role="img" aria-label={`Grade records: ${overviewData.submissions.draft} draft, ${overviewData.submissions.provisional} provisional, ${overviewData.submissions.final} final`} style={{background:pieGradient([overviewData.submissions.draft,overviewData.submissions.provisional,overviewData.submissions.final],["#3782f6","#12b981","#f04448"])}}/></div><div className="overview-chart-legend"><span><i className="legend-submitted"/>Draft <b>{overviewData.submissions.draft}</b></span><span><i className="legend-graded"/>Provisional <b>{overviewData.submissions.provisional}</b></span><span><i className="legend-retake"/>Final <b>{overviewData.submissions.final}</b></span></div></article>
  <article className="surface overview-chart-card overview-enrollment-card"><h3>Class enrollment</h3><p>Student count by class ID or course code.</p>{overviewData.enrollment.length ? <div className="overview-bar-chart" role="img" aria-label="Student enrollment by class">{[...overviewData.enrollment].sort((a,b)=>b.count-a.count).slice(0,8).map(item=>{const highest=Math.max(1,...overviewData.enrollment.map(row=>row.count));return <div className="overview-bar-item" key={item.id} title={`${item.label} · ${item.code} — ${item.title}: ${item.count} students`}><div className="overview-bar-track"><span style={{height:`${Math.max(item.count ? 5 : 0,item.count/highest*100)}%`}}/></div><small><b>{item.label}</b><span>{item.count} students</span></small></div>})}</div> : <div className="overview-chart-empty">Add students to your class rosters to see enrollment.</div>}</article>
</div>
<div className="overview-section-heading upcoming-heading"><div><span className="eyebrow">COMING UP</span><h2>Upcoming work</h2></div><span>Scheduled from today onward</span></div>
<div className="overview-upcoming-grid">
  <article className="surface overview-upcoming-card">
    <h3>Upcoming attendance</h3><p>Scheduled meetings, attendance type, and recording progress.</p>
    <div className="today-attendance-shortcuts"><div className="today-attendance-heading"><b>Classes scheduled today</b><small>{overviewData.todayClasses.length ? new Date(`${overviewData.today}T00:00:00`).toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"}) : "Quick access for today’s class meetings"}</small></div>
      {overviewData.todayClasses.some(item=>item.canRecordAttendance) ? <div className="today-attendance-list">{overviewData.todayClasses.filter(item=>item.canRecordAttendance).map(item=><button type="button" className="today-attendance-button" key={item.id} onClick={()=>openClass(item.id, "attendance", { attendanceToday: true })}><span><b>{item.classId || item.code} · {item.title}</b><small>{item.schedule.join(" · ")}</small></span><strong>Record attendance <span aria-hidden="true">→</span></strong></button>)}</div> : overviewData.todayClasses.length ? <div className="today-attendance-empty">All classes scheduled today are finalized.</div> : <div className="today-attendance-empty">No classes match a saved schedule for today.</div>}
    </div>
    {overviewData.upcoming.attendance.length ? <ul className="overview-work-list">{overviewData.upcoming.attendance.map(item=><li key={item.id}><button type="button" className="overview-work-item attendance" onClick={()=>openClass(item.subjectId, "attendance")}><span className="overview-work-copy"><b>{item.title}</b><small>{item.code} · {item.subjectTitle}</small><span className="overview-work-meta"><i>{item.attendanceType==="ONLINE"?"Online":item.attendanceType==="FACE_TO_FACE"?"Face-to-Face":"Type not set"}</i>{item.scheduleOverrideReason&&<i className="makeup">Make-up · {item.scheduleOverrideReason}</i>}{(()=>{const marked=item.markedCount||0;const total=item.studentCount||0;const complete=total>0&&marked>=total;return <i className={marked===0?"status pending":complete?"status complete":"status progress"}>{marked===0?"Not recorded":complete?"Recorded":`${marked}/${total} marked`}</i>})()}</span></span><time>{formatOverviewDate(item.date)}</time></button></li>)}</ul> : <div className="overview-chart-empty">No attendance days are scheduled from today onward.</div>}
  </article>
  <article className="surface overview-upcoming-card"><h3>Upcoming assessments</h3><p>Dated activities and tests in your classes.</p>{overviewData.upcoming.assessments.length ? <ul className="overview-work-list">{overviewData.upcoming.assessments.map(item=><li key={item.id}><button type="button" className="overview-work-item" onClick={()=>openClass(item.subjectId, "items")}><span className="overview-work-copy"><b>{item.title}</b><small>{item.code} · {item.subjectTitle}</small></span><time>{formatOverviewDate(item.date)}</time></button></li>)}</ul> : <div className="overview-chart-empty">Nothing scheduled yet.</div>}</article>
</div>
{overviewLoading && <div className="overview-refresh-note" role="status">Updating report…</div>}
</>}
<section className="section-block"><div className="section-heading"><div><h2>Your subjects</h2><p className="muted">Open a class to manage rosters and grades.</p></div><button className="btn btn-outline-primary btn-sm" onClick={() => navigatePage("classes")}>Manage classes <span>→</span></button></div><p className="muted small dashboard-filter-note">Class cards use the school year and term filters in Smart Student Search above.</p>{visibleSubjects.length ? <><div className="subject-grid">{pageSubjects.map((s, i) => <button key={s.id} className="subject-card" onClick={() => openClass(s.id, "setup")}><div className={`subject-band band-${i%4}`}><span>{s.code} <small className="class-id-badge">{s.classId || "No Class ID"}</small></span><span className="subject-symbol">{["◌","⌁","▧","✳"][i%4]}</span></div><div className="subject-card-body"><div className="subject-card-title">{s.title}</div><div className="subject-metadata">{s.courseYear || "Class"} <span>·</span> {s.term} {s.academicYear}</div><div className="subject-card-footer"><span>♙ {s._count?.enrollments || 0} students</span><span className={`publish-state ${s.gradeStatus === "VERIFIED" ? "is-live" : ""}`}>{s.gradeStatus === "VERIFIED" ? "Final" : s.gradeStatus === "SUBMITTED" ? "Provisional · awaiting Registrar confirmation" : "Draft"}</span></div></div></button>)}</div>{subjectPageCount > 1 && <div className="list-pagination"><span>Showing {(subjectPage - 1) * subjectsPerPage + 1}–{Math.min(subjectPage * subjectsPerPage, visibleSubjects.length)} of {visibleSubjects.length} subjects</span><div><button className="btn btn-outline-secondary btn-sm" disabled={subjectPage <= 1} onClick={() => setSubjectPage(page => page - 1)}>Previous</button><span>Page {subjectPage} of {subjectPageCount}</span><button className="btn btn-outline-secondary btn-sm" disabled={subjectPage >= subjectPageCount} onClick={() => setSubjectPage(page => page + 1)}>Next</button></div></div>}</> : <div className="empty-state"><div className="empty-icon">▤</div><h3>{subjects.length ? "No classes match these filters" : "Your classes will show here"}</h3><p>{subjects.length ? "Change the school year or term to see more classes." : "Create your first subject to start building a class roster and gradebook."}</p>{!subjects.length&&<button className="btn btn-primary" onClick={() => setCreateOpen(true)}>Add your first subject</button>}</div>}</section></>}
      {tab === "classes" && <>
        <div className="class-toolbar">
          <div className="class-filter-row"><label>School year<select className="form-select" value={schoolYearFilter} onChange={e=>setSchoolYearFilter(e.target.value)}><option>All School Years</option>{schoolYears.map(year=><option key={year}>{year}</option>)}</select></label><label>Term<select className="form-select" value={termFilter} onChange={e=>setTermFilter(e.target.value)}><option>All Terms</option>{terms.map(term=><option key={term}>{term}</option>)}</select></label></div>
          <label className="class-student-filter"><span>Find student in this class</span><input className="form-control" type="search" value={classStudentFilter} onChange={event=>setClassStudentFilter(event.target.value)} placeholder="Name or student ID" autoComplete="off"/></label>
          <div className="class-select-wrap"><label className="form-label" htmlFor="my-classes-select">My Classes</label><select id="my-classes-select" className="form-select" value={activeId} disabled={!visibleSubjects.length} onChange={e => { if (e.target.value) openClass(e.target.value, "setup", {}, true); }}><option value="">Choose a class…</option>{pageClassOptions.map(s => <option key={s.id} value={s.id}>{s.classId ? `${s.classId} · ` : ""}{s.code} — {s.title}</option>)}</select>{classPageCount > 1 && <div className="class-select-pages"><button type="button" className="btn btn-link btn-sm" disabled={classPage <= 1} onClick={() => setClassPage(page => page - 1)}>Previous</button><small>Page {classPage} of {classPageCount}</small><button type="button" className="btn btn-link btn-sm" disabled={classPage >= classPageCount} onClick={() => setClassPage(page => page + 1)}>Next</button></div>}</div>
          <div className="toolbar-actions"><button type="button" className="btn btn-outline-primary grade-visibility-launch" disabled={!subjects.length} onClick={() => setVisibilityManagerQuery("")}><span>Manage grade visibility</span><small>{visibleClassCount} / {subjects.length} shown</small></button><button className="btn btn-outline-primary" onClick={exportRoster} disabled={!detail}>↓ Export roster (Excel)</button><button className="btn btn-outline-primary" onClick={() => setRosterOpen(true)} disabled={!detail}>＋ Add students</button></div>
        </div>
        {!visibleSubjects.length && <div className="empty-state"><div className="empty-icon">▤</div><h3>No classes match these filters</h3><p>Change the school year or term selection to see your class list.</p></div>}
        {visibleSubjects.length > 0 && !activeId && <div className="empty-state"><div className="empty-icon">▤</div><h3>Opening your class…</h3><p>Loading the first class that matches the selected school year and term.</p></div>}
        {detail && <>
          <section className="surface class-summary"><div><span className="eyebrow">{detail.courseYear || "CLASS RECORD"} · {detail.term} {detail.academicYear}</span><h2>{detail.code}: {detail.title}</h2><p className="muted mb-0">Class ID: <b>{detail.classId || "Not set"}</b> · {formatSchedule(detail.schedule) || "Schedule not set"} · {detail.enrollments.length} rostered students</p></div><div className="class-final-actions"><button type="button" className="btn btn-outline-primary grade-visibility-current" onClick={() => setVisibilityManagerQuery(detail.classId || detail.code)}>{detail.isPublished ? "Visible to students" : "Hidden from students"} · Manage</button><span className={`grade-status-pill ${detail.gradeStatus === "VERIFIED" ? "final" : detail.gradeStatus === "SUBMITTED" ? "provisional" : "draft"}`}>{detail.gradeStatus === "VERIFIED" ? "Verified to Registrar · Final" : detail.gradeStatus === "SUBMITTED" ? "Awaiting teacher confirmation to Registrar" : "Draft · Not submitted"}</span><button className="btn btn-outline-primary" onClick={()=>openClassSection("final")}>Final grades</button><button className="btn btn-outline-primary" onClick={openSubjectEditor} disabled={detail.gradeStatus!=="DRAFT"}>Edit class</button><button className="btn btn-outline-danger" onClick={deleteSubject} disabled={busy||detail.gradeStatus!=="DRAFT"}>Delete class</button></div></section>
          <nav className="class-section-tabs" aria-label="Class workspace">
            <button className={classSection === "setup" ? "active" : ""} onClick={() => openClassSection("setup")}>Grading setup</button><button className={classSection === "roster" ? "active" : ""} onClick={() => openClassSection("roster")}>Class roster</button><button className={classSection === "items" ? "active" : ""} onClick={() => openClassSection("items")}>Assessment items</button><button className={classSection === "record" ? "active" : ""} onClick={() => openClassSection("record")}>Record scores</button>
            <button className={classSection === "attendance" ? "active" : ""} onClick={() => openClassSection("attendance")}>Attendance</button>
            <button className={classSection === "analytics" ? "active" : ""} onClick={() => openClassSection("analytics")}>Class analytics</button>
            <button className={classSection === "final" ? "active" : ""} onClick={() => openClassSection("final")}>Final grades &amp; submit</button>
          </nav>
          {classSection === "setup" && <>
            <section id="class-section-setup" className="surface grading-card">
              <div className="section-heading grading-setup-heading">
                <div><span className="eyebrow">GRADING PATH</span><h2>Build your grading categories</h2><p className="muted">Choose whether the subject is Lecture only or combines Lecture and Laboratory. Every group’s assessments are weighted within that group.</p></div>
                <div className="grading-actions"><select className="form-select form-select-sm" aria-label="Copy grading setup from class" aria-describedby="copy-setup-help" value={copyFromId} onChange={e=>setCopyFromId(e.target.value)} disabled={detail.assessments.length>0}><option value="">Choose a class to copy grading setup from…</option>{subjects.filter(s=>s.id!==detail.id).map(s=><option key={s.id} value={s.id}>{s.classId ? `${s.classId} · ` : ""}{s.code} — {s.title}</option>)}</select><button className="btn btn-outline-primary btn-sm" onClick={copyGrading} disabled={busy||!copyFromId||detail.assessments.length>0}>Copy setup</button><button className="btn btn-primary btn-sm" onClick={()=>{setCategoryParent("");setCategoryWeight(String(remainingWeight(null)));setCategoryOpen(true);}}>＋ Parent category</button><button className="btn btn-success btn-sm" onClick={saveWeights} disabled={busy}>Save grading path</button><small className="copy-setup-help" id="copy-setup-help">Choose another class from the list, then click Copy setup. This replaces the current categories and grade scale; assessment items and scores are not copied.{detail.assessments.length>0 ? " Copy setup is disabled because this class already has assessment items. Use a grading template to safely remap recognized items while preserving scores." : " Copying is available before assessment items are added."}</small></div>
              </div>
              <div className="grading-template-picker"><label className="grading-type-select"><b>Class grading setup</b><select className="form-select" value={gradingSetupType} onChange={e=>setGradingSetupType(e.target.value as "SINGLE" | "COMBINED")}><option value="SINGLE">Lecture or Laboratory</option><option value="COMBINED">Lecture and Laboratory</option></select><small>Choose one structure for this class.</small></label>{gradingSetupType==="SINGLE"?<div className="grading-split-inputs single-group-select"><label>100% group<select className="form-select form-select-sm" value={singleGroupType} onChange={e=>setSingleGroupType(e.target.value as "LECTURE" | "LABORATORY")}><option value="LECTURE">Lecture</option><option value="LABORATORY">Laboratory</option></select></label><button type="button" className="btn btn-outline-primary btn-sm" onClick={()=>applyGradingTemplate(singleGroupType==="LECTURE"?"LECTURE_ONLY":"LABORATORY_ONLY")} disabled={busy||detail.gradeStatus!=="DRAFT"}>Apply 100% setup</button></div>:<div className="grading-split-inputs"><label>Lecture<input className="form-control form-control-sm" type="number" min="1" max="99" step="0.5" value={lectureCourseWeight} onChange={e=>setLectureCourseWeight(e.target.value)} aria-label="Lecture course weight percentage"/>%</label><label>Laboratory<input className="form-control form-control-sm" type="number" min="1" max="99" step="0.5" value={laboratoryCourseWeight} onChange={e=>setLaboratoryCourseWeight(e.target.value)} aria-label="Laboratory course weight percentage"/>%</label><span className={Math.abs(Number(lectureCourseWeight)+Number(laboratoryCourseWeight)-100)>0.01?"invalid":"valid"}>Total: {(Number(lectureCourseWeight)+Number(laboratoryCourseWeight)).toFixed(2)}%</span><button type="button" className="btn btn-outline-success btn-sm" onClick={()=>applyGradingTemplate("LECTURE_LAB")} disabled={busy||detail.gradeStatus!=="DRAFT"||Math.abs(Number(lectureCourseWeight)+Number(laboratoryCourseWeight)-100)>0.01}>Apply setup</button></div>}</div>
              <div className="grading-howto"><b>Example:</b> Lecture only uses Lecture 100%, with Major Examinations 50%, Self-Evaluation Exercises 25%, Quizzes/Assignments 15%, and Attendance/Class Participation 10%. Major Examinations 50% divides into Prelim 10%, Midterm 15%, and Finals 25% (these allocations total the parent’s 50%). For classes with a Laboratory, set the Lecture and Laboratory shares to a total of 100% (for example, 60% + 40%); each group’s assessments are then divided within its own 100%.</div>
              {categoryOpen && !categoryParent && renderCategoryForm(null)}
              {detail.categories.filter(category=>!category.parentId).length ? <div className="grading-tree">{detail.categories.filter(category=>!category.parentId).map(category=>renderCategoryBranch(category))}</div> : <div className="inline-empty">Choose Lecture only (100%) or Lecture + Laboratory above to create the course groups. Then divide each group into its assessment categories.</div>}
              <div className="weight-group-checks">{weightGroups.map(group=><span key={group.label} className={Math.abs(group.total-group.expected)>0.01?"invalid":"valid"}>{group.label}: <b>{group.total.toFixed(2)}% / {group.expected.toFixed(2)}%</b>{Math.abs(group.total-group.expected)>0.01?" · allocation incomplete":" · complete"}</span>)}</div>
              <div className="grading-next-step"><b>Next:</b> Save the grading path, then open <button type="button" onClick={()=>setClassSection("items")}>Assessment items</button> to add items under the matching category, then enter each perfect score. Score entry uses this path automatically.</div>
            </section>
            <section className="surface grading-card scale-card"><div className="section-heading"><div><h2>Final-grade equivalents</h2><p className="muted">Set this class’s percentage thresholds and grade equivalents to match the school grading scale.</p></div><div className="grading-actions"><button className="btn btn-outline-primary btn-sm" onClick={()=>setDetail({...detail,gradeBands:[...detail.gradeBands,{id:`draft-${Date.now()}-${Math.random()}`,minPercent:0,finalGrade:"",remarks:""}]})}>＋ Add grade equivalent</button><button className="btn btn-primary btn-sm" onClick={saveGradeBands} disabled={busy}>Save grade scale</button></div></div><div className="scale-table"><div className="scale-header"><span>MINIMUM %</span><span>FINAL GRADE</span><span>REMARKS</span></div>{detail.gradeBands.slice().sort((a,b)=>b.minPercent-a.minPercent).map(band=><div className="scale-row" key={band.id}><div className="input-group"><input className="form-control" type="number" min="0" max="100" step="0.01" value={band.minPercent} onChange={e=>setDetail({...detail,gradeBands:detail.gradeBands.map(x=>x.id===band.id?{...x,minPercent:Number(e.target.value)}:x)})}/><span className="input-group-text">%</span></div><input className="form-control" value={band.finalGrade} onChange={e=>setDetail({...detail,gradeBands:detail.gradeBands.map(x=>x.id===band.id?{...x,finalGrade:e.target.value}:x)})}/><input className="form-control" value={band.remarks} onChange={e=>setDetail({...detail,gradeBands:detail.gradeBands.map(x=>x.id===band.id?{...x,remarks:e.target.value}:x)})}/><button type="button" className="btn btn-outline-danger btn-sm" aria-label="Remove grade equivalent" onClick={()=>setDetail({...detail,gradeBands:detail.gradeBands.filter(x=>x.id!==band.id)})}>×</button></div>)}</div><div className="privacy-note text-start mt-3">This scale applies to this class. Adjust the equivalent values to match your school’s grading policy. Exactly one band must start at 0%.</div></section>
          </>}
          {classSection === "roster" && <section id="class-section-roster" className="surface gradebook-card roster-management"><div className="section-heading"><div><span className="eyebrow">CLASS MANAGEMENT</span><h2>Class roster</h2><p className="muted">Update student names and IDs, or remove class records.</p></div><div className="roster-toolbar-actions"><button className="btn btn-outline-primary" onClick={()=>printClass("roster")} disabled={!detail.enrollments.length}>Print roster</button><button className="btn btn-primary" onClick={()=>setRosterOpen(true)}>＋ Add students</button></div></div><div className="table-scroll"><table className="table grade-table"><thead><tr><th>#</th><th>STUDENT NAME</th><th>STUDENT ID</th><th>ACTIONS</th></tr></thead><tbody>{pageEnrollments.map((en,index)=><tr key={en.id}><td>{(rosterPage - 1) * rosterPerPage + index + 1}</td><td><b>{en.studentName}</b></td><td>{en.studentNumber||"—"}</td><td><div className="roster-row-actions"><button className="btn btn-outline-primary btn-sm" disabled={busy||detail.gradeStatus==="VERIFIED"} onClick={()=>setRosterEdit({id:en.id,studentName:en.studentName,studentNumber:en.studentNumber||""})}>Edit</button><button className="btn btn-outline-danger btn-sm" disabled={busy||detail.gradeStatus==="VERIFIED"} onClick={()=>deleteRosterStudent(en)}>Remove</button></div></td></tr>)}</tbody></table></div>{rosterPageCount > 1 && <div className="list-pagination"><span>Showing {(rosterPage - 1) * rosterPerPage + 1}–{Math.min(rosterPage * rosterPerPage, filteredEnrollments.length)} of {filteredEnrollments.length} students</span><div><button className="btn btn-outline-secondary btn-sm" disabled={rosterPage <= 1} onClick={() => setRosterPage(page => page - 1)}>Previous</button><span>Page {rosterPage} of {rosterPageCount}</span><button className="btn btn-outline-secondary btn-sm" disabled={rosterPage >= rosterPageCount} onClick={() => setRosterPage(page => page + 1)}>Next</button></div></div>}{detail.enrollments.length === 0 ? <div className="inline-empty">No students are in this class yet. Use Add students to build the roster.</div> : filteredEnrollments.length === 0 ? <div className="inline-empty">No students match this name or ID filter.</div> : null}<div className="privacy-note text-start mt-3">Students are matched to their portal account by student ID. The student account itself is never deleted by roster removal.</div></section>}
          {classSection === "items" && <section className="surface gradebook-card">
            <div className="section-heading"><div><h2>Assessment items</h2><p className="muted">Items are grouped by category. Large groups start collapsed so long attendance histories stay quick to scan; expand a group when you need to edit its items. Attendance is tracked as Present, Absent, or Excused—not points.</p></div><div className="grading-actions"><button className="btn btn-outline-primary btn-sm" onClick={saveAssessmentItems} disabled={busy||!detail.assessments.length}>Save items</button><button className="btn btn-outline-primary" onClick={()=>void addAttendanceSession()} disabled={busy}>＋ Attendance day</button><button className="btn btn-primary" onClick={() => setAssessmentOpen(true)}>＋ Add assessment</button></div></div>
            {detail.assessments.length ? <div className="assessment-category-groups">{assessmentItemGroups.map(({category,items})=>{const expanded=assessmentCategoryOverrides[category.id]??items.length<=12;return <section className="assessment-category-group" key={category.id}>
              <button type="button" className="assessment-category-toggle" aria-expanded={expanded} onClick={()=>setAssessmentCategoryOverrides(current=>({...current,[category.id]:!expanded}))}><span className="assessment-category-name">{categoryPath(category,detail.categories)}</span><span className="assessment-category-count">{items.length} {items.length===1?"item":"items"}</span><span className="assessment-category-action">{expanded?"Hide items":"Show items"}</span></button>
              {expanded&&<div className="assessment-list">{items.map(item=>{const attendanceItem=item.title.toLocaleLowerCase().startsWith("attendance ·");return <article className="assessment-list-row" key={item.id}>
                <div><input className="form-control" aria-label="Assessment title" value={item.title} onChange={e=>setDetail(current=>current?{...current,assessments:current.assessments.map(value=>value.id===item.id?{...value,title:e.target.value}:value)}:current)} onBlur={saveAssessmentItems}/><label className="item-category-label">Category<select className="form-select form-select-sm item-category-select" value={item.categoryId} onChange={e=>setDetail(current=>current?{...current,assessments:current.assessments.map(value=>value.id===item.id?{...value,categoryId:e.target.value}:value)}:current)} onBlur={saveAssessmentItems}>{recordCategories.map(value=><option key={value.id} value={value.id}>{categoryPath(value,detail.categories)}</option>)}</select></label></div>
                {attendanceItem ? <><div className="attendance-day-note"><b>Class day · not point-based</b><small>{item.scheduleOverrideReason ? `Schedule override: ${item.scheduleOverrideReason}` : "Matches the saved class schedule"}</small></div><label>Date<input className="form-control" aria-label="Attendance class date" type="date" value={item.dueDate?.slice(0,10) ?? ""} onChange={e=>setDetail(current=>current?{...current,assessments:current.assessments.map(value=>value.id===item.id?{...value,dueDate:e.target.value||null}:value)}:current)} onBlur={saveAssessmentItems}/></label><label>Off-schedule reason (if needed)<input className="form-control" aria-label="Attendance schedule override reason" placeholder="e.g. Make-up class" value={item.scheduleOverrideReason ?? ""} onChange={e=>setDetail(current=>current?{...current,assessments:current.assessments.map(value=>value.id===item.id?{...value,scheduleOverrideReason:e.target.value}:value)}:current)} onBlur={saveAssessmentItems}/></label></> : <><label>Perfect score<input className="form-control" aria-label="Maximum points" type="number" min="0.01" step="0.01" value={item.maxScore} onChange={e=>setDetail(current=>current?{...current,assessments:current.assessments.map(value=>value.id===item.id?{...value,maxScore:Number(e.target.value)}:value)}:current)} onBlur={saveAssessmentItems}/></label><label>Item weight (%)<input className="form-control" aria-label="Item weight percentage" type="number" min="0" max="100" step="0.5" placeholder="Auto by points" value={item.weight ?? ""} onChange={e=>setDetail(current=>current?{...current,assessments:current.assessments.map(value=>value.id===item.id?{...value,weight:e.target.value===""?null:Number(e.target.value)}:value)}:current)} onBlur={saveAssessmentItems}/></label><label>Date<input className="form-control" aria-label="Assessment date" type="date" value={item.dueDate?.slice(0,10) ?? ""} onChange={e=>setDetail(current=>current?{...current,assessments:current.assessments.map(value=>value.id===item.id?{...value,dueDate:e.target.value||null}:value)}:current)} onBlur={saveAssessmentItems}/></label></>}
                <button className="btn btn-link btn-sm text-danger" onClick={()=>removeAssessment(item.id)}>Remove</button></article>})}</div>}
            </section>})}</div> : <div className="inline-empty">No assessment items yet. Add a Quiz 1, Assignment 1, Lab Exercise 1, or exam.</div>}
          </section>}
          {classSection === "attendance" && <section id="class-section-attendance" className="surface gradebook-card attendance-workspace">
            <div className="section-heading"><div><span className="eyebrow">CLASS MEETINGS</span><h2>Attendance</h2><p className="muted">Attendance is counted by scheduled class day. Present, absent, and excused totals update per student; excused days are excluded from the absence rate.</p></div><button className="btn btn-primary" onClick={()=>void addAttendanceSession()} disabled={busy||detail.gradeStatus==="VERIFIED"}>＋ Add attendance day</button></div>
            {attendanceSaveState !== "idle" && <div className={`small mb-2 ${attendanceSaveState === "error" ? "text-danger" : "text-secondary"}`} role="status" aria-live="polite">
              {attendanceSaveState === "pending" ? "Attendance changes queued…" : attendanceSaveState === "saving" ? "Saving attendance…" : attendanceSaveState === "saved" ? "✓ Attendance saved" : "Attendance changes could not be saved."}
              {attendanceSaveState === "error" && <button type="button" className="btn btn-link btn-sm" onClick={() => { attendanceFailedRef.current = false; void flushAttendanceMarks(); }}>Retry saving</button>}
            </div>}
            <div className="privacy-note text-start mb-3">Scheduled days: {scheduleWeekdays(detail.schedule).map(day=>["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][day]).join(", ") || "No class days set"}. An off-schedule meeting requires a make-up class reason.</div>
            {(()=>{const alerted=filteredEnrollments.map(enrollment=>({enrollment,summary:attendanceSummary(enrollment,detail.assessments)})).filter(item=>item.summary.alertLevel!=="none");const critical=alerted.filter(item=>item.summary.alertLevel==="critical").length;const early=alerted.length-critical;return <section className="attendance-alert-panel" aria-label="Attendance monitoring overview"><div className="attendance-alert-header"><div><span className="attendance-alert-eyebrow">ATTENDANCE OVERVIEW</span><b>Monitoring alerts</b><small>Early warning starts at 10% absent. High risk is above 20%; excused days are excluded.</small></div><div className="attendance-alert-summary"><span className="attendance-alert-total"><b>{alerted.length}</b><small>{alerted.length===1?"student flagged":"students flagged"}</small></span><span className="attendance-alert-count early"><i></i>{early} early</span><span className="attendance-alert-count critical"><i></i>{critical} high risk</span></div></div>{alerted.length?<div className="attendance-alert-list">{alerted.map(({enrollment,summary})=><article key={enrollment.id} className={`attendance-alert-item ${summary.alertLevel}`}><div className="attendance-alert-person"><b>{enrollment.studentName}</b><span className={`attendance-alert-badge ${summary.alertLevel}`}>{summary.alertLevel==="critical"?"High risk":"Early warning"}</span></div><div className="attendance-alert-detail"><span>{summary.absent} absent of {summary.present+summary.absent} counted days</span><b>{summary.absencePercent?.toFixed(1)}%</b></div><div className="attendance-alert-meter" role="presentation"><span style={{width:`${Math.min(100,summary.absencePercent??0)}%`}} /></div></article>)}</div>:<div className="attendance-alert-clear"><span aria-hidden="true">✓</span><div><b>No attendance alerts</b><small>No students in the current roster filter have reached the 10% absence threshold.</small></div></div>}</section>})()}{detail.assessments.filter(item=>item.title.toLocaleLowerCase().startsWith("attendance ·")).sort((a,b)=>(b.dueDate||"").localeCompare(a.dueDate||"")).length ? <div className="table-scroll"><table className="table grade-table ecr-table attendance-table"><thead><tr><th>STUDENT</th><th>SUMMARY</th>{detail.assessments.filter(item=>item.title.toLocaleLowerCase().startsWith("attendance ·")).sort((a,b)=>(b.dueDate||"").localeCompare(a.dueDate||"")).map(item=><th key={item.id}>{item.dueDate ? new Date(item.dueDate).toLocaleDateString() : item.title}<small>{item.attendanceType === "ONLINE" ? "Online" : item.attendanceType === "FACE_TO_FACE" ? "Face-to-Face" : "Type not set"} · {item.scheduleOverrideReason ? `Make-up class: ${item.scheduleOverrideReason}` : "Scheduled class day"}</small></th>)}</tr></thead><tbody>{filteredEnrollments.map(enrollment=>{const summary=attendanceSummary(enrollment,detail.assessments);return <tr key={enrollment.id}><td><b>{enrollment.studentName}</b><small className="d-block text-secondary">{enrollment.studentNumber||"No student ID"}</small></td><td className="attendance-summary"><b>{summary.present}/{summary.present+summary.absent} present · {summary.percent===null?"—":summary.percent.toFixed(1)+"%"}</b><small>P {summary.present} · A {summary.absent} · E {summary.excused}</small>{summary.atRisk&&<span className="absence-risk-badge">DANGER OF FAILING · {summary.absencePercent?.toFixed(1)}% ABSENT</span>}</td>{detail.assessments.filter(item=>item.title.toLocaleLowerCase().startsWith("attendance ·")).sort((a,b)=>(b.dueDate||"").localeCompare(a.dueDate||"")).map(item=>{const score=enrollment.scores.find(value=>value.assessmentId===item.id);const value=score?.remark==="EXCUSED"?"EXCUSED":score?.remark==="ABSENT"?"ABSENT":score?.remark==="PRESENT"||score?.points!=null?"PRESENT":"";return <td key={item.id}><select className="form-select form-select-sm attendance-mark" aria-label={`${enrollment.studentName} ${item.title}`} value={value} onChange={event=>saveAttendanceMark(enrollment.id,item.id,(event.target.value||null) as AttendanceMark["remark"])} disabled={detail.gradeStatus==="VERIFIED"}><option value="">Not marked</option><option value="PRESENT">Present</option><option value="ABSENT">Absent</option><option value="EXCUSED">Excused</option></select></td>})}</tr>})}</tbody></table></div> : <div className="inline-empty">No attendance sessions yet. Add a day that matches this class schedule to start recording attendance.</div>}
            <div className="scorebook-legend"><span><b>Danger indicator</b> appears when absences exceed 20% of non-excused class days.</span><span>To change a class schedule, edit the subject details before recording sessions.</span></div>
          </section>}
          {classSection === "record" && <section id="class-section-record" className="surface gradebook-card scorebook-section" ref={scorebookRegionRef}><div className="section-heading"><div><span className="eyebrow">ELECTRONIC CLASS RECORD</span><h2>Record scores</h2><p className="muted">Enter scores by student and assessment. Each category includes an Equivalent (%) column showing the earned share of its parent Lecture or Laboratory allocation (for example, 93% × 25% = 23.25%). The final course grade also applies the top-level Lecture/Laboratory weights. Changes save when you leave a field. Pending work is not treated as zero.</p></div><div className="scorebook-toolbar"><span className="gradebook-count">{filteredEnrollments.length} of {detail.enrollments.length} students · {detail.assessments.length} items</span><label className="scorebook-contribution-toggle"><input type="checkbox" className="form-check-input" checked={showWeightBreakdown} onChange={event=>setShowWeightBreakdown(event.target.checked)} />Detailed breakdown row</label><button className="btn btn-outline-primary btn-sm" onClick={()=>downloadScoreCsv(true)} disabled={!scorebookAssessments.length}>Download template</button><button className="btn btn-outline-primary btn-sm" onClick={()=>{setBulkScoresOpen(true);setBulkErrors([]);setBulkRowsPreview([]);setBulkOperations([])}} disabled={!scorebookAssessments.length||detail.gradeStatus==="VERIFIED"}>Import scores</button><button className="btn btn-outline-secondary btn-sm" onClick={()=>downloadScoreCsv(false)} disabled={!scorebookAssessments.length}>Export scores</button></div></div>
            {workbookSaveState !== "idle" && <div className={`small mb-2 ${workbookSaveState === "error" ? "text-danger" : "text-secondary"}`} role="status" aria-live="polite">
              {workbookSaveState === "queued" ? "Workbook changes queued…" : workbookSaveState === "saving" ? "Saving workbook…" : workbookSaveState === "saved" ? "✓ Workbook saved" : "Workbook not saved."}
              {workbookSaveState === "error" && <button type="button" className="btn btn-link btn-sm" onClick={() => { workbookFailedRef.current = false; void flushWorkbookScores(); }}>Retry saving</button>}
            </div>}
            {(err||notice)&&<div className="portal-toast-stack" aria-live="polite" aria-atomic="false">{err&&<div className="portal-toast error" role="alert"><div><b>Needs attention</b><p>{err}</p>{notificationTarget(err)&&<button className="toast-location" onClick={goToNotificationTarget}>Check {notificationTarget(err)?.label} ↗</button>}</div><button className="toast-dismiss" aria-label="Dismiss error" onClick={()=>setErr("")}>×</button></div>}{notice&&<div className="portal-toast success" role="status"><div><b>Saved</b><p>{notice}</p></div><button className="toast-dismiss" aria-label="Dismiss notification" onClick={()=>setNotice("")}>×</button></div>}</div>}
            {scorebookAssessments.length > 0 && <div className="scorebook-fitbar" aria-label="Workbook column layout controls">
              <div className="scorebook-fitbar-summary">
                <b>{scorebookView === "auto" ? "Auto-fit workbook" : "Full workbook"}</b>
                <small>{scorebookView === "auto"
                  ? `Showing ${scorebookVisibleAssessments.length} of ${scorebookAssessments.length} assessments · all students and final grades stay visible`
                  : `All ${scorebookAssessments.length} assessments · scroll inside the workbook for additional columns`}</small>
              </div>
              <div className="scorebook-fitbar-tools">
                <label className="scorebook-fit-selector">Layout
                  <select className="form-select form-select-sm" value={scorebookView} aria-label="Workbook column layout"
                    onChange={event => { setScorebookView(event.target.value as "auto" | "all"); setScorebookPage(0); }}>
                    <option value="auto">Auto-fit (recommended)</option>
                    <option value="all">Show all (scroll)</option>
                  </select>
                </label>
                {scorebookView === "auto" && scorebookPages.length > 1 && <div className="scorebook-fit-pages" aria-label="Assessment category navigation">
                  <button type="button" className="btn btn-outline-secondary btn-sm" aria-label="Previous assessment columns"
                    disabled={currentScorebookPage === 0} onClick={() => setScorebookPage(Math.max(0, currentScorebookPage - 1))}>‹</button>
                  <select className="form-select form-select-sm" aria-label="Assessment column group"
                    value={currentScorebookPage} onChange={event => setScorebookPage(Number(event.target.value))}>
                    {scorebookPages.map((page, index) => <option value={index} key={index}>{index + 1}/{scorebookPages.length} · {page.label}</option>)}
                  </select>
                  <button type="button" className="btn btn-outline-secondary btn-sm" aria-label="Next assessment columns"
                    disabled={currentScorebookPage >= scorebookPages.length - 1} onClick={() => setScorebookPage(Math.min(scorebookPages.length - 1, currentScorebookPage + 1))}>›</button>
                </div>}
              </div>
            </div>}
            {scorebookAssessments.length === 0 && <div className="inline-empty">The full class roster is shown below. Add assessment items to enable score entry.</div>}
            {filteredEnrollments.length > 0 && <div className={`score-sheet-wrap ${scorebookView === "all" ? "score-sheet-wrap-full" : "score-sheet-wrap-auto"}`}><table className="score-sheet" style={{minWidth: scorebookView === "all" ? `${scorebookTableMinWidth}px` : undefined}}><colgroup>
  <col style={{width: `${scorebookColumnWidths.student}px`}} />
  <col style={{width: `${scorebookColumnWidths.attendance}px`}} />
  {scorebookDisplayColumns.map((column,i) => <col
    key={`${column.category.id}-${column.kind}-${column.kind === "assessment" ? column.item.id : i}`}
    style={{width: `${column.kind === "assessment" ? scorebookColumnWidths.assessment :
      scorebookColumnWidths.equivalent}px`}} />)}
  <col style={{width: `${scorebookColumnWidths.total}px`}} />
  <col style={{width: `${scorebookColumnWidths.final}px`}} />
  <col style={{width: `${scorebookColumnWidths.remark}px`}} /></colgroup><thead>
  <tr>
    <th className="score-sheet-student" rowSpan={scorebookHeaderRows.rowSpan}>STUDENT</th>
    <th className="score-sheet-summary-head score-sheet-attendance-summary" rowSpan={scorebookHeaderRows.rowSpan}>ATTENDANCE %<small>Present / P + A</small></th>
    {scorebookHeaderRows.rows[0]?.map(({category,colSpan,rowSpan})=><th className="score-sheet-category score-sheet-parent" key={category.id} colSpan={colSpan} rowSpan={rowSpan}><span title={category.name}>{scoreSheetCategoryLabel(category.name)}</span><small>{categoryWeightLabel(category,detail.categories)}</small></th>)}
    <th className="score-sheet-summary-head score-sheet-course-total" rowSpan={scorebookHeaderRows.rowSpan}>TOTAL GRADE<small>100%</small></th>
    <th className="score-sheet-summary-head score-sheet-final-grade" rowSpan={scorebookHeaderRows.rowSpan}>FINAL GRADE</th>
    <th className="score-sheet-summary-head" rowSpan={scorebookHeaderRows.rowSpan}>CLASS REMARK</th>
  </tr>
  {scorebookHeaderRows.rows.slice(1).map((row,index)=><tr key={`category-level-${index+1}`}>{row.map(({category,colSpan,rowSpan})=><th className="score-sheet-subcategory" key={category.id} colSpan={colSpan} rowSpan={rowSpan}><span title={category.name}>{scoreSheetCategoryLabel(category.name)}</span><small>{categoryWeightLabel(category,detail.categories)}</small></th>)}</tr>)}
  <tr>{scorebookDisplayColumns.map(column => column.kind === "assessment"
    ? <th className="score-sheet-assessment" key={column.item.id} title={`${column.item.title} · Perfect score ${column.item.maxScore}${column.item.dueDate ? " · " + new Date(column.item.dueDate).toLocaleDateString() : ""}`}><span>{column.item.title}</span><small>Max {column.item.maxScore}</small></th>
    : <th className="score-sheet-category-subtotal score-sheet-equiv-head" key={`${column.category.id}-equivalent`} title={`${column.category.name} · Weighted equivalent: ${categoryWeightLabel(column.category,detail.categories)} maximum`}>
        Equivalent<small>{column.category.weight.toFixed(2)}% max</small>
      </th>
  )}</tr>
</thead><tbody>{filteredEnrollments.map((enrollment,index)=>{
              const band=detail.gradeBands.slice().sort((a,b)=>b.minPercent-a.minPercent).find(item=>enrollment.finalPercent!==null&&enrollment.finalPercent>=item.minPercent);
              const hasSpecialRemark = ["INC", "NP", "DROPPED"].includes(enrollment.remarks || "");
              const attendance=attendanceSummary(enrollment,detail.assessments);
              const courseWeights = new Map(calculateGradeBreakdown(detail.categories.map(category => ({
                id: category.id, parentId: category.parentId, weight: category.weight, conversionBase: category.conversionBase,
                assessments: detail.assessments.filter(item => item.categoryId === category.id).map(item => ({
                  title: item.title, maxScore: item.maxScore, weight: item.weight,
                  scores: enrollment.scores.filter(score => score.assessmentId === item.id)
                }))
              }))).items.map(item => [item.categoryId, item]));
              return <Fragment key={enrollment.id}><tr><td className="score-sheet-student"><div><b>{index+1}. {enrollment.studentName}</b><small>{enrollment.studentNumber||"No student ID"}</small></div></td><td className="score-sheet-attendance-summary" title={`Present ${attendance.present} · Absent ${attendance.absent} · Excused ${attendance.excused}`}>{attendance.percent===null?"—":`${attendance.percent.toFixed(2)}%`}</td>{scorebookDisplayColumns.map(column=>{if(column.kind !== "assessment"){ const contribution=courseWeights.get(column.category.id);return <td className="score-sheet-category-equivalent" key={`${column.category.id}-equivalent`} title={hasSpecialRemark || contribution?.earnedWithinRoot == null ? "No weighted equivalent available" : `${contribution.percent?.toFixed(2)}% raw equivalent × ${contribution.withinRootWeight.toFixed(2)}% within ${rootCategory(column.category, detail.categories).name} = ${contribution.earnedWithinRoot.toFixed(2)}%`}>{hasSpecialRemark || contribution?.earnedWithinRoot == null ? "—" : `${contribution.earnedWithinRoot.toFixed(2)}%`}</td>; } const item=column.item; const score=enrollment.scores.find(value=>value.assessmentId===item.id);return <td className="score-sheet-score" key={item.id}><div className="score-sheet-entry"><input key={`${item.id}-${enrollment.id}-${score?.points??""}`} className="score-sheet-input" aria-label={`${enrollment.studentName} — ${item.title} score`} type="number" min="0" max={item.maxScore} step="0.01" defaultValue={score?.points??""} disabled={detail.gradeStatus==="VERIFIED"} onBlur={event=>{if(String(score?.points??"")!==event.target.value)saveScore(enrollment.id,item.id,event.target.value,score?.remark??null)}}/><select className="score-sheet-status" aria-label={`${enrollment.studentName} — ${item.title} status`} title={`${enrollment.studentName}: ${item.title} status`} value={score?.remark??""} onChange={event=>saveScore(enrollment.id,item.id,score?.points==null?"":String(score.points),event.target.value||null)} disabled={busy||detail.gradeStatus==="VERIFIED"}><option value="">—</option><option value="EXCUSED">EX</option><option value="ABSENT">AB</option><option value="DID_NOT_SUBMIT">DNS</option></select></div></td>})}<td className="score-sheet-total">{enrollment.finalPercent===null?"—":`${enrollment.finalPercent.toFixed(2)}%`}</td><td className="score-sheet-total">{hasSpecialRemark?enrollment.remarks:enrollment.finalGradeOverride||band?.finalGrade||"—"}</td><td className="score-sheet-remark"><select className="score-sheet-remark-select" aria-label={`${enrollment.studentName} class remark`} title="Automatically follows the final-grade scale unless a special remark is selected" value={hasSpecialRemark?enrollment.remarks||"": "__AUTO__"} onChange={event=>saveRemark(enrollment.id,event.target.value==="__AUTO__"?"":event.target.value)} disabled={busy||detail.gradeStatus==="VERIFIED"}><option value="__AUTO__">{band?.remarks||"Not yet graded"}</option><option value="INC">INC</option><option value="NP">NP</option><option value="DROPPED">DROPPED</option></select></td></tr>{showWeightBreakdown && <tr className="score-sheet-breakdown-row"><td colSpan={scorebookDisplayColumns.length+5}><GradeContributionPanel categories={detail.categories} assessments={detail.assessments} scores={enrollment.scores} remark={enrollment.remarks} /></td></tr>}</Fragment>})}</tbody></table></div>}
            {detail.enrollments.length > 0 && <div className="mobile-scorebook">{filteredEnrollments.map((enrollment,index)=>{const band=detail.gradeBands.slice().sort((a,b)=>b.minPercent-a.minPercent).find(item=>enrollment.finalPercent!==null&&enrollment.finalPercent>=item.minPercent);const special=["INC","NP","DROPPED"].includes(enrollment.remarks||"");const attendance=attendanceSummary(enrollment,detail.assessments);return <article className="mobile-score-student" key={enrollment.id}><header><div><b>{index+1}. {enrollment.studentName}</b><small>{enrollment.studentNumber||"No student ID"}</small></div><strong>{enrollment.finalPercent===null?"—":`${enrollment.finalPercent.toFixed(2)}%`}</strong></header><div className="mobile-score-summary"><span>Attendance <b>{attendance.percent===null?"—":`${attendance.percent.toFixed(1)}%`}</b></span><span>Final grade <b>{special?enrollment.remarks:enrollment.finalGradeOverride||band?.finalGrade||"—"}</b></span></div>{showWeightBreakdown && <GradeContributionPanel categories={detail.categories} assessments={detail.assessments} scores={enrollment.scores} remark={enrollment.remarks} />}{scorebookGroups.map(group=><section className="mobile-score-category" key={group.parent.id}><h4>{group.parent.name}</h4>{group.subcategories.map(category=><div className="mobile-score-subcategory" key={category.id}><b>{category.id===group.parent.id?"":categoryPath(category,detail.categories).split(" / ").slice(1).join(" / ")}</b>{group.items.filter(item=>item.categoryId===category.id).map(item=>{const score=enrollment.scores.find(value=>value.assessmentId===item.id);return <div className="mobile-score-assessment" key={item.id}><div><b>{item.title}</b><small>Maximum score: {item.maxScore}</small></div><div className="mobile-score-fields"><label>Score<input className="form-control form-control-sm" aria-label={`${enrollment.studentName} — ${item.title} score`} type="number" min="0" max={item.maxScore} step="0.01" defaultValue={score?.points??""} disabled={detail.gradeStatus==="VERIFIED"} onBlur={event=>{if(String(score?.points??"")!==event.target.value)saveScore(enrollment.id,item.id,event.target.value,score?.remark??null)}}/></label><label>Status<select className="form-select form-select-sm" aria-label={`${enrollment.studentName} — ${item.title} status`} value={score?.remark??""} onChange={event=>saveScore(enrollment.id,item.id,score?.points==null?"":String(score.points),event.target.value||null)} disabled={busy||detail.gradeStatus==="VERIFIED"}><option value="">—</option><option value="EXCUSED">Excused</option><option value="ABSENT">Absent</option><option value="DID_NOT_SUBMIT">Did not submit</option></select></label></div></div>})}</div>)}</section>)}<label className="mobile-score-remark">Class remark<select className="form-select form-select-sm" aria-label={`${enrollment.studentName} class remark`} value={special?enrollment.remarks||"":"__AUTO__"} onChange={event=>saveRemark(enrollment.id,event.target.value==="__AUTO__"?"":event.target.value)} disabled={busy||detail.gradeStatus==="VERIFIED"}><option value="__AUTO__">{band?.remarks||"Not yet graded"}</option><option value="INC">INC</option><option value="NP">NP</option><option value="DROPPED">DROPPED</option></select></label></article>})}</div>}
            {detail.enrollments.length === 0 ? <div className="inline-empty">No students are enrolled in this class. Add students from the Class roster tab.</div> : filteredEnrollments.length === 0 ? <div className="inline-empty">No students match this name or ID filter.</div> : null}
            <div className="scorebook-legend"><span><b>Excused</b> removes an item from its category denominator.</span><span><b>Absent / Did not submit</b> records zero raw points (the configured transmutation base still applies to academic assessments).</span><span><b>Blank</b> is pending, not zero. Equivalent columns show weighted percentages within the parent Lecture/Laboratory component; the final grade also applies its course weight.</span><span>Attendance sessions are recorded in the Attendance tab, not as assessment scores.</span></div>
          </section>}
          {classSection === "analytics" && <section className="class-analytics"><div className="surface analytics-heading"><span className="eyebrow">CLASS INSIGHTS</span><h2>{detail.code} performance</h2><p className="muted">{detail.title} · {detail.term} {detail.academicYear}. INC, NP, and DROPPED records are excluded from numeric averages.</p></div><div className="analytics-stat-grid"><article className="surface analytics-stat"><small>CLASS AVERAGE</small><strong>{analytics.average == null ? "—" : analytics.average.toFixed(2)+"%"}</strong><span>{analytics.graded.length} scored students</span></article><article className="surface analytics-stat"><small>PASSING</small><strong>{analytics.passing}</strong><span>75% and above</span></article><article className="surface analytics-stat analytics-warning"><small>AT RISK</small><strong>{analytics.atRisk}</strong><span>60%–74.99%</span></article><article className="surface analytics-stat analytics-danger"><small>BELOW 60%</small><strong>{analytics.failing}</strong><span>Needs follow-up</span></article><article className="surface analytics-stat analytics-danger"><small>ATTENDANCE DANGER OF FAILING</small><strong>{analytics.attendanceDanger}</strong><span>More than 20% absent days</span></article></div><div className="analytics-panels"><section className="surface analytics-panel"><h3>Grade distribution</h3><p className="muted">Current computed course percentages.</p>{analytics.bands.map(band=><div className="distribution-row" key={band.label}><span>{band.label}</span><div className="progress"><div className="progress-bar" style={{width:analytics.graded.length ? (band.count/analytics.graded.length*100)+"%" : "0%"}}/></div><b>{band.count}</b></div>)}</section><section className="surface analytics-panel"><h3>Leading students</h3><p className="muted">Highest computed percentages.</p>{analytics.graded.length ? [...analytics.graded].sort((a,b)=>(b.finalPercent??0)-(a.finalPercent??0)).slice(0,5).map((student,index)=><div className="leader-row" key={student.id}><span>{index+1}</span><b>{student.studentName}</b><strong>{student.finalPercent?.toFixed(2)}%</strong></div>) : <div className="inline-empty">Scores will appear here after they are entered.</div>}</section><section className="surface analytics-panel analytics-risk-list"><h3>Students to review</h3><p className="muted">Students below the 75% passing threshold.</p>{analytics.graded.filter(student=>(student.finalPercent??0)<75).sort((a,b)=>(a.finalPercent??0)-(b.finalPercent??0)).map(student=><div className="leader-row" key={student.id}><span className="risk-dot">!</span><b>{student.studentName}</b><strong>{student.finalPercent?.toFixed(2)}%</strong></div>)}{!analytics.graded.some(student=>(student.finalPercent??0)<75)&&<div className="inline-empty">No scored students are currently below 75%.</div>}</section></div></section>}
          {classSection === "final" && <section id="class-section-final" className="surface final-grades-page"><span className="print-only">{detail.code}: {detail.title} · {detail.term} {detail.academicYear}</span><div className="section-heading"><div><span className="eyebrow">GRADE SUBMISSION</span><h2>Final grades</h2><p className="muted">Review and submit provisional results. After official school-record submission, confirm the Registrar status.</p></div><div className="final-grade-tools"><button className="btn btn-outline-primary" onClick={exportGrades}>{user.school.slug === "fcu" ? "Export FCU grading sheet (Excel)" : "Export itemized grading sheet (Excel)"}</button><button className="btn btn-outline-primary" onClick={()=>printClass("grades")}>Print grade sheet</button>{detail.gradeStatus !== "DRAFT" && <button className="btn btn-outline-danger" onClick={recallSubmittedGrades} disabled={busy}>Recall grades</button>}{detail.gradeStatus === "VERIFIED" && <button className="btn btn-primary" onClick={emailVerifiedGrades} disabled={busy}>✉ Email verified grades</button>}</div></div><div className={`grade-notice ${detail.gradeStatus === "VERIFIED" ? "final" : detail.gradeStatus === "SUBMITTED" ? "provisional" : "draft"}`}>{detail.gradeStatus === "VERIFIED" ? "The teacher confirmed official submission to the Registrar. This record is final and locked until recalled for correction." : detail.gradeStatus === "SUBMITTED" ? `Submitted ${detail.submittedAt ? new Date(detail.submittedAt).toLocaleString() : ""}. Student visibility is controlled separately; visible grades remain provisional until the teacher confirms submission to the Registrar.` : detail.isPublished ? "This grade record is a draft but student viewing is enabled. Grades have not been submitted or verified to the Registrar and may change." : "This class record is still a draft and is hidden from students."}</div>{submissionProblems.length>0 && detail.gradeStatus!=="VERIFIED" && <div className="alert alert-warning py-2"><b>Before submission:</b><ul className="mb-0 mt-1">{submissionProblems.map(problem=><li key={problem}>{problem}</li>)}</ul></div>}<div className="final-grades-summary"><span>Overall weights <b>{detail.categories.filter(c=>!c.parentId).reduce((sum,c)=>sum+c.weight,0).toFixed(2)}%</b></span><span>Students <b>{detail.enrollments.length}</b></span><span>Assessment items <b>{detail.assessments.length}</b></span></div><div className="table-scroll"><table className="table grade-table"><thead><tr><th>STUDENT ID</th><th>STUDENT NAME</th><th>COURSE PERCENT</th><th>EQUIVALENT GRADE</th><th>REMARKS</th>{detail.gradeStatus === "VERIFIED" && <th>GRADE HISTORY</th>}</tr></thead><tbody>{filteredEnrollments.map(en=>{const band=detail.gradeBands.slice().sort((a,b)=>b.minPercent-a.minPercent).find(item=>en.finalPercent!==null&&en.finalPercent>=item.minPercent);return <tr key={en.id}><td>{en.studentNumber||"—"}</td><td>{en.studentName}</td><td>{en.finalPercent===null?"—":`${en.finalPercent.toFixed(2)}%`}</td><td>{en.finalGradeOverride||band?.finalGrade||"—"}{en.finalGradeOverride&&<small className="d-block text-primary">Manually changed</small>}</td><td>{en.remarks||band?.remarks||"Not yet graded"}</td>{detail.gradeStatus === "VERIFIED" && <td><button className="btn btn-outline-primary btn-sm" onClick={()=>{setGradeChangeEnrollmentId(en.id);setGradeChangeGrade(en.finalGradeOverride||"AUTO");setGradeChangeRemark(en.remarks||"AUTO");setGradeChangeReason("")}}>Change / history ({en.gradeChangeHistory?.length||0})</button></td>}</tr>})}</tbody></table></div>{detail.gradeStatus === "DRAFT" && <button className="btn btn-success mt-3" onClick={submitGrades} disabled={busy||submissionProblems.length>0}>Submit grades to students</button>}{detail.gradeStatus === "SUBMITTED" && <button className="btn btn-primary mt-3" onClick={verifyGrades} disabled={busy}>Verified to Registrar</button>}{detail.gradeStatus === "VERIFIED" && <div className="grade-notice final mt-3">Verified to Registrar · {detail.verifiedAt ? new Date(detail.verifiedAt).toLocaleString() : "Confirmed"}</div>}<p className="privacy-note text-start mt-3">Student visibility is separate from submission: open Manage grade visibility to show or hide results, including drafts. Submitting locks the class record but does not change visibility. Teacher verification records a confirmation of Registrar submission; final and official grades are published by the school’s official student portal. Recall reopens the record and hides it until you make it visible again.</p></section>}
        </>}
      </>}</> : <>{tab === "overview" && <><section className="student-welcome"><div><span className="eyebrow">STUDENT DASHBOARD</span><h2>Welcome back, {user.fullName.split(" ")[0]}.</h2><p>View the grade records your teachers have chosen to share with you.</p></div><div className="student-orb">✳</div></section><div className="student-stat-row"><div className="student-stat"><small>VISIBLE SUBJECTS</small><strong>{visibleGrades.length.toString().padStart(2,"0")}</strong><span>Filtered course results</span></div><div className="student-stat"><small>ACADEMIC YEAR</small><strong className="year-stat">{grades[0]?.academicYear || "—"}</strong><span>{grades[0]?.term || "No results yet"}</span></div><div className="student-stat"><small>PORTAL STATUS</small><strong className="status-stat">Active</strong><span>Account active</span></div></div><section className="section-block"><div className="section-heading"><div><h2>My grades</h2><p className="muted">Visible classes include itemized scores even when the teacher has not submitted the grade record. Final and official grades are published by your school’s official student portal.</p></div><span className="private-pill">🔒 Private view</span></div><div className="grade-notice provisional mb-3"><strong>Important:</strong> SAGA grades are for reference only. Unsubmitted or unverified results are unofficial and may change. Final and official grades will be published by your school's official student portal.</div>{grades.length > 0 && <div className="student-grade-filters"><label><span>Find class</span><input className="form-control" type="search" value={studentGradeQuery} onChange={event=>setStudentGradeQuery(event.target.value)} placeholder="Course, class, or instructor" autoComplete="off"/></label><label><span>School year</span><select className="form-select" value={studentYearFilter} onChange={event=>setStudentYearFilter(event.target.value)}><option>All School Years</option>{studentGradeYears.map(year=><option key={year}>{year}</option>)}</select></label><label><span>Term</span><select className="form-select" value={studentTermFilter} onChange={event=>setStudentTermFilter(event.target.value)}><option>All Terms</option>{studentGradeTerms.map(term=><option key={term}>{term}</option>)}</select></label></div>}{grades.length ? visibleGrades.length ? <div className="student-grade-list">{visibleGrades.map(g=><article className="student-grade-card student-grade-card-expanded" key={g.id}><div className="grade-course-icon">{g.code.slice(0,2)}</div><div className="grade-course-details"><small>{g.code} <span>·</span> {g.term} {g.academicYear}</small><h3>{g.title}</h3><p>Instructor: {g.teacher}</p><span className={`grade-status-pill ${g.status === "VERIFIED" ? "final" : "provisional"}`}>{g.status === "VERIFIED" ? "Teacher-verified · Check official school portal" : g.status === "DRAFT" ? "Draft · Not submitted or verified" : "Submitted · Not yet verified to Registrar"}</span></div><div className="grade-result"><small>{g.status === "VERIFIED" ? "TEACHER-VERIFIED GRADE" : "UNOFFICIAL GRADE"}</small><strong>{g.finalGrade ?? "—"}</strong><span>{g.remarks}</span><b className="grade-percent">{g.percent === null ? "—" : `${g.percent.toFixed(2)}%`}</b></div><details className="student-itemized"><summary>View itemized scores ({g.categories.reduce((n,c)=>n+c.assessments.length,0)} items)</summary>{g.status === "VERIFIED" ? <div className="grade-notice final">The teacher marked this record verified to the Registrar{g.verifiedAt ? ` on ${new Date(g.verifiedAt).toLocaleDateString()}` : ""}. Refer to your school's official student portal for final and official grades.</div> : <div className="grade-notice provisional">{g.status === "DRAFT" ? "Not yet submitted or verified to the Registrar. These grades are unofficial, may be incomplete, and can change." : "Submitted in SAGA, but not yet verified to the Registrar. These results remain provisional and may change."} Final and official grades will be published by your school's official student portal.</div>}{g.categories.map(category=><div className="student-score-category" key={category.name}><div className="quick-category-heading"><strong>{category.name}</strong><span>{category.weight.toFixed(2)}% of course</span></div>{category.assessments.map(item=><div className="quick-item" key={item.id}><span>{item.title}</span><b>{item.points == null ? (item.remark || "—") : `${item.points} / ${item.maxScore}`}</b></div>)}</div>)}</details></article>)}</div> : <div className="empty-state student-empty"><div className="empty-icon">◎</div><h3>No grades match these filters</h3><p>Clear the search, school year, or term filters to see your other class records.</p></div> : <div className="empty-state student-empty"><div className="empty-icon">◎</div><h3>No visible grades yet</h3><p>Your teacher may still be entering scores, may have hidden this class, or your account may not have been linked to your class record yet.</p><div className="empty-hint">If you believe you should already see a class, contact your teacher and confirm that your student number is correct.</div></div>}</section></>}</>}
      {tab === "simulator" && <section className="section-block student-simulator-page">
        <div className="student-simulator-intro">
          <span className="eyebrow">PRACTICE · PRIVATE TO YOUR ACCOUNT</span>
          <h2>What-If Grade Simulator</h2>
          <p>Experiment with your assessment scores and explore possible outcomes without changing your recorded grades. Final and official grades are published by the school's official student portal.</p>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => navigatePage("overview")}>← Back to My Grades</button>
        </div>
        {loading ? <div className="inline-empty" role="status">Loading visible classes…</div> : !grades.length ? <div className="empty-state student-empty"><div className="empty-icon">◎</div><h3>No classes available for simulation</h3><p>Ask your teacher to make your class grades visible in SAGA. Your actual grades are not affected.</p></div> : <>
          <div className="student-simulator-choose"><div><h3>Choose a class to simulate</h3><p className="muted">Only classes visible in your Student Portal are listed here.</p></div><span className="student-simulator-count">{grades.length} class{grades.length === 1 ? "" : "es"}</span></div>
          <div className="student-simulator-course-list">
            {grades.map(grade => <button type="button" key={grade.id} className={`student-simulator-course ${simulatingGradeId === grade.id ? "active" : ""}`} aria-pressed={simulatingGradeId === grade.id} onClick={() => setSimulatingGradeId(grade.id)}>
              <span><strong>{grade.code} — {grade.title}</strong><small>{grade.term} {grade.academicYear} · {grade.teacher}</small></span>
              <span className="student-simulator-course-result">{grade.percent === null ? "Not graded" : `${grade.percent.toFixed(2)}% recorded`}</span>
            </button>)}
          </div>
          {simulatingGradeId && grades.some(grade => grade.id === simulatingGradeId) ?
            <GradeWhatIfSimulator key={simulatingGradeId} grade={grades.find(grade => grade.id === simulatingGradeId)!} inline onClose={() => setSimulatingGradeId(null)} /> :
            <div className="student-simulator-placeholder"><b>Select any class above to begin.</b><span>You'll be able to try scores and compare projected results against your teacher's records.</span></div>}
        </>}
      </section>}
      </div></main>
          {printMode && user.school.slug === "fcu" && <style media="print">{`@page { size: 8.5in 13in portrait; margin: 0.393in 0.197in 0.236in 0.275in; }`}</style>}
      {printMode && detail && user.school.slug === "fcu" && <article className="print-grade-sheet fcu-print-sheet">
        <img className="fcu-print-official-header" src="/fcu-grading-header.png" alt="FCU-EOMS-RO-006-F Graduate School / Collegiate Grading Sheet" />
        <table className="fcu-print-course-table"><tbody>
          <tr><th>Course No.</th><td>{detail.code}</td><th colSpan={2}>Descriptive Title</th><td colSpan={2}>{detail.title}</td></tr>
          <tr><th>Class I.D.</th><td>{detail.classId || "—"}</td><th>Semester</th><td>{detail.term}</td><th>Academic Year</th><td>{detail.academicYear}</td></tr>
        </tbody></table>
        <table className="print-grade-table fcu-print-grade-table"><thead><tr>
          <th className="fcu-print-name">NAME OF STUDENTS</th>
          {printCategories.map(category=><th key={category.id}>: {category.name.toUpperCase()} :</th>)}
          <th>: TG :</th><th>: FG :</th><th>: REMARKS :</th>
        </tr></thead><tbody>{detail.enrollments.map((en,index)=>{
          const band=detail.gradeBands.slice().sort((a,b)=>b.minPercent-a.minPercent).find(item=>en.finalPercent!==null&&en.finalPercent>=item.minPercent);
          const remark=en.remarks||band?.remarks||"";
          const suppress=["INC","DROPPED"].includes(en.remarks||"");
          return <tr key={en.id}>
            <td>{index+1}. {en.studentName.toLocaleUpperCase()}</td>
            {printCategories.map(category=>{
              const percentage=weightedCategoryPercent(en,category,detail.categories,detail.assessments);
              return <td key={category.id}>{printMode==="grades"&&!suppress&&percentage!==null?`:   ${(percentage*effectiveCategoryWeight(category,detail.categories)/100).toFixed(2)}   :`:""}</td>;
            })}
            <td>{printMode==="grades"&&!suppress&&en.finalPercent!==null?`:   ${en.finalPercent.toFixed(2)}   :`:""}</td>
            <td>{printMode==="grades"&&!suppress&&((en.finalGradeOverride||band?.finalGrade))?`:   ${en.finalGradeOverride||band?.finalGrade}   :`:""}</td>
            <td>{printMode==="grades"&&remark?`:   ${remark}   :`:""}</td>
          </tr>;
        })}</tbody></table>
        <div className="print-signatures"><div>Submitted by:<p><u>{user.fullName.toLocaleUpperCase()}</u><small>TEACHER&apos;S SIGNATURE OVER PRINTED NAME</small></p></div><div>Noted:<p><u>&nbsp;</u><small>DEAN&apos;S SIGNATURE OVER PRINTED NAME</small></p></div></div>
      </article>}
      {printMode === "grades" && detail && user.school.slug !== "fcu" && <article className="print-grade-sheet generic-print-sheet"><header>{schoolLogoPath && <img className="print-school-logo" src={`/api/media?pathname=${encodeURIComponent(schoolLogoPath)}`} alt={`${user.school.name} logo`}/>}<h2>{user.school.name}</h2><b>CLASS GRADING SHEET</b></header><div className="print-course-details"><span>Class ID <u>{detail.classId || "—"}</u></span><span>Course Code <u>{detail.code}</u></span><span>Description <u>{detail.title}</u></span><span>Term <u>{detail.term}</u></span><span>School Year <u>{detail.academicYear}</u></span><span>Class <u>{detail.courseYear || "—"}</u></span><span>Teacher <u>{user.fullName}</u></span></div><table className="print-grade-table"><thead><tr><th>STUDENT</th>{printCategories.map(category=><th key={category.id}>{category.name}<small>{effectiveCategoryWeight(category,detail.categories).toFixed(2)}%</small></th>)}<th>TOTAL</th><th>FINAL</th><th>REMARKS</th></tr></thead><tbody>{detail.enrollments.map((enrollment,index)=>{const band=detail.gradeBands.slice().sort((a,b)=>b.minPercent-a.minPercent).find(item=>enrollment.finalPercent!==null&&enrollment.finalPercent>=item.minPercent);const suppress=["INC","DROPPED"].includes(enrollment.remarks||"");return <tr key={enrollment.id}><td>{index+1}. {enrollment.studentName}</td>{printCategories.map(category=>{const value=weightedCategoryPercent(enrollment,category,detail.categories,detail.assessments);return <td key={category.id}>{!suppress&&value!==null?(value*effectiveCategoryWeight(category,detail.categories)/100).toFixed(2):""}</td>})}<td>{!suppress&&enrollment.finalPercent!==null?enrollment.finalPercent.toFixed(2):""}</td><td>{!suppress?enrollment.finalGradeOverride||band?.finalGrade||"":""}</td><td>{enrollment.remarks||band?.remarks||""}</td></tr>})}</tbody></table><div className="print-signatures"><div>Submitted by:<p><u>{user.fullName}</u><small>TEACHER</small></p></div><div>Reviewed by:<p><u>&nbsp;</u><small>AUTHORIZED REVIEWER</small></p></div></div></article>}
      {teacher && visibilityManagerQuery !== null && <GradeVisibilityManager subjects={subjects} initialQuery={visibilityManagerQuery} onClose={() => setVisibilityManagerQuery(null)} onChanged={(subjectIds, visible) => { const ids = new Set(subjectIds); setSubjects(current => current.map(subject => ids.has(subject.id) ? { ...subject, isPublished: visible } : subject)); setDetail(current => current && ids.has(current.id) ? { ...current, isPublished: visible } : current); }} />}
       {rosterEdit && detail && <div className="modal-backdrop-custom" onMouseDown={e=>{if(e.target===e.currentTarget)setRosterEdit(null)}}><div className="modal-card"><button className="modal-x" onClick={()=>setRosterEdit(null)}>×</button><span className="eyebrow">CLASS ROSTER</span><h2>Edit student details</h2><p className="muted">Update the name or class student ID. Changing the ID unlinks the previous portal account.</p><form onSubmit={saveRosterStudent}><label className="form-label">Student name</label><input className="form-control mb-3" value={rosterEdit.studentName} onChange={e=>setRosterEdit({...rosterEdit,studentName:e.target.value})} required maxLength={120}/><label className="form-label">Student ID</label><input className="form-control mb-3" value={rosterEdit.studentNumber} onChange={e=>setRosterEdit({...rosterEdit,studentNumber:e.target.value})} maxLength={40}/><button className="btn btn-primary w-100" disabled={busy}>Save student details</button></form></div></div>}
      {bulkScoresOpen&&detail&&<div className="modal-backdrop-custom" onMouseDown={e=>{if(e.target===e.currentTarget)setBulkScoresOpen(false)}}><div className="modal-card bulk-scores-modal"><button className="modal-x" onClick={()=>setBulkScoresOpen(false)}>×</button><span className="eyebrow">SCOREBOOK · BULK IMPORT</span><h2>Import scores</h2><p className="muted">Download the CSV template, edit scores, then preview and validate before saving. Blank cells stay unchanged. This import does not edit attendance.</p><button type="button" className="btn btn-outline-primary btn-sm mb-3" onClick={()=>downloadScoreCsv(true)}>↓ Download score template</button><label className="form-label" htmlFor="bulk-score-file">Choose completed CSV</label><input id="bulk-score-file" className="form-control" type="file" accept=".csv,text/csv" onChange={event=>{const file=event.currentTarget.files?.[0];if(file)void previewBulkScores(file)}}/>{bulkFileName&&<div className="small muted mt-2">Previewing {bulkFileName}</div>}{bulkErrors.length>0&&<div className="bulk-validation-errors" role="alert"><b>Fix these issues before saving:</b><ul>{bulkErrors.slice(0,30).map((error,index)=><li key={`${index}-${error}`}>{error}</li>)}</ul>{bulkErrors.length>30&&<small>And {bulkErrors.length-30} more validation errors.</small>}</div>}{bulkRowsPreview.length>0&&<><div className={`bulk-validation-summary ${bulkErrors.length?"invalid":"valid"}`}>{bulkErrors.length?`${bulkErrors.length} validation issue(s)`: `${bulkRowsPreview.length} students checked · ${bulkOperations.length} score cells ready to save`}</div><div className="bulk-preview-scroll"><table className="table table-sm"><thead><tr><th>CSV ROW</th><th>STUDENT</th><th>ID</th><th>CELLS</th><th>RESULT</th></tr></thead><tbody>{bulkRowsPreview.slice(0,50).map(row=><tr key={row.row}><td>{row.row}</td><td>{row.student}</td><td>{row.studentNumber||"—"}</td><td>{row.cells}</td><td>{row.errors.length?<span className="text-danger">{row.errors.join("; ")}</span>:<span className="text-success">Valid</span>}</td></tr>)}</tbody></table>{bulkRowsPreview.length>50&&<small className="muted">Showing first 50 of {bulkRowsPreview.length} rows.</small>}</div></>}<button className="btn btn-primary w-100 mt-3" onClick={applyBulkScores} disabled={busy||bulkErrors.length>0||bulkOperations.length===0}>Validate and save {bulkOperations.length?`(${bulkOperations.length} cells)`:""}</button></div></div>}
      {gradeChangeEnrollmentId&&detail&&(()=>{const enrollment=detail.enrollments.find(item=>item.id===gradeChangeEnrollmentId);if(!enrollment)return null;return <div className="modal-backdrop-custom" onMouseDown={e=>{if(e.target===e.currentTarget)setGradeChangeEnrollmentId("")}}><div className="modal-card grade-change-modal"><button className="modal-x" onClick={()=>setGradeChangeEnrollmentId("")}>×</button><span className="eyebrow">AUDITABLE GRADE CORRECTION</span><h2>{enrollment.studentName}</h2><p className="muted">The current score calculations remain intact. A manual final grade and reason are recorded in the history below.</p><form onSubmit={saveGradeChange}><label className="form-label">Final grade</label><select className="form-select mb-3" value={gradeChangeGrade} onChange={e=>setGradeChangeGrade(e.target.value)}><option value="AUTO">Use calculated grade</option>{detail.gradeBands.map(band=><option key={band.id} value={band.finalGrade}>{band.finalGrade} · {band.remarks}</option>)}</select><label className="form-label">Remark</label><select className="form-select mb-3" value={gradeChangeRemark} onChange={e=>setGradeChangeRemark(e.target.value)}><option value="AUTO">Use calculated remark</option><option>Passed</option><option>Failed</option><option>INC</option><option>NP</option><option>DROPPED</option></select><label className="form-label">Reason for change</label><textarea className="form-control mb-3" minLength={10} maxLength={500} required value={gradeChangeReason} onChange={e=>setGradeChangeReason(e.target.value)} placeholder="For example: INC requirements completed and verified on …"/><button className="btn btn-primary w-100" disabled={busy}>Save correction</button></form><hr/><h3 className="h6">Grade change history</h3>{enrollment.gradeChangeHistory?.length?<div className="grade-history-list">{enrollment.gradeChangeHistory.map(item=><article key={item.id}><b>{item.previousFinalGrade||"—"} → {item.newFinalGrade||"—"} · {item.previousRemarks||"No remark"} → {item.newRemarks||"No remark"}</b><p>{item.reason}</p><small>{new Date(item.createdAt).toLocaleString()} · {item.actor.fullName}</small></article>)}</div>:<p className="muted small">No grade changes have been recorded for this student.</p>}</div></div>})()}
      {attendanceOpen && detail && <div className="modal-backdrop-custom" onMouseDown={e=>{if(e.target===e.currentTarget)setAttendanceOpen(false)}}><div className="modal-card"><button className="modal-x" onClick={()=>setAttendanceOpen(false)}>×</button><span className="eyebrow">CLASS ATTENDANCE</span><h2>Add attendance day</h2><p className="muted">Choose a date from the class schedule. For a different date, enter a reason such as Make-up class.</p><div className="privacy-note text-start mb-3">Scheduled days: {scheduleWeekdays(detail.schedule).map(day=>["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][day]).join(", ") || "No valid days found"}</div><form onSubmit={createAttendanceDay}><label className="form-label">Class date</label><input className="form-control mb-2" type="date" value={attendanceDate} onChange={e=>setAttendanceDate(e.target.value)} required/><PhilippineHolidayCalendar selectedDate={attendanceDate} onSelect={setAttendanceDate}/><label className="form-label mt-3">Attendance Type</label><select className="form-select mb-3" value={attendanceType} onChange={e=>setAttendanceType(e.target.value as "FACE_TO_FACE" | "ONLINE")} required><option value="FACE_TO_FACE">Face-to-Face</option><option value="ONLINE">Online</option></select><label className="form-label">Reason for a non-scheduled date <span className="muted">(optional on scheduled days)</span></label><input className="form-control mb-3" value={attendanceReason} onChange={e=>setAttendanceReason(e.target.value)} placeholder="e.g. Make-up class"/><button className="btn btn-primary w-100" disabled={busy}>Add attendance day</button></form></div></div>}
      {editOpen && detail && <div className="modal-backdrop-custom" onMouseDown={e=>{if(e.target===e.currentTarget)setEditOpen(false)}}><div className="modal-card class-edit-modal"><button className="modal-x" onClick={()=>setEditOpen(false)}>×</button><span className="eyebrow">CLASS MANAGEMENT</span><h2>Edit class details</h2><p className="muted">Update the class identifier, subject details, term, school year, or meeting schedule.</p><form onSubmit={saveSubjectDetails}><label className="form-label">Class ID</label><input className="form-control mb-3" value={editDetails.classId} onChange={e=>setEditDetails({...editDetails,classId:e.target.value})} required maxLength={40}/><label className="form-label">Course code</label><input className="form-control mb-3" value={editDetails.code} onChange={e=>setEditDetails({...editDetails,code:e.target.value})} required maxLength={30}/><label className="form-label">Descriptive title</label><input className="form-control mb-3" value={editDetails.title} onChange={e=>setEditDetails({...editDetails,title:e.target.value})} required maxLength={160}/><div className="row"><div className="col-6"><label className="form-label">Term</label><select className="form-select mb-3" value={editDetails.term} onChange={e=>setEditDetails({...editDetails,term:e.target.value})}><option>1st Semester</option><option>2nd Semester</option><option>3rd Semester</option><option>Summer</option></select></div><div className="col-6"><label className="form-label">Academic year</label><input className="form-control mb-3" value={editDetails.academicYear} onChange={e=>setEditDetails({...editDetails,academicYear:e.target.value})} required maxLength={20}/></div></div><label className="form-label">Course and year</label><input className="form-control mb-3" value={editDetails.courseYear} onChange={e=>setEditDetails({...editDetails,courseYear:e.target.value})} maxLength={80}/><div className="schedule-builder"><div className="schedule-builder-heading"><div><label className="form-label mb-0">Class schedule</label><small className="muted d-block">Add or remove lecture, laboratory, or other meeting times.</small></div><button type="button" className="btn btn-sm btn-outline-primary" onClick={()=>setEditScheduleRows([...editScheduleRows,newScheduleRow()])}>＋ Add schedule</button></div>{editScheduleRows.map((row,index)=><div className="schedule-row" key={index}><div className="schedule-label-field"><label className="form-label">Class type</label><input className="form-control" value={row.label} onChange={e=>setEditScheduleRows(editScheduleRows.map((r,i)=>i===index?{...r,label:e.target.value}:r))}/></div><div><label className="form-label">Day</label><select className="form-select" value={row.day} onChange={e=>setEditScheduleRows(editScheduleRows.map((r,i)=>i===index?{...r,day:e.target.value}:r))}>{DAYS.map(day=><option key={day}>{day}</option>)}</select></div><TimeDropdown label="Starts" value={row.startTime} onChange={value=>setEditScheduleRows(editScheduleRows.map((r,i)=>i===index?{...r,startTime:value}:r))}/><TimeDropdown label="Ends" value={row.endTime} onChange={value=>setEditScheduleRows(editScheduleRows.map((r,i)=>i===index?{...r,endTime:value}:r))}/><button type="button" className="schedule-remove" aria-label="Remove schedule" onClick={()=>setEditScheduleRows(editScheduleRows.filter((_,i)=>i!==index))}>×</button></div>)}</div><div className="privacy-note text-start mt-3">Class details can only be changed while grades are in draft. Recall a submitted or verified record before editing its official class details.</div><button className="btn btn-primary w-100 mt-3" disabled={busy}>Save class details</button></form></div></div>}
      {createOpen && <div className="modal-backdrop-custom" onMouseDown={e=>{if(e.target===e.currentTarget)setCreateOpen(false)}}><div className="modal-card"><button className="modal-x" onClick={()=>setCreateOpen(false)}>×</button><span className="eyebrow">NEW CLASS</span><h2>Create a subject</h2><p className="muted">Set up course details. You can edit the default grading weights afterward.</p><form onSubmit={createSubject}><label className="form-label">Class ID</label><input className="form-control mb-3" name="classId" placeholder="e.g. 25-CECE1-001" required maxLength={40}/><label className="form-label">Course code</label><input className="form-control mb-3" name="code" placeholder="e.g. ECE 16" required/><label className="form-label">Descriptive title</label><input className="form-control mb-3" name="title" required/><div className="row"><div className="col-6"><label className="form-label">Term</label><select className="form-select mb-3" name="term" defaultValue="1st Semester" required><option>1st Semester</option><option>2nd Semester</option><option>3rd Semester</option><option>Summer</option></select></div><div className="col-6"><label className="form-label">Academic year</label><input className="form-control mb-3" name="academicYear" placeholder="2026-2027" required/></div></div><label className="form-label">Course and year</label><input className="form-control mb-3" name="courseYear" placeholder="BSECE - 1"/><div className="schedule-builder"><div className="schedule-builder-heading"><div><label className="form-label mb-0">Class schedule</label><small className="muted d-block">Add lecture, laboratory, or other meeting times.</small></div><button type="button" className="btn btn-sm btn-outline-primary" onClick={()=>setScheduleRows([...scheduleRows,newScheduleRow()])}>＋ Add schedule</button></div>{scheduleRows.map((row,index)=><div className="schedule-row" key={index}><div className="schedule-label-field"><label className="form-label">Class type</label><input className="form-control" value={row.label} placeholder="Lecture / Laboratory" onChange={e=>setScheduleRows(scheduleRows.map((r,i)=>i===index?{...r,label:e.target.value}:r))}/></div><div><label className="form-label">Day</label><select className="form-select" value={row.day} onChange={e=>setScheduleRows(scheduleRows.map((r,i)=>i===index?{...r,day:e.target.value}:r))}>{DAYS.map(day=><option key={day}>{day}</option>)}</select></div><TimeDropdown label="Starts" value={row.startTime} onChange={value=>setScheduleRows(scheduleRows.map((r,i)=>i===index?{...r,startTime:value}:r))}/><TimeDropdown label="Ends" value={row.endTime} onChange={value=>setScheduleRows(scheduleRows.map((r,i)=>i===index?{...r,endTime:value}:r))}/>{scheduleRows.length>1 && <button type="button" className="schedule-remove" aria-label="Remove schedule" onClick={()=>setScheduleRows(scheduleRows.filter((_,i)=>i!==index))}>×</button>}</div>)}</div><button className="btn btn-primary w-100" disabled={busy}>Create subject</button></form></div></div>}
      {rosterOpen && <div className="modal-backdrop-custom" onMouseDown={e=>{if(e.target===e.currentTarget)setRosterOpen(false)}}><div className="modal-card"><button className="modal-x" onClick={()=>setRosterOpen(false)}>×</button><span className="eyebrow">CLASS ROSTER</span><h2>Add students</h2><p className="muted">Paste one student per line as <b>Full Name, then a tab, then Student Number</b>. Keep commas that belong to the name. Students with a registered portal account are matched automatically by student number.</p><button type="button" className="btn btn-outline-primary btn-sm mb-3" onClick={downloadRosterTemplate}>↓ Download sample roster (Excel)</button><form onSubmit={addRoster}><label className="form-label" htmlFor="roster-csv">Import roster CSV</label><input id="roster-csv" className="form-control mb-2" type="file" accept=".csv,text/csv" onChange={async e=>{const file=e.currentTarget.files?.[0];if(!file)return;try{setRosterText(parseCsv(await file.text()));setRosterFileName(file.name);setErr("");}catch(error){setErr(error instanceof Error?error.message:"Could not read this CSV.");}}}/>{rosterFileName && <div className="muted small mb-2">Loaded {rosterFileName}. Review the rows before adding them.</div>}<label className="form-label" htmlFor="roster-students">Or paste student rows</label><textarea id="roster-students" className="form-control roster-textarea" name="students" value={rosterText} onChange={e=>setRosterText(e.target.value)} placeholder={'Santos, Juan D.\t2026-0001\nReyes, Maria C.\t2026-0002'} required/><div className="privacy-note text-start">Only add students officially enrolled in this subject. Their portal account will match automatically when the student number matches.</div><button className="btn btn-primary w-100 mt-3" disabled={busy}>Add roster records</button></form></div></div>}
      {(loading || loadingDetail || busy) && <div className="portal-waiting" role="status" aria-live="polite"><span className="spinner-border" aria-hidden="true"></span><strong>{busy?"Saving your changes…":loadingDetail?"Loading class records…":"Loading your portal…"}</strong></div>}
      {assessmentOpen && detail && <div className="modal-backdrop-custom" onMouseDown={e=>{if(e.target===e.currentTarget)setAssessmentOpen(false)}}><div className="modal-card"><button className="modal-x" onClick={()=>setAssessmentOpen(false)}>×</button><span className="eyebrow">GRADEBOOK</span><h2>Add assessment</h2><p className="muted">Scores are normalized within this category and multiplied by its course weight. Leave item weights blank to calculate from total points earned ÷ total possible. For custom shares, weight every item in that category so the item weights total 100%.</p><form onSubmit={addAssessment}><label className="form-label">Assessment name</label><input className="form-control mb-3" name="title" placeholder="Quiz 1" required/><label className="form-label">Grading category</label><select className="form-select mb-3" name="categoryId" required>{recordCategories.map(c=><option key={c.id} value={c.id}>{categoryPath(c,detail.categories)} ({categoryWeightLabel(c,detail.categories)})</option>)}</select><label className="form-label">Maximum points</label><input className="form-control mb-3" type="number" name="maxScore" min="0.01" step="0.01" required/><label className="form-label">Custom item weight within category (%)</label><input className="form-control mb-3" type="number" name="weight" min="0" max="100" step="0.5" placeholder="Automatic by points"/><label className="form-label">Due date (optional)</label><input className="form-control mb-4" type="date" name="dueDate"/><button className="btn btn-primary w-100" disabled={busy}>Add assessment</button></form></div></div>}
      <OnboardingGuide role={teacher ? "TEACHER" : "STUDENT"} open={onboardingOpen} onClose={closeOnboarding} onOpenHelp={openHelpFromTour}/>
      <HelpCenter role={teacher ? "TEACHER" : "STUDENT"} open={helpOpen} initialTab={helpInitialTab} pageContext={tab === "classes" ? selectedTitle + " · " + classSection : tab === "simulator" ? "Student grade simulation" : tab === "profile" ? "Profile and account settings" : teacher ? "Teaching overview" : "Academic overview"} onClose={()=>setHelpOpen(false)} onStartTour={()=>{setHelpOpen(false);setOnboardingOpen(true);}}/>
    </div>;
}
