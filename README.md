# SAGA Portal

SAGA (School Assessment, Grading & Analytics) is a multi-school grading portal built with Next.js, Bootstrap, PostgreSQL/Neon, and Prisma. Each school has an isolated workspace. Teachers manage their own classes; students see grades linked to their accounts. The system supports terms, academic years, class rosters, weighted assessment categories, attendance, analytics, grade publication, and final-grade equivalents.

## Current features

- Separate teacher and student account roles.
- Teacher-created subjects with a class roster, assessment categories, editable weights, configurable percentage conversion, and editable final-grade thresholds/remarks.
- Assessment scores are entered against maximum points and calculated using category weights. Sample categories reflect the current spreadsheet’s 20/30/25/15/10 weights and its 70/30 conversion for scored work; attendance/participation defaults to direct percentage.
- Students register with their student number; teachers link the account to the correct roster record before grades can appear.
- Teacher-controlled publication; students see only published subjects linked to their account.
- Profile name editing, hashed passwords, signed HttpOnly sessions, secure production cookies, request validation, database-backed auth throttling, and grade-change audit events for key teacher actions.
- Responsive Bootstrap UI for desktop and mobile.

SAGA is an independently operated service and is not an official system of any school unless that school has separately authorized its use. The supplied workbooks are not included in this repository. They contain personal academic information and must be handled securely. Before entering real student data, the portal owner and each participating teacher should establish their respective responsibilities, lawful basis, notice, retention, access, and incident procedures under the Data Privacy Act of 2012. Obtain guidance from the appropriate privacy professional or Data Protection Officer where applicable.

## Local setup

Requirements: Node.js 20.19+ (or a supported current LTS), npm, and PostgreSQL. For Neon, use the pooled connection string as `DATABASE_URL` and the direct connection string as `DIRECT_URL`.

1. Copy `.env.example` to `.env` and set the database URLs, a random `AUTH_SECRET` of at least 32 characters, and a long `TEACHER_INVITE_CODE`.
2. Run `npm install`.
3. Run `npm run db:push` to create/update the development schema.
4. Run `npm run dev` and open `http://localhost:3000`.
5. Share the teacher invitation code only with approved teachers. Rotate it if it is exposed.

The grade scale and default weights are examples based on the supplied grade sheet. A teacher should confirm course-specific grading rules before entering or publishing actual results.

## Deploying on Vercel + Neon

1. Connect this repository to a Vercel project and provision a Neon PostgreSQL database in a region suitable for the intended users and applicable privacy obligations.
2. Add `DATABASE_URL` (pooled runtime URL), `DIRECT_URL` (direct migration URL), `AUTH_SECRET`, and `TEACHER_INVITE_CODE` to Vercel’s environment variables. Use separate random secrets for production and preview deployments.
3. Apply the reviewed Prisma migration against the intended database before opening the app to users. Configure `SAGA_TENANT_MANAGER_EMAIL` to the same email identity used by the CLEAR global administrator; that account must also have an active SAGA teacher login. Do not point a local or preview deployment at the production student database.
4. Deploy and confirm database connection, account creation, student/teacher access separation, roster linking, score calculations, and publication behavior with synthetic records before importing real data.
5. Configure backups, retention, access to deployment logs, incident response, and a way for authorized staff to fulfill privacy requests.

## Before real student records are used

- Complete the `/privacy` notice with the portal operator’s verified contact details, purposes, lawful basis, retention period, hosting/data-processing terms, and rights-request process. Consult the applicable Data Protection Officer or privacy professional. Do not imply school endorsement or approval.
- Add email verification and a secure password-reset process. Student accounts are intentionally not linked to grades until a teacher verifies and links the account to a roster entry.
- Set up a controlled process for issuing and rotating the teacher invitation code.
- Review Vercel and Neon processing terms and the selected hosting/database regions; determine who is responsible for records when other faculty use the portal. Use least-privilege access and restrict production database credentials.
- Migrate legacy workbooks only through an approved, secure process. Do not commit workbooks, class lists, student numbers, grades, credentials, or database dumps to GitHub.
- Run a security and accessibility review, and check the exact grading rules against each course’s approved syllabus before publication.

## Notes on data migration

The legacy HTML page performs a local name search inside an uploaded workbook; it is not a multi-user database. SAGA is a multi-tenant service; each school workspace is isolated from the others. This portal does not import the supplied workbooks automatically. Teachers can paste roster rows into a class using `Full Name<TAB>Student Number` lines. Assessment definitions and marks should be entered or migrated only after the responsible person approves the handling process and the conversion is reconciled against the source grade sheets.
