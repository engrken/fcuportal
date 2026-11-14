"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./DemoWorkspace.module.css";

type DemoRole = "teacher" | "student" | "admin";
type DemoTab = "overview" | "scorebook" | "attendance" | "publication" | "grades" | "simulator" | "schools";
type Attendance = "PRESENT" | "ABSENT" | "EXCUSED";
type GradeStatus = "DRAFT" | "SUBMITTED" | "VERIFIED";
type Marks = Record<string, Record<string, Record<string, number | null>>>;
type AttendanceBook = Record<string, Record<string, Attendance>>;

const students = [
  { id: "s1", number: "DEMO-2026-001", name: "Mika Cruz" },
  { id: "s2", number: "DEMO-2026-002", name: "Alex Santos" },
  { id: "s3", number: "DEMO-2026-003", name: "Sam Rivera" },
  { id: "s4", number: "DEMO-2026-004", name: "Casey Reyes" },
  { id: "s5", number: "DEMO-2026-005", name: "Jamie Navarro" },
  { id: "s6", number: "DEMO-2026-006", name: "Taylor Garcia" }
] as const;
const classes = [
  { id: "ece18", code: "ECE 18", title: "Wireless Communications", schedule: "Mon & Wed · 9:00–10:30 AM", instructor: "Prof. Andrea Flores" },
  { id: "ece23", code: "ECE 23", title: "Microprocessor Systems", schedule: "Tue & Thu · 1:00–2:30 PM", instructor: "Prof. Andrea Flores" }
] as const;
const assessmentItems = [
  { id: "exam", title: "Major Exam", max: 100, weight: 50 },
  { id: "quiz", title: "Quizzes", max: 50, weight: 25 },
  { id: "exercise", title: "Exercises", max: 40, weight: 15 }
] as const;

function seedMarks(): Marks {
  const sample = [
    [[85, 43, 37], [91, 44, 36], [77, 39, 31], [89, 47, 38], [72, 35, 29], [94, 46, 39]],
    [[82, 41, 35], [87, 46, 37], [79, 40, 33], [92, 45, 38], [74, 36, 30], [95, 48, 39]]
  ];
  const book: Marks = {};
  classes.forEach((course, ci) => {
    book[course.id] = {};
    students.forEach((student, si) => {
      book[course.id][student.id] = Object.fromEntries(
        assessmentItems.map((item, ai) => [item.id, sample[ci][si][ai]])
      );
    });
  });
  return book;
}
function seedAttendance(): AttendanceBook {
  return Object.fromEntries(classes.map(course => [course.id, Object.fromEntries(
    students.map((student, index) => [student.id, index === 4 ? "ABSENT" : index === 2 ? "EXCUSED" : "PRESENT"])
  )])) as AttendanceBook;
}
function seedStatuses(): Record<string, GradeStatus> { return { ece18: "SUBMITTED", ece23: "DRAFT" }; }
function seedVisibility(): Record<string, boolean> { return { ece18: true, ece23: true }; }
function scorePercent(courseId: string, studentId: string, marks: Marks, attendance: AttendanceBook, predictedExam?: number) {
  const scores = marks[courseId]?.[studentId] || {};
  const weighted = assessmentItems.reduce((sum, item) => {
    const score = item.id === "exam" && predictedExam !== undefined ? predictedExam : scores[item.id];
    return sum + (score == null ? 0 : score / item.max * item.weight);
  }, 0);
  const mark = attendance[courseId]?.[studentId] || "PRESENT";
  const attended = mark === "PRESENT" ? 10 : mark === "EXCUSED" ? 5 : 0;
  return Math.round((weighted + attended) * 100) / 100;
}
function gradeEquivalent(percent: number) {
  return percent >= 90 ? "1.00" : percent >= 85 ? "1.50" : percent >= 80 ? "2.00" : percent >= 75 ? "3.00" : "5.00";
}
const roleOptions: { role: DemoRole; icon: string; title: string; subtitle: string; description: string }[] = [
  { role: "teacher", icon: "▤", title: "Teacher", subtitle: "Class records & attendance", description: "Try a workbook-style scorebook, mark attendance, and preview grade publication." },
  { role: "student", icon: "✦", title: "Student", subtitle: "Grades & simulation", description: "Explore personal grades and try a private what-if score simulation." },
  { role: "admin", icon: "▦", title: "Platform Administrator", subtitle: "Tenant overview (read-only)", description: "Preview school-level statistics and subscription summaries with fictional data." }
];
const menus: Record<DemoRole, { id: DemoTab; label: string; symbol: string }[]> = {
  teacher: [
    { id: "overview", label: "Overview", symbol: "◫" },
    { id: "scorebook", label: "Record Scores", symbol: "▦" },
    { id: "attendance", label: "Attendance", symbol: "▣" },
    { id: "publication", label: "Grade Submission", symbol: "✓" }
  ],
  student: [
    { id: "overview", label: "Overview", symbol: "◫" },
    { id: "grades", label: "My Grades", symbol: "▦" },
    { id: "simulator", label: "Grade Simulator", symbol: "◈" }
  ],
  admin: [
    { id: "overview", label: "Overview", symbol: "◫" },
    { id: "schools", label: "School Workspaces", symbol: "▤" }
  ]
};

