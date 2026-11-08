import Link from "next/link";

const fcuPrivacyPolicy = "https://filamer.edu.ph/about-us/data-privacy-policy/";

export default function PrivacyPage() {
  return <main className="privacy-page"><div className="privacy-document">
    <Link href="/login" className="privacy-back">← Back to sign in</Link>
    <p className="eyebrow text-primary mt-4">FACULTY GRADE PORTAL</p>
    <h1>Privacy</h1>
    <p className="privacy-updated">A personal, independent faculty tool</p>
    <p>This portal is operated by <b>Engr. Kenneth Mark Bulquerin of Filamer Christian University</b>. It is a personal project, not an official FCU service, and is not operated or endorsed by the University.</p>
    <h2>How this portal uses information</h2>
    <p>The portal stores student names, student numbers, email addresses, course and year details, class enrollment, assessments, and grades to manage rosters and share published results with linked students. Teachers can access records for classes they manage; students can see only their own published results. Vercel and Neon provide the portal’s hosting and database services.</p>
    <h2>FCU Data Privacy Policy</h2>
    <p>FCU’s published policy describes the University’s privacy practices. This portal is independently operated; the policy is linked here as a reference.</p>
    <p><a className="btn btn-outline-primary btn-sm" href={fcuPrivacyPolicy} target="_blank" rel="noreferrer">Read FCU’s Data Privacy Policy ↗</a></p>
    <h2>Questions or privacy requests</h2>
    <p>For questions or requests about information in this portal, contact Engr. Bulquerin at <a href="mailto:kennethmark.bulquerin@filamer.edu.ph">kennethmark.bulquerin@filamer.edu.ph</a>.</p>
    <div className="privacy-footer">Do not add student information to this portal unless you are authorized to manage the relevant class records.</div>
  </div></main>;
}
