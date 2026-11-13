export type GradeCategoryInput = { name: string; weight: number; conversionBase: number };

export const SAMPLE_CATEGORIES: GradeCategoryInput[] = [
  { name: "Design", weight: 20, conversionBase: 50 },
  { name: "Program Flow", weight: 30, conversionBase: 50 },
  { name: "Prototype", weight: 25, conversionBase: 50 },
  { name: "Activities", weight: 15, conversionBase: 50 },
  { name: "Attendance, Recitation & Participation", weight: 10, conversionBase: 50 }
];

/** First-level children share 100% of their root component. Deeper children
 * split the parent allocation using percentage points on that same scale. */
export const LECTURE_LAB_GRADING_TEMPLATE = [
  { key: "lecture", parentKey: null, name: "Lecture", weight: 60 },
  { key: "major-examinations", parentKey: "lecture", name: "Major Examinations", weight: 50 },
  { key: "prelim", parentKey: "major-examinations", name: "Prelim", weight: 10 },
  { key: "midterm", parentKey: "major-examinations", name: "Midterm", weight: 15 },
  { key: "finals", parentKey: "major-examinations", name: "Finals", weight: 25 },
  { key: "self-evaluation", parentKey: "lecture", name: "Self-Evaluation Exercises", weight: 25 },
  { key: "quizzes-assignments", parentKey: "lecture", name: "Quizzes/Assignments", weight: 15 },
  { key: "attendance-participation", parentKey: "lecture", name: "Attendance/Class Participation", weight: 10 },
  { key: "laboratory", parentKey: null, name: "Laboratory", weight: 40 },
  { key: "laboratory-exam", parentKey: "laboratory", name: "Laboratory Exam (Written/Practical)", weight: 50 },
  { key: "laboratory-exercise", parentKey: "laboratory", name: "Laboratory Exercise", weight: 50 }
] as const;

/** Lecture-only classes use the same internal allocation, with Lecture at 100%. */
export const LECTURE_ONLY_GRADING_TEMPLATE = LECTURE_LAB_GRADING_TEMPLATE
  .filter(category => category.key !== "laboratory" && category.parentKey !== "laboratory")
  .map(category => category.key === "lecture" ? { ...category, weight: 100 } : category);

/** Laboratory-only classes use Laboratory as the 100% course component. */
export const LABORATORY_ONLY_GRADING_TEMPLATE = LECTURE_LAB_GRADING_TEMPLATE
  .filter(category => category.key === "laboratory" || category.parentKey === "laboratory")
  .map(category => category.key === "laboratory" ? { ...category, weight: 100 } : category);

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
  assessments: Array<{
    title?: string;
    maxScore: number;
    weight?: number | null;
    scores: Array<{ points: number | null; remark?: string | null }>;
  }>;
};

export type GradeContribution = {
  categoryId: string;
  percent: number | null;
  courseWeight: number;
  earnedCourse: number | null;
  withinRootWeight: number;
  earnedWithinRoot: number | null;
  recordedItems: number;
  pendingItems: number;
  excusedItems: number;
};

const roundPercent = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const isRecorded = (assessment: GradeCalculationCategory["assessments"][number]) => {
  const score = assessment.scores[0];
  return !!score && (score.points !== null || (!!score.remark && score.remark !== "EXCUSED"));
};

const isAttendanceItem = (title?: string) => !!title && title.toLocaleLowerCase().startsWith("attendance ·");

/**
 * A blank score is pending (not a zero). ABSENT/DID_NOT_SUBMIT are recorded
 * zeros, while EXCUSED is omitted from the denominator. Category percentages
 * are based on recorded assessments until the class record is complete.
 *
 * Attendance must use an actual present/absent ratio, not the academic
 * grade-transmutation base used for quizzes and examinations.
 */
