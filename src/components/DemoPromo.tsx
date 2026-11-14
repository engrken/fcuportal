import Link from "next/link";
import styles from "./DemoPromo.module.css";

export default function DemoPromo() {
  return <section className={styles.section} id="demo" aria-labelledby="saga-demo-title">
    <div className={styles.copy}>
      <span className={styles.eyebrow}>EXPLORE BEFORE YOU REGISTER</span>
      <h2 id="saga-demo-title">Test the Software</h2>
      <p>Get a feel for SAGA using fictional academic records. Try the teacher scorebook, student grade simulator, or platform administration preview—without signing up.</p>
      <Link href="/demo" className={styles.cta}>Launch interactive demo <span aria-hidden="true">→</span></Link>
      <small>Safe public tour · No account required · Nothing written to real school records</small>
    </div>
    <div className={styles.roles} aria-label="Available demo experiences">
      <Link href="/demo" className={styles.role}><span>▤</span><b>Teacher</b><small>Scores &amp; attendance</small></Link>
      <Link href="/demo" className={styles.role}><span>✦</span><b>Student</b><small>Grades &amp; simulation</small></Link>
      <Link href="/demo" className={styles.role}><span>▦</span><b>Administrator</b><small>Read-only tenant preview</small></Link>
    </div>
  </section>;
}
