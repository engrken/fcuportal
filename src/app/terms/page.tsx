import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function TermsOfServicePage({ searchParams }: { searchParams: Promise<{ schoolId?: string }> }) {
  const { schoolId } = await searchParams;
  const school = schoolId ? await prisma.school.findFirst({ where: { id: schoolId, isActive: true }, select: { name: true } }) : null;
  return <main className="privacy-page"><article className="privacy-document">
    <Link href="/" className="privacy-back">← Back to SAGA Portal</Link>
    <p className="eyebrow text-primary mt-4">SAGA PORTAL</p>
    <h1>Terms of Service</h1>
    <p className="privacy-updated">Effective November 12, 2026 · Version 2026-11-12{school ? ` · ${school.name} workspace` : ""}</p>
    <div className="alert alert-primary small">Please read these terms before creating an account. Your acceptance is recorded with your account. The Privacy Notice is provided separately and explains personal information handling.</div>

    <h2>1. Agreement and scope</h2>
    <p>These Terms of Service (“Terms”) apply when you create or use an account on SAGA Portal. By selecting “I agree to the Terms of Service” during registration, you accept these Terms. If you do not agree, do not create or use an account.</p>
    <p>SAGA Portal provides tools for school class rosters, assessment records, attendance, grade calculations, and student access to released results. A school’s own policies, instructions, and authorized agreements may also apply to its workspace.</p>

    <h2>2. Accounts and eligibility</h2>
    <p>You must provide accurate information and use the account type that applies to you. Students must use the school and student details requested during registration. Faculty accounts may require an invitation code or school authorization. Do not share your password, impersonate another person, or allow another person to use your account.</p>
    <p>You are responsible for activity performed through your account. Notify your school portal administrator if you believe your account has been accessed or used without permission.</p>

    <h2>3. School records and responsibilities</h2>
    <p>Faculty may use the portal only for authorized educational purposes and must follow their school’s instructions when adding rosters, attendance, assessments, and grades. Students may access only records linked to their own account. Do not access, copy, alter, or disclose another person’s records without authorization.</p>
    <p>Portal calculations and statuses support record management. The school’s authorized academic process determines official grades and corrections. Unless a school has expressly adopted the service, SAGA Portal is an independently operated service and is not an official school system.</p>

    <h2>4. Acceptable use</h2>
    <p>You agree not to misuse the service, bypass access controls, submit false information, upload malicious content, interfere with its operation, or use it to violate another person’s rights or applicable policies. Do not use the portal to publish student records publicly or for unrelated commercial purposes.</p>

    <h2>5. Information and privacy</h2>
    <p>Use of the service may involve account details and education records needed to provide its functions. The <Link href={schoolId ? `/privacy?schoolId=${encodeURIComponent(schoolId)}` : "/privacy"}>Privacy Notice</Link> describes the information handled for a school workspace and how to direct questions or requests. School users must follow their school’s privacy instructions when handling student information.</p>

    <h2>6. Content and service materials</h2>
    <p>You retain responsibility for information you enter and must have authority to provide it. You authorize the service to host and process that information only as needed to operate the portal and its requested features. SAGA Portal names, interface, and software are protected by applicable intellectual-property rights; these Terms do not transfer ownership of them to you.</p>

    <h2>7. Availability, plans, and changes</h2>
    <p>Access may depend on an active school workspace, the applicable plan, and school configuration. Features and limits may change; any applicable plan fees will be shown through the service or communicated by the service operator before activation. The service may be unavailable during maintenance or due to technical issues.</p>

    <h2>8. Suspension and account closure</h2>
    <p>Access may be restricted or an account may be suspended when necessary to protect users, records, service security, or to comply with school instructions or applicable requirements. Contact your school administrator about access, class membership, or an account closure request. School record retention may be governed by the school’s policy.</p>

    <h2>9. Service limitations</h2>
    <p>The portal is provided as an administrative tool. You should review important entries and calculations before relying on them. To the extent allowed by applicable law, the service operator is not responsible for decisions made by a school or for losses caused by inaccurate information entered by a user, unauthorized account sharing, or a temporary interruption. Nothing in these Terms removes rights that cannot lawfully be excluded.</p>

    <h2>10. Updates and contact</h2>
    <p>These Terms may be updated as the service changes. If an update requires renewed acceptance, the portal will request it before the affected account continues using the applicable service. For questions about an account or school records, contact the school portal administrator. For service questions, use the contact channel provided by the SAGA Portal operator.</p>

    <div className="privacy-footer">These Terms are a service agreement template for SAGA Portal. A participating school may need to adopt or supplement them for its own use. The Privacy Notice remains a separate document.</div>
    <div className="mt-4"><Link className="btn btn-primary" href="/register">Create an account</Link></div>
  </article></main>;
}
