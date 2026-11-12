"use client";

import { useEffect, useState } from "react";

type GuideRole = "TEACHER" | "STUDENT";
type GuideTab = "quick" | "faq" | "student" | "faculty";

const steps = {
  TEACHER: [
    { title: "Start at Overview", text: "Use the date range, dashboard metrics, student lookup, and Upcoming Work to see what needs attention." },
    { title: "Set up your classes", text: "Open My classes to choose a class. Add its schedule, roster, grading categories, and assessment items." },
    { title: "Record scores and attendance", text: "Use Record Scores for assessment marks. Use Attendance for each meeting; choose Face-to-Face or Online and add a make-up reason when needed." },
    { title: "Review and share grades", text: "Check totals, export or print records, then submit grades for review. Student visibility follows the record status shown in the portal." },
    { title: "Get help any time", text: "Open Help & guides for FAQs, this tour, or the student and faculty manuals. You can revisit this guide whenever you need it." }
  ],
  STUDENT: [
    { title: "Open your Academic overview", text: "Your linked classes and released grade information appear here. If a class is missing, ask your instructor to confirm your roster details." },
    { title: "Review a class grade", text: "Open a grade card to see the reported course result and any assessment details that your instructor has released." },
    { title: "Understand grade status", text: "A provisional grade is awaiting final confirmation. A final grade has been verified. Draft records are not released to students." },
    { title: "Use Quick Check", text: "If enabled by your school, Quick Check lets you look up released grades using your Student ID and the required matching details." },
    { title: "Get help any time", text: "Open Help & guides for common questions and the Student Manual. You can close or skip this tour and return to it later." }
  ]
} satisfies Record<GuideRole, Array<{ title: string; text: string }>>;

const faqs = [
  ["Why is a class missing from my account?", "Students only see classes linked to their account and grades released by the instructor. Ask your instructor to check the roster email and Student ID."],
  ["What does Provisional mean?", "The grade has been submitted but is awaiting final confirmation. A verified Final grade is the official result shown by the portal."],
  ["Can students see another student’s grades?", "No. Student accounts can access only their own released academic records."],
  ["Why can’t I see assessment details?", "The instructor may not have released the record yet, or the specific assessment information may not be available for student viewing."],
  ["How is attendance counted?", "Attendance is recorded by class meeting. Present, absent, and excused totals are shown; excused meetings are excluded from the absence rate."],
  ["How do I correct a wrong score or attendance mark?", "Contact the instructor responsible for the class. Instructors can review and update records while the class record is editable."],
  ["What should I do if I cannot sign in?", "Check that you are using the correct email and school. Use the account recovery option if available, or contact your school portal administrator."],
  ["Where can I find instructions?", "Open Help & guides from the sidebar or top bar. It contains this quick guide, FAQs, and separate student and faculty manuals."]
];

const studentManual = [
  ["1. Sign in or register", "Choose your school and use the email associated with your student account. If registration or verification is required, follow the on-screen instructions."],
  ["2. Check your Academic overview", "Your overview lists classes linked to your account and grade information released by your instructors. Use Quick Check when your school has enabled it."],
  ["3. Review grades", "Open a class or grade card to see the course result and available itemized assessment details. A blank or hidden record may not have been released."],
  ["4. Read the status", "Draft records are not released. Provisional records are submitted and awaiting final confirmation. Verified records are final."],
  ["5. Protect your account", "Keep your sign-in details private and sign out on shared devices. You can view only the academic records linked to your account."],
  ["6. Ask for help", "For a missing class, incorrect Student ID, or score question, contact the instructor or school portal administrator. Include the class code and a clear description."]
];

const facultyManual = [
  ["1. Create a class", "Open My classes and add a subject. Enter the class ID, course code, description, term, school year, and scheduled meeting days."],
  ["2. Build the roster", "Add students individually or import a roster. Use each student’s correct name, Student ID, and email so records can be linked accurately."],
  ["3. Configure grading", "Create grading categories and subcategories, assign their weights, and confirm the overall grading path totals 100% before entering scores."],
  ["4. Add assessment items", "Create items under the correct category with a title, date, and perfect score. Grouped categories help keep large gradebooks readable."],
  ["5. Record scores", "Open Record Scores, enter marks or a supported remark, and review the calculated results. Export or print the record when needed."],
  ["6. Record attendance", "Add an attendance day, choose Face-to-Face or Online, and use a make-up class reason for off-schedule meetings. Mark students Present, Absent, or Excused."],
  ["7. Review and submit", "Check the roster, weighting, and results. Submit the class record when ready; follow the displayed status for review and final confirmation."],
  ["8. Use student lookup and reports", "Use Smart student search and Overview filters to review linked class records and activity. Limit access to authorized school accounts."]
];

