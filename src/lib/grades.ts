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

export type GradeCalculationCategory = {
  id: string;
  parentId?: string | null;
  weight: number;
  conversionBase?: number;
  assessments: Array<{ maxScore: number; weight?: number | null; scores: Array<{ points: number | null }> }>;
};

export function calculateFinal(categories: GradeCalculationCategory[]) {
  if (!categories.some(category => category.assessments.length > 0 && category.assessments.some(assessment => assessment.scores.some(score => score.points !== null)))) return null;
  const childrenByParent = new Map<string | null, GradeCalculationCategory[]>();
  for (const category of categories) {
    const parentId = category.parentId ?? null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(category);
    childrenByParent.set(parentId, siblings);
  }

  const calculateCategory = (category: GradeCalculationCategory, path = new Set<string>()): number | null => {
    if (path.has(category.id)) return null;
    const nextPath = new Set(path).add(category.id);
    const children = childrenByParent.get(category.id) ?? [];
    if (children.length) {
      return children.reduce((sum, child) => sum + (calculateCategory(child, nextPath) ?? 0) * child.weight / 100, 0);
    }
    if (!category.assessments.length) return 0;
    const base = category.conversionBase ?? 0;
    if (category.assessments.some(assessment => assessment.weight !== null && assessment.weight !== undefined)) {
      return category.assessments.reduce((sum, assessment) => {
        const points = assessment.scores.find(score => score.points !== null)?.points ?? 0;
        const percent = base + (points / assessment.maxScore) * (100 - base);
        return sum + percent * (assessment.weight ?? 0) / 100;
      }, 0);
    }
    const possible = category.assessments.reduce((sum, assessment) => sum + assessment.maxScore, 0);
    const earned = category.assessments.reduce((sum, assessment) => sum + (assessment.scores.find(score => score.points !== null)?.points ?? 0), 0);
    return possible ? base + (earned / possible) * (100 - base) : 0;
  };

  const result = (childrenByParent.get(null) ?? []).reduce((sum, category) => sum + (calculateCategory(category) ?? 0) * category.weight / 100, 0);
  return Math.round(result * 100) / 100;
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
