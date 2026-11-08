import Link from "next/link";

export default function PrivacyPage() {
  return <main className="privacy-page"><div className="privacy-document">
    <Link href="/login" className="privacy-back">← Back to sign in</Link>
    <p className="eyebrow text-primary mt-4">FACULTY GRADE PORTAL</p>
    <h1>Privacy Notice</h1>
    <p className="privacy-updated">Independent faculty tool · Notice template · November 2026</p>
    <div className="alert alert-warning small">This portal is a personal, independently operated project. It is not an official FCU portal and is not endorsed or administered by FCU. Before adding real student records, the portal operator and each participating teacher should determine and document their responsibilities and complete this notice with accurate details.</div>
    <h2>Who operates this portal</h2>
    <p>This portal is operated by <b>[portal owner name and contact email]</b> as an independent faculty tool. Teachers who use it manage the subjects and class records they create. Use of the portal does not, by itself, mean that an educational institution has approved it.</p>
    <h2>Purpose and information processed</h2>
    <p>The portal supports class rosters, assessment records, grade computation, and private release of results to students linked to a class record. Information may include account name, email address, role, student number, course/program, year level, class enrollment, assessment scores, calculated grades, publication status, and security/audit records. Student directory details are used to match registration and class records. Do not enter sensitive information that is not needed for these purposes.</p>
    <h2>Access and sharing</h2>
    <p>Teachers can access only subjects and class records they create. A student can access only published results linked to that student’s account. The portal operator and hosting/database providers may have technical access needed to operate, secure, back up, or support the service. Do not assume records are shared with or managed by FCU. Do not enter another teacher’s or institution’s student records without an agreed, authorized process.</p>
    <h2>Lawful basis, retention, and rights</h2>
    <p><b>[Complete before use:]</b> State the applicable lawful basis and purposes; retention and deletion schedule; how people can request access, correction, deletion where applicable, or raise a concern; and how requests will be handled. The portal owner and each participating teacher should clarify their roles under the Data Privacy Act of 2012 with an appropriate privacy professional or Data Protection Officer where applicable.</p>
    <h2>Hosting and security</h2>
    <p>The application uses password hashing, signed HttpOnly session cookies, role checks, per-teacher data access checks, and database-backed throttling for sign-in and registration attempts. Hosting and database vendors may process or store information to provide the service. Review their terms, data locations, backups, retention, access controls, and incident-response arrangements before using real records.</p>
    <h2>Contact</h2>
    <p className="privacy-placeholder">Portal operator: [name] · Contact: [privacy email] · Retention period: [period] · Hosting/data location: [details]</p>
    <div className="privacy-footer">This notice is a template, not legal advice or a certification of compliance. Do not use it until the placeholders are completed and the responsibilities for records are clear.</div>
  </div></main>;
}