export function OnboardingGuide({ role, open, onClose, onOpenHelp }: { role: GuideRole; open: boolean; onClose: () => void; onOpenHelp: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => { if (open) setStep(0); }, [open]);
  if (!open) return null;
  const items = steps[role];
  const current = items[step];
  return <div className="guide-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="guide-dialog onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <button type="button" className="guide-close" aria-label="Close onboarding guide" onClick={onClose}>×</button>
      <span className="guide-eyebrow">WELCOME TO SAGA PORTAL</span>
      <div className="guide-progress" aria-label={"Step " + (step + 1) + " of " + items.length}>{items.map((_, index) => <span key={index} className={index <= step ? "done" : ""}/>)}</div>
      <span className="guide-step-label">STEP {step + 1} OF {items.length}</span>
      <h2 id="onboarding-title">{current.title}</h2>
      <p>{current.text}</p>
      <div className="guide-actions">
        <button type="button" className="btn btn-link guide-skip" onClick={onClose}>Skip guide</button>
        <button type="button" className="btn btn-outline-secondary" onClick={onOpenHelp}>Help &amp; manuals</button>
        {step > 0 && <button type="button" className="btn btn-outline-secondary" onClick={() => setStep(value => value - 1)}>Back</button>}
        <button type="button" className="btn btn-primary" onClick={() => step === items.length - 1 ? onClose() : setStep(value => value + 1)}>{step === items.length - 1 ? "Finish guide" : "Next"}</button>
      </div>
      <small className="guide-revisit-note">You can reopen this tour later from Help &amp; guides.</small>
    </section>
  </div>;
}

export function HelpCenter({ role, open, initialTab = "quick", pageContext, onClose, onStartTour }: { role: GuideRole; open: boolean; initialTab?: GuideTab; pageContext: string; onClose: () => void; onStartTour: () => void }) {
  const [tab, setTab] = useState<GuideTab>(initialTab);
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);
  if (!open) return null;
  return <div className="guide-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="guide-dialog help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <header className="help-header"><div><span className="guide-eyebrow">SAGA PORTAL SUPPORT</span><h2 id="help-title">Help &amp; guides</h2><p>Guidance for {pageContext} and the rest of your portal.</p></div><button type="button" className="guide-close" aria-label="Close Help & guides" onClick={onClose}>×</button></header>
      <nav className="help-tabs" aria-label="Help topics">
        <button type="button" className={tab === "quick" ? "active" : ""} onClick={() => setTab("quick")}>Quick guide</button>
        <button type="button" className={tab === "faq" ? "active" : ""} onClick={() => setTab("faq")}>FAQs</button>
        <button type="button" className={tab === "student" ? "active" : ""} onClick={() => setTab("student")}>Student manual</button>
        <button type="button" className={tab === "faculty" ? "active" : ""} onClick={() => setTab("faculty")}>Faculty manual</button>
      </nav>
      <div className="help-content">
        {tab === "quick" && <div className="help-quick-guide"><h3>{pageContext}</h3><p>{role === "TEACHER" ? "Use the sidebar to move between Overview, My classes, profile, and Help. Open a class to access its setup, roster, grading, assessment, score, and attendance tools." : "Use Academic overview to view your linked classes and any grade records your instructors have released. Your student manual explains each step."}</p><button type="button" className="btn btn-primary btn-sm" onClick={onStartTour}>Start the guided tour</button></div>}
        {tab === "faq" && <div className="help-faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>}
        {tab === "student" && <div className="help-manual"><p className="help-intro">Student instructions for using SAGA Portal to access released academic records.</p>{studentManual.map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}</div>}
        {tab === "faculty" && <div className="help-manual"><p className="help-intro">Faculty instructions for setting up classes, maintaining records, and sharing results.</p>{facultyManual.map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}</div>}
      </div>
      <footer className="help-footer"><span>Need assistance? Contact your school portal administrator.</span><button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose}>Close</button></footer>
    </section>
  </div>;
}
