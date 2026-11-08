import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ schoolId?: string }> }) {
  const { schoolId } = await searchParams;
  const school = schoolId ? await prisma.school.findFirst({ where: { id: schoolId, isActive: true }, select: { name: true, privacyController: true, privacyContactEmail: true, privacyPolicyUrl: true } }) : null;
  const schoolName = school?.name || "the school selected for this portal";
  return <main className="privacy-page"><div className="privacy-document">
    <Link href="/" className="privacy-back">← Back to school selection</Link>
    <p className="eyebrow text-primary mt-4">STUDENT GRADE PORTAL</p>
    <h1>Privacy Notice</h1>
    <p className="privacy-updated">{school ? `${school.name} workspace · November 2026` : "School workspace · November 2026"}</p>
    <div className="alert alert-warning small">This service is independently operated. It is not an official system of any school unless the school has separately confirmed and authorized that relationship. Teachers should enter student records only for an approved educational purpose.</div>
    <h2>Who is responsible</h2>
    <p>This portal workspace is configured for <b>{schoolName}</b>. The data controller for a class record is <b>{school?.privacyController || schoolName}</b>. Each participating teacher is responsible for records they create and for following their school’s instructions. {school?.privacyPolicyUrl && <>Read the school’s <a href={school.privacyPolicyUrl} target="_blank" rel="noreferrer">privacy policy</a>.</>}</p>
    <h2>Purpose and information processed</h2>
    <p>The portal supports class rosters, attendance, assessment records, grade computation, and release of results to students. Information may include name, email address, student ID, course/program, year level, class enrollment, attendance, assessment scores, calculated grades, account information, and security records.</p>
    <h2>Access and school separation</h2>
    <p>Accounts, class records, and student directories are assigned to a selected school workspace. Teachers can access class records only within their school workspace. Students can access grades linked to their account. Quick Check requires the school, student ID, and matching email. Submitted grades remain provisional until the teacher publishes the final grade record.</p>
    <h2>Retention and requests</h2>
    <p>Records should be retained only for the period required by the school’s purpose and policy. For access, correction, deletion where applicable, or privacy concerns, contact the responsible school privacy contact or the teacher managing the class. Applicable legal obligations, including the Data Privacy Act of 2012, should be assessed by the school’s privacy professional or Data Protection Officer.</p>
    <h2>Hosting and security</h2>
    <p>The application uses password hashing, signed HttpOnly session cookies, role checks, school-scoped data access, and throttling for authentication and Quick Check attempts. Hosting and database providers may process or store information to operate the service. No online service can guarantee zero risk.</p>
    <h2>Contact</h2>
    <p className="privacy-placeholder">{school?.privacyController || schoolName}{school?.privacyContactEmail ? ` · ${school.privacyContactEmail}` : " · Contact your school for privacy requests"}</p>
    <div className="privacy-footer">This notice is a service template for the selected school workspace. Each school must review and complete its own privacy details before using real student records. It is not legal advice or a certification of compliance.</div>
  </div></main>;
}
