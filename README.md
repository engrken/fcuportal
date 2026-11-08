# FCU Student Portal

A multi-teacher academic portal built with Next.js, Bootstrap, PostgreSQL/Neon, and Prisma. It starts from the grade-sheet structure in the supplied samples: subject code/title, term and academic year, class roster, weighted assessment categories, total percentage, final-grade equivalent, and remarks.

## Current features

- Separate teacher and student account roles.
- Teacher-created subjects with a class roster, assessment categories, editable weights, configurable percentage conversion, and editable final-grade thresholds/remarks.
- Assessment scores are entered against maximum points and calculated using category weights. Sample categories reflect the current spreadsheet’s 20/30/25/15/10 weights and its 70/30 conversion for scored work; attendance/participation defaults to direct percentage.
- Students register with their student number; teachers link the account to the correct roster record before grades can appear.
- Teacher-controlled publication; students see only published subjects linked to their account.
- Profile name editing, hashed passwords, signed HttpOnly sessions, secure production cookies, request validation, database-backed auth throttling, and grade-change audit events for key teacher actions.
- Responsive Bootstrap UI for desktop and mobile.

This is an application foundation, not a statement of institutional approval or legal compliance. The supplied workbooks are not included in this repository. They contain personal academic information and must be handled under FCU’s approved privacy, retention, and access procedures.

## Local setup

Requirements: Node.js 20.19+ (or a supported current LTS), npm, and PostgreSQL. For Neon, use the pooled connection string as `DATABASE_URL` and the direct connection string as `DIRECT_URL`.

1. Copy `.env.example` to `.env` and set the database URLs, a random `AUTH_SECRET` of at least 32 characters, and a long `TEACHER_INVITE_CODE`.
2. Run `npm install`.
3. Run `npm run db:push` to create/update the development schema.
4. Run `npm run dev` and open `http://localhost:3000`.
5. Share the teacher invitation code only with approved teachers. Rotate it if it is exposed.

The grade scale and default weights are examples based on the supplied grade sheet. A teacher should confirm course-specific grading rules before entering or publishing actual results.

## Deploying on Vercel + Neon

1. Connect this repository to a Vercel project and provision a Neon PostgreSQL database in the closest supported region to FCU users.
2. Add `DATABASE_URL` (pooled runtime URL), `DIRECT_URL` (direct migration URL), `AUTH_SECRET`, and `TEACHER_INVITE_CODE` to Vercel’s environment variables. Use separate random secrets for production and preview deployments.
3. Run the Prisma schema setup against the intended database before opening the app to users. Do not point a local or preview deployment at the production student database.
4. Deploy and confirm database connection, account creation, student/teacher access separation, roster linking, score calculations, and publication behavior with synthetic records before importing real data.
5. Configure backups, retention, access to deployment logs, incident response, and a way for authorized staff to fulfill privacy requests.

## Before real student records are used

- Have FCU’s Data Protection Officer review the privacy notice, lawful basis, access policy, retention period, hosting/data-processing terms, and breach procedure. The `/privacy` page is a template with institution-specific placeholders.
- Add institutional email verification and an approved password-reset process. Student accounts are intentionally not linked to grades until a teacher verifies and links the account to a roster entry.
- Set up a controlled process for issuing and rotating the teacher invitation code.
- Confirm approval for Vercel and Neon as processors and the selected hosting/database regions. Use least-privilege access and restrict production database credentials.
- Migrate legacy workbooks only through an approved, secure process. Do not commit workbooks, class lists, student numbers, grades, credentials, or database dumps to GitHub.
- Run a security and accessibility review, and check the exact grading rules against each course’s approved syllabus before publication.

## Notes on data migration

The legacy HTML page performs a local name search inside an uploaded workbook; it is not a multi-user database. This portal does not import the supplied workbooks automatically. Teachers can paste roster rows into a class using `Name, Student Number` lines. Assessment definitions and marks should be entered or migrated only after the institution approves the handling process and the conversion is reconciled against the source grade sheets.
