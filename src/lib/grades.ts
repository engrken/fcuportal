export type GradeCategoryInput = { name: string; weight: number; conversionBase: number };

export const SAMPLE_CATEGORIES: GradeCategoryInput[] = [
  { name: "Design", weight: 20, conversionBase: 30 },
  { name: "Program Flow", weight: 30, conversionBase: 30 },
  { name: "Prototype", weight: 25, conversionBase: 30 },
  { name: "Activities", weight: 15, conversionBase: 30 },
  { name: "Attendance, Recitation & Participation", weight: 10, conversionBase: 0 }
];

export const SAMPLE_GRADE_BANDS = [
  { minPercent: 98, finalGrade: "1.00", remarks: "Passed" }, { minPercent: 95, finalGrade: "1.25", remarks: "Passed" },
  { minPercent: 92, finalGrade: "1.50", remarks: "Passed" }, { minPercent: 89, finalGrade: "1.75", remarks: "Passed" },
  { minPercent: 86, finalGrade: "2.00", remarks: "Passed" }, { minPercent: 83, finalGrade: "2.25", remarks: "Passed" },
  { minPercent: 80, finalGrade: "2.50", remarks: "Passed" }, { minPercent: 77, finalGrade: "2.75", remarks: "Passed" },
  { minPercent: 75, finalGrade: "3.00", remarks: "Passed" }, { minPercent: 0, finalGrade: "5.00", remarks: "Failed" }
];

export function calculateFinal(categories: Array<{ weight: number; conversionBase?: number; assessments: Array<{ maxScore: number; scores: Array<{ points: number | null }> }> }>) {
  let weightedTotal = 0;
  let availableWeight = 0;
  for (const category of categories) {
    const assessed = category.assessments.filter(a => a.maxScore > 0 && a.scores.some(s => s.points !== null));
    if (!assessed.length) continue;
    const possible = assessed.reduce((sum, a) => sum + a.maxScore, 0);
    const earned = assessed.reduce((sum, a) => sum + (a.scores[0]?.points ?? 0), 0);
    const base = category.conversionBase ?? 0;
    const convertedPercent = base + (earned / possible) * (100 - base);
    weightedTotal += convertedPercent * category.weight / 100;
    availableWeight += category.weight;
  }
  return availableWeight ? Math.round((weightedTotal / (availableWeight / 100)) * 100) / 100 : null;
}

export function defaultEquivalent(percent: number | null) {
  if (percent === null) return { finalGrade: null, remarks: "Not yet graded" };
  const bands = [98, 95, 92, 89, 86, 83, 80, 77, 75];
  const grades = ["1.00", "1.25", "1.50", "1.75", "2.00", "2.25", "2.50", "2.75", "3.00"];
  const index = bands.findIndex(b => percent >= b);
  return { finalGrade: index < 0 ? "5.00" : grades[index], remarks: percent >= 75 ? "Passed" : "Failed" };
}

export function equivalentFromBands(percent: number | null, bands: Array<{ minPercent: number; finalGrade: string; remarks: string }>) {
  if (percent === null) return { finalGrade: null, remarks: "Not yet graded" };
  const match = [...bands].sort((a, b) => b.minPercent - a.minPercent).find(b => percent >= b.minPercent);
  return match ? { finalGrade: match.finalGrade, remarks: match.remarks } : defaultEquivalent(percent);
}
