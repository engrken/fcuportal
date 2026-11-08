import Link from "next/link";

export default function PrivacyPage() {
  return <main className="privacy-page"><div className="privacy-document">
    <Link href="/" className="privacy-back">← Back to home</Link>
    <p className="eyebrow text-primary mt-4">FACULTY GRADE PORTAL</p>
    <h1>Privacy Notice</h1>
    <p className="privacy-updated">Independent faculty tool · November 2026</p>
    <div className="alert alert-warning small">This is a personal project operated by Engr. Kenneth Mark Bulquerin. It is not an official FCU portal and is not endorsed or administered by Filamer Christian University. Teachers should add real student records only when they are authorized to do so and have determined the appropriate purpose and lawful basis.</div>
    <h2>Who operates this portal</h2>
    <p>This portal is operated by <b>Engr. Kenneth Mark Bulquerin</b> as an independent faculty tool. Participating teachers manage the class records they create. FCU's <a href="https://filamer.edu.ph/about-us/data-privacy-policy/" target="_blank" rel="noreferrer">Data Privacy Policy</a> applies to FCU's own processing and is provided as a reference; this personal portal is not an FCU system.</p>
    <h2>Purpose and information processed</h2>
    <p>The portal supports class rosters, assessment records, grade computation, and release of results to students. Information may include name, email address, student ID, course/program, year level, class enrollment, assessment scores, calculated grades, account and security records. Quick Check compares a student's ID and directory email before showing submitted grades. Account registration also checks those details against the class directory.</p>
    <h2>Access and sharing</h2>
    <p>Teachers can access only subjects and class records they create. A signed-in student can see submitted results linked to their account. Quick Check provides a limited access path using the student's exact ID and email address and is rate-limited. Submitted grades are marked provisional until a separate portal registrar account verifies them. This status does not submit grades to or verify grades with FCU. The portal operator and hosting/database providers may have technical access needed to operate the service.</p>
    <h2>Lawful basis, retention, and rights</h2>
    <p>The teacher managing each class should identify the appropriate purpose and lawful basis and tell students how their records will be used. Records should be kept only as long as needed for the stated purpose, then securely removed. For access, correction, deletion requests where applicable, or privacy concerns, contact the portal operator. Each participating teacher should clarify their responsibilities under the Data Privacy Act of 2012 with an appropriate privacy professional or Data Protection Officer where applicable.</p>
    <h2>Hosting and security</h2>
    <p>The application uses password hashing, signed HttpOnly session cookies, role checks, per-teacher data access checks, and database-backed throttling for sign-in, registration, and Quick Check attempts. Hosting and database vendors may process or store information to provide the service. No online service can guarantee zero risk.</p>
    <h2>Contact</h2>
    <p className="privacy-placeholder">Portal operator: Engr. Kenneth Mark Bulquerin · Contact: kennethmark.bulquerin@filamer.edu.ph</p>
    <div className="privacy-footer">This notice describes this independent portal. It is not legal advice or a certification of compliance. Teachers remain responsible for ensuring they are authorized to enter and share the student records they manage.</div>
  </div></main>;
}
