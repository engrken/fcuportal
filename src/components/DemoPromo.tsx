import Link from "next/link";
import styles from "./DemoPromo.module.css";

export default function DemoPromo() {
  return <section className={styles.section} id="demo" aria-labelledby="saga-demo-title">
    <div className={styles.copy}>
      <span className={styles.eyebrow}>EXPLORE BEFORE YOU REGISTER</span>
      <h2 id="saga-demo-title">Test the Software</h2>
      <p>Get a feel for SAGA using fictional academic records. Open the actual Teacher or Student portal, with its real navigation, class records, attendance, grade calculations, and student simulation—all using fictional records.</p>
      <Link href="/demo" className={styles.cta}>Explore the real portal <span aria-hidden="true">→</span></Link>
      <small>Read-only authentic portal · No account required · No changes to academic records</small>
    </div>
    <div className={styles.roles} aria-label="Available demo experiences">
      <Link href="/demo" className={styles.role}><span>▤</span><b>Teacher</b><small>Scores &amp; attendance</small></Link>
      <Link href="/demo" className={styles.role}><span>✦</span><b>Student</b><small>Grades &amp; simulation</small></Link>
      <Link href="/demo/practice" className={styles.role}><span>▦</span><b>Practice</b><small>Separate editable simulator</small></Link>
    </div>
  </section>;
}