export function calculateCategoryPercent(category: Pick<GradeCalculationCategory, "conversionBase" | "assessments">) {
  const active = category.assessments.filter(assessment =>
    assessment.scores[0]?.remark !== "EXCUSED" && isRecorded(assessment)
  );
  if (!active.length) return null;
  const isAttendance = category.assessments.length > 0 && category.assessments.every(item => isAttendanceItem(item.title));
  const base = isAttendance ? 100 : category.conversionBase ?? 50;
  const transmute = (rawPercent: number) => convertRawPercent(rawPercent, base);
  const rawPoints = (assessment: GradeCalculationCategory["assessments"][number]) => {
    const score = assessment.scores[0];
    return score?.remark === "PRESENT" ? assessment.maxScore :
      score?.remark === "ABSENT" || score?.remark === "DID_NOT_SUBMIT" ? 0 : score?.points ?? 0;
  };
  if (category.assessments.some(assessment => assessment.weight !== null && assessment.weight !== undefined)) {
    const totalWeight = active.reduce((sum, assessment) => sum + (assessment.weight ?? 0), 0);
    if (!totalWeight) return null;
    const weighted = active.reduce((sum, assessment) => (
      sum + transmute(rawPoints(assessment) / assessment.maxScore * 100) * (assessment.weight ?? 0)
    ), 0);
    return roundPercent(weighted / totalWeight);
  }
  const possible = active.reduce((sum, assessment) => sum + assessment.maxScore, 0);
  const earned = active.reduce((sum, assessment) => sum + rawPoints(assessment), 0);
  return possible ? roundPercent(transmute(earned / possible * 100)) : null;
}

/**
 * The existing SAGA hierarchy uses percentage points on the root group's
 * 100-point scale: e.g. a 25% Lecture subcategory within Lecture 60% has
 * a maximum 15 percentage-point course contribution.
 *
 * Contributions and the course total both use 2-decimal rounding, so the
 * displayed category contributions always add up to the displayed total.
 */
export function calculateGradeBreakdown(categories: GradeCalculationCategory[]) {
  const byId = new Map(categories.map(category => [category.id, category]));
  const withChildren = new Set(categories.filter(category => category.parentId).map(category => category.parentId));
  const items: GradeContribution[] = [];
  for (const category of categories) {
    if (withChildren.has(category.id)) continue;
    let root = category;
    const visited = new Set([category.id]);
    let valid = true;
    while (root.parentId) {
      if (visited.has(root.parentId) || !byId.has(root.parentId)) { valid = false; break; }
      visited.add(root.parentId);
      root = byId.get(root.parentId)!;
    }
    if (!valid) continue;
    const courseWeight = category.id === root.id ? root.weight : root.weight * category.weight / 100;
    const withinRootWeight = category.id === root.id ? root.weight : category.weight;
    const inheritedBase = category.parentId ? byId.get(category.parentId)?.conversionBase : category.conversionBase;
    const percent = calculateCategoryPercent({ conversionBase: inheritedBase ?? 50, assessments: category.assessments });
    items.push({
      categoryId: category.id,
      percent,
      courseWeight: roundPercent(courseWeight),
      earnedCourse: percent === null ? null : roundPercent(percent * courseWeight / 100),
      withinRootWeight: roundPercent(withinRootWeight),
      earnedWithinRoot: percent === null ? null : roundPercent(percent * withinRootWeight / 100),
      recordedItems: category.assessments.filter(isRecorded).length,
      pendingItems: category.assessments.filter(assessment => assessment.scores[0]?.remark !== "EXCUSED" && !isRecorded(assessment)).length,
      excusedItems: category.assessments.filter(assessment => assessment.scores[0]?.remark === "EXCUSED").length
    });
  }
  const recorded = items.filter(item => item.earnedCourse !== null);
  return {
    items,
    totalPercent: recorded.length ? roundPercent(recorded.reduce((total, item) => total + (item.earnedCourse ?? 0), 0)) : null
  };
}

export function calculateFinal(categories: GradeCalculationCategory[]) {
  return calculateGradeBreakdown(categories).totalPercent;
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