export default function DemoWorkspace() {
  const [role, setRole] = useState<DemoRole | null>(null);
  const [tab, setTab] = useState<DemoTab>("overview");
  const [activeClass, setActiveClass] = useState<string>("ece18");
  const [marks, setMarks] = useState<Marks>(seedMarks);
  const [attendance, setAttendance] = useState<AttendanceBook>(seedAttendance);
  const [statuses, setStatuses] = useState<Record<string, GradeStatus>>(seedStatuses);
  const [visible, setVisible] = useState<Record<string, boolean>>(seedVisibility);
  const [predicted, setPredicted] = useState<number>(95);
  const [notice, setNotice] = useState("");
  const selectedCourse = classes.find(course => course.id === activeClass) || classes[0];
  const currentStatus = statuses[activeClass];
  const canEdit = currentStatus === "DRAFT";
  const student = students[0];
  const launchRole = (next: DemoRole) => { setRole(next); setTab("overview"); setNotice(""); };
  const reset = () => {
    setMarks(seedMarks());
    setAttendance(seedAttendance());
    setStatuses(seedStatuses());
    setVisibility(seedVisibility());
    setPredicted(95);
    setNotice("Sample records restored. No real SAGA records were affected.");
  };
  const setScore = (studentId: string, assessmentId: string, max: number, raw: string) => {
    const parsed = raw === "" ? null : Number(raw);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > max)) return;
    setMarks(previous => ({
      ...previous,
      [activeClass]: {
        ...previous[activeClass],
        [studentId]: { ...previous[activeClass][studentId], [assessmentId]: parsed }
      }
    }));
    setNotice("Score updated in this browser only.");
  };
  const setAttendanceMark = (studentId: string, mark: Attendance) => {
    setAttendance(previous => ({
      ...previous,
      [activeClass]: { ...previous[activeClass], [studentId]: mark }
    }));
    setNotice("Attendance updated in this browser only.");
  };
  const setGradeStatus = (status: GradeStatus) => {
    setStatuses(previous => ({ ...previous, [activeClass]: status }));
    setNotice(status === "VERIFIED"
      ? "Simulated Registrar confirmation completed. No official grade was changed."
      : status === "SUBMITTED" ? "Demo grades submitted for review (simulation only)."
      : "Demo grades recalled to draft for editing.");
  };
  const averageFor = (id: string) => Math.round(students.reduce(
    (sum, person) => sum + scorePercent(id, person.id, marks, attendance), 0
  ) / students.length * 10) / 10;
  const isStudent = role === "student";
  const pageTitle = menus[role || "teacher"].find(item => item.id === tab)?.label || "Overview";

  return <main className={styles.shell}>
    <div className={styles.topbar}>
      <Link className={styles.logo} href="/" aria-label="SAGA Portal home">
        <span className={styles.logoMark}>S</span><span><strong>SAGA</strong><small>PORTAL DEMO</small></span>
      </Link>
      <div className={styles.topActions}>
        {role && <button type="button" className={styles.textButton} onClick={() => { setRole(null); setNotice(""); }}>Switch role</button>}
        <Link className={styles.primaryLink} href="/register">Create an account</Link>
        <Link className={styles.exitLink} href="/">Exit demo</Link>
      </div>
    </div>
    {!role ? <div className={styles.entry}>
      <div className={styles.entryHeader}>
        <span className={styles.kicker}>INTERACTIVE PRODUCT TOUR</span>
        <h1>Test SAGA Portal</h1>
        <p>See how SAGA helps teachers organize class records and students follow academic progress. Choose an experience below—no account or password needed.</p>
      </div>
      <div className={styles.roleGrid}>
        {roleOptions.map(item => <article className={styles.roleCard} key={item.role}>
          <span className={styles.roleIcon} aria-hidden="true">{item.icon}</span>
          <h2>{item.title}</h2><span className={styles.roleSubtitle}>{item.subtitle}</span>
          <p>{item.description}</p>
          <button type="button" className={styles.roleButton} onClick={() => launchRole(item.role)}>Explore {item.role === "admin" ? "Administrator" : item.title} <span aria-hidden="true">→</span></button>
        </article>)}
      </div>
      <p className={styles.disclaimer}>All names, grades, schools, and analytics in this demo are fictional. Interactions stay in your browser and reset when you refresh or leave the page. This is a guided simulation, not a sign-in to the real SAGA portal.</p>
    </div> : <>
      <div className={styles.safetyBar} role="status"><span className={styles.liveDot}/> <strong>DEMO MODE</strong><span>Fictional data only · Local simulation · No account access</span><button type="button" onClick={reset}>↺ Reset demo</button></div>
      <div className={styles.workspace}>
        <aside className={styles.sidebar} aria-label="Demo navigation">
          <div className={styles.schoolTag}><span className={styles.schoolMark}>SC</span><span><strong>SAGA Sample College</strong><small>Demonstration workspace</small></span></div>
          <p className={styles.sideLabel}>EXPLORE</p>
          <nav className={styles.sidebarNav}>
            {menus[role].map(item => <button key={item.id} type="button" aria-current={tab === item.id ? "page" : undefined} className={tab === item.id ? styles.navActive : styles.navItem} onClick={() => { setTab(item.id); setNotice(""); }}><span aria-hidden="true">{item.symbol}</span>{item.label}</button>)}
          </nav>
          <div className={styles.sideFoot}><strong>Sample account</strong><span>{role === "teacher" ? "Prof. Andrea Flores" : isStudent ? student.name : "SAGA Platform Manager"}</span><small>{role === "admin" ? "Read-only demonstration" : "Illustrative academic data"}</small></div>
        </aside>
        <section className={styles.mainContent}>
          <div className={styles.pageHead}>
            <div><span className={styles.kicker}>{role === "teacher" ? "TEACHER PORTAL" : isStudent ? "STUDENT PORTAL" : "TENANT MANAGEMENT PREVIEW"}</span><h1>{pageTitle}</h1><p>{role === "teacher" ? "Manage two sample ECE classes." : isStudent ? "Explore sample academic progress and grades." : "Review fictional school activity without administrative privileges."}</p></div>
            <button type="button" className={styles.switchButton} onClick={() => setRole(null)}>Change experience</button>
          </div>
          {notice && <div className={styles.notice} role="status">{notice}</div>}
          {role === "teacher" && <div className={styles.classSelect}><label htmlFor="demo-class">Current class</label><select id="demo-class" value={activeClass} onChange={event => { setActiveClass(event.target.value); setNotice(""); }}>{classes.map(course => <option key={course.id} value={course.id}>{course.code} — {course.title}</option>)}</select><span>{selectedCourse.schedule}</span></div>}

          {role === "teacher" && tab === "overview" && <>
            <div className={styles.metrics}>
              <Metric label="Active Classes" value="2" hint="A.Y. 2026–2027" />
              <Metric label="Sample Students" value={String(students.length)} hint="Per class" />
              <Metric label="Class Average" value={String(averageFor(activeClass)) + "%"} hint={selectedCourse.code} />
              <Metric label="Pending Submission" value={String(classes.filter(c => statuses[c.id] === "DRAFT").length)} hint="Draft gradebooks" />
            </div>
            <Panel title="My Classes" subtitle="Choose a class to view its sample electronic class record.">
              <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Course</th><th>Students</th><th>Average</th><th>Status</th><th>Action</th></tr></thead><tbody>{classes.map(course => <tr key={course.id}><td><strong>{course.code}</strong><small>{course.title}</small></td><td>{students.length}</td><td>{averageFor(course.id)}%</td><td><Status status={statuses[course.id]}/></td><td><button type="button" className={styles.inlineButton} onClick={() => { setActiveClass(course.id); setTab("scorebook"); }}>Open gradebook →</button></td></tr>)}</tbody></table></div>
            </Panel>
            <div className={styles.hint}>Try Record Scores to edit a mark, then visit My Grades in the Student demo to see the result in this browser session.</div>
          </>}

          {role === "teacher" && tab === "scorebook" && <Panel title={selectedCourse.code + " · Record Scores"} subtitle="Workbook-style sample: scores update weighted percentages immediately. Fields are editable only while the class is in Draft.">
            {!canEdit && <div className={styles.hint}>This sample class is {currentStatus.toLowerCase()}. Go to Grade Submission and choose Recall to Draft before editing scores.</div>}
            <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th className={styles.nameCol}>Student</th>{assessmentItems.map(item => <th key={item.id}>{item.title}<small>{item.weight}% · /{item.max}</small></th>)}<th>Attendance<small>10%</small></th><th>Equivalent<small>of course grade</small></th></tr></thead><tbody>{students.map(person => <tr key={person.id}><td><strong>{person.name}</strong><small>{person.number}</small></td>{assessmentItems.map(item => <td key={item.id}><input type="number" aria-label={person.name + " " + item.title} className={styles.scoreInput} min="0" max={item.max} step="1" disabled={!canEdit} value={marks[activeClass]?.[person.id]?.[item.id] ?? ""} onChange={event => setScore(person.id, item.id, item.max, event.target.value)}/></td>)}<td>{attendance[activeClass]?.[person.id] === "PRESENT" ? "Present" : attendance[activeClass]?.[person.id] === "EXCUSED" ? "Excused" : "Absent"}</td><td><strong>{scorePercent(activeClass, person.id, marks, attendance).toFixed(2)}%</strong></td></tr>)}</tbody></table></div>
            <p className={styles.smallPrint}>Demo calculation: Major Exam 50%, Quizzes 25%, Exercises 15%, Attendance 10%. These illustrative percentages are not an institution's official transmutation scale.</p>
          </Panel>}

          {role === "teacher" && tab === "attendance" && <Panel title={selectedCourse.code + " · Attendance"} subtitle="Try recording a sample class meeting. Each change stays in local browser memory.">
            {!canEdit && <div className={styles.hint}>Recall this gradebook to Draft under Grade Submission to edit its attendance.</div>}
            <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Student</th><th>Student ID</th><th>Attendance</th></tr></thead><tbody>{students.map(person => <tr key={person.id}><td><strong>{person.name}</strong></td><td>{person.number}</td><td><select className={styles.attendanceSelect} aria-label={"Attendance for " + person.name} value={attendance[activeClass]?.[person.id]} disabled={!canEdit} onChange={event => setAttendanceMark(person.id, event.target.value as Attendance)}><option value="PRESENT">Present</option><option value="ABSENT">Absent</option><option value="EXCUSED">Excused</option></select></td></tr>)}</tbody></table></div>
          </Panel>}

          {role === "teacher" && tab === "publication" && <Panel title="Grade Submission & Visibility" subtitle="Preview the existing SAGA class statuses and control what a sample student can see.">
            <div className={styles.publicationGrid}>
              <div><span className={styles.metaLabel}>CLASS STATUS</span><p><Status status={currentStatus}/></p><span className={styles.metaLabel}>STUDENT VISIBILITY</span><p><strong>{visible[activeClass] ? "Visible to students" : "Hidden from students"}</strong></p></div>
              <div className={styles.publicationActions}>
                <button type="button" className={styles.outlineButton} onClick={() => { setVisible(previous => ({ ...previous, [activeClass]: !previous[activeClass] })); setNotice("Sample student visibility changed in this browser only."); }}>{visible[activeClass] ? "Hide sample grades" : "Show sample grades"}</button>
                {currentStatus === "DRAFT" ? <button type="button" className={styles.actionButton} onClick={() => setGradeStatus("SUBMITTED")}>Submit demo grades</button> : <>
                  {currentStatus === "SUBMITTED" && <button type="button" className={styles.actionButton} onClick={() => setGradeStatus("VERIFIED")}>Simulate Registrar confirmation</button>}
                  <button type="button" className={styles.outlineButton} onClick={() => setGradeStatus("DRAFT")}>Recall to Draft</button>
                </>}
              </div>
            </div>
            <p className={styles.smallPrint}>This only simulates Teacher actions currently present in SAGA; it does not contact the Registrar or authorize actual grade changes.</p>
          </Panel>}

          {role === "student" && tab === "overview" && <>
            <div className={styles.metrics}>
              <Metric label="My Classes" value={String(classes.length)} hint="First semester" />
              <Metric label="Published Classes" value={String(classes.filter(c => visible[c.id]).length)} hint="Teacher-controlled" />
              <Metric label="My Grade Average" value={(classes.reduce((total, c) => total + scorePercent(c.id, student.id, marks, attendance), 0) / classes.length).toFixed(1) + "%"} hint="Illustrative only" />
              <Metric label="School Year" value="2026–27" hint="Sample academic year" />
            </div>
            <Panel title={"Welcome, " + student.name} subtitle="Your fictional class results are shown below.">
              <div className={styles.courseGrid}>{classes.map(course => <article className={styles.courseCard} key={course.id}><span className={styles.kicker}>{course.code}</span><h3>{course.title}</h3><p>{course.instructor}</p>{visible[course.id] ? <><strong className={styles.courseGrade}>{scorePercent(course.id, student.id, marks, attendance).toFixed(2)}%</strong><p><Status status={statuses[course.id]}/></p></> : <p className={styles.hint}>Grades are not yet published.</p>}</article>)}</div>
            </Panel>
          </>}

          {role === "student" && tab === "grades" && <Panel title="My Academic Records" subtitle="Students can view only their own sample records here.">
            <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Class</th><th>Weighted %</th><th>Sample Equivalent</th><th>Academic Status</th></tr></thead><tbody>{classes.map(course => <tr key={course.id}><td><strong>{course.code}</strong><small>{course.title}</small></td>{visible[course.id] ? <><td>{scorePercent(course.id, student.id, marks, attendance).toFixed(2)}%</td><td>{gradeEquivalent(scorePercent(course.id, student.id, marks, attendance))}</td><td><Status status={statuses[course.id]}/></td></> : <td colSpan={3}>Grades hidden by teacher</td>}</tr>)}</tbody></table></div>
            <p className={styles.smallPrint}>All grades are examples for demonstration and have no official academic validity.</p>
          </Panel>}

          {role === "student" && tab === "simulator" && <Panel title="Grade What-If Simulator" subtitle="Experiment with an alternative exam score. This never changes your actual—or simulated saved—grades.">
            <label className={styles.simLabel} htmlFor="demo-sim-course">Choose a class</label><select id="demo-sim-course" className={styles.simSelect} value={activeClass} onChange={event => setActiveClass(event.target.value)}>{classes.map(course => <option key={course.id} value={course.id}>{course.code} — {course.title}</option>)}</select>
            <label className={styles.simLabel} htmlFor="demo-predicted-score">Hypothetical Major Exam score (out of 100): <strong>{predicted}</strong></label><input className={styles.slider} id="demo-predicted-score" type="range" min="0" max="100" step="1" value={predicted} onChange={event => setPredicted(Number(event.target.value))}/>
            <div className={styles.simResults}><div><span>Recorded sample grade</span><strong>{scorePercent(activeClass, student.id, marks, attendance).toFixed(2)}%</strong></div><div><span>Predicted what-if grade</span><strong>{scorePercent(activeClass, student.id, marks, attendance, predicted).toFixed(2)}%</strong></div></div>
            <p className={styles.smallPrint}>The prediction modifies only the exam component for this view. No scores are saved, and the sample equivalent is illustrative.</p>
          </Panel>}

          {role === "admin" && tab === "overview" && <>
            <div className={styles.metrics}><Metric label="Sample Schools" value="3" hint="Fictional tenants" /><Metric label="Teacher Accounts" value="18" hint="Sample total" /><Metric label="Student Accounts" value="524" hint="Sample total" /><Metric label="Active Workspaces" value="2" hint="Sample status" /></div>
            <Panel title="Platform Snapshot" subtitle="Illustrative multi-school management view.">
              <div className={styles.adminPanels}><div><strong>School workspaces</strong><p>Review subscription and account totals from one place.</p></div><div><strong>Data separation</strong><p>Each live school's academic data is protected by tenant boundaries.</p></div><div><strong>Account verification</strong><p>Manage verified accounts through the authenticated administrator tools.</p></div></div>
              <button className={styles.inlineButton} type="button" onClick={() => setTab("schools")}>Explore fictional schools →</button>
            </Panel>
          </>}

          {role === "admin" && tab === "schools" && <Panel title="School Workspaces" subtitle="Read-only preview of tenant management. Editing subscriptions, accounts, or identities is intentionally unavailable in this public demo.">
            <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>School</th><th>Plan</th><th>Teachers</th><th>Students</th><th>Status</th></tr></thead><tbody>{[
              { name: "SAGA Sample College", plan: "Premium", teachers: 10, students: 310, active: true },
              { name: "Eastview Technical College", plan: "Free", teachers: 1, students: 86, active: true },
              { name: "Northfield Learning Institute", plan: "Premium", teachers: 7, students: 128, active: false }
            ].map(school => <tr key={school.name}><td><strong>{school.name}</strong></td><td>{school.plan}</td><td>{school.teachers}</td><td>{school.students}</td><td><span className={school.active ? styles.goodPill : styles.draftPill}>{school.active ? "Active" : "Suspended"}</span></td></tr>)}</tbody></table></div>
          </Panel>}
        </section>
      </div>
    </>}
  </main>;
}

function Status({ status }: { status: GradeStatus }) {
  return <span className={status === "VERIFIED" ? styles.goodPill : status === "SUBMITTED" ? styles.progressPill : styles.draftPill}>{status === "VERIFIED" ? "Verified" : status === "SUBMITTED" ? "Provisional" : "Draft"}</span>;
}
function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <article className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>;
}
function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className={styles.panel}><header className={styles.panelHead}><h2>{title}</h2><p>{subtitle}</p></header>{children}</section>;
}
