"use client";

import { useMemo } from "react";
import { calculateGradeBreakdown } from "@/lib/grades";

type GradeCategory = {
  id: string; parentId: string | null; name: string; weight: number; conversionBase: number;
};
type GradeAssessment = {
  id: string; categoryId: string; title: string; maxScore: number; weight: number | null;
};
type RecordedScore = {
  assessmentId: string; points: number | null; remark: string | null;
};
type Props = {
  categories: GradeCategory[];
  assessments: GradeAssessment[];
  scores: RecordedScore[];
  remark: string | null;
};

export default function GradeContributionPanel({ categories, assessments, scores, remark }: Props) {
  const breakdown = useMemo(() => calculateGradeBreakdown(categories.map(category => ({
    id: category.id,
    parentId: category.parentId,
    weight: category.weight,
    conversionBase: category.conversionBase,
    assessments: assessments.filter(item => item.categoryId === category.id).map(item => ({
      title: item.title,
      maxScore: item.maxScore,
      weight: item.weight,
      scores: scores.filter(score => score.assessmentId === item.id)
    }))
  }))), [categories, assessments, scores]);
  const byId = new Map(categories.map(category => [category.id, category]));
  const pathFor = (category: GradeCategory) => {
    const names: string[] = [category.name];
    const visited = new Set([category.id]);
    let parent = category.parentId ? byId.get(category.parentId) : undefined;
    while (parent && !visited.has(parent.id)) {
      visited.add(parent.id);
      names.unshift(parent.name);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return names.join(" / ");
  };
  const rootFor = (category: GradeCategory) => {
    let root = category;
    const visited = new Set([root.id]);
    while (root.parentId && byId.has(root.parentId) && !visited.has(root.parentId)) {
      root = byId.get(root.parentId)!;
      visited.add(root.id);
    }
    return root;
  };

  if (["INC", "NP", "DROPPED"].includes(remark || "")) {
    return <div className="earned-course-summary"><strong>Earned course weight</strong><span>Not displayed for {remark} class remarks.</span></div>;
  }

  return <div className="earned-course-summary">
    <div className="earned-course-title">
      <strong>Earned course weight</strong>
      <span>{breakdown.totalPercent === null ? "No recorded assessments" : `${breakdown.totalPercent.toFixed(2)} / 100.00% course total`}</span>
    </div>
    <div className="earned-course-items">
      {breakdown.items.filter(item => item.courseWeight > 0).map(item => {
        const category = byId.get(item.categoryId);
        if (!category) return null;
        const root = rootFor(category);
        return <div className="earned-course-item" key={item.categoryId} title={`${item.recordedItems} recorded · ${item.pendingItems} pending · ${item.excusedItems} excused`}>
          <span className="earned-course-name">{pathFor(category)}</span>
          <b>{item.earnedCourse === null ? "—" : item.earnedCourse.toFixed(2)} / {item.courseWeight.toFixed(2)}% <small>of course</small></b>
          {root.id !== category.id && <small>{item.earnedWithinRoot === null ? "—" : item.earnedWithinRoot.toFixed(2)} / {item.withinRootWeight.toFixed(2)}% within {root.name}</small>}
          {item.pendingItems > 0 && <small className="earned-course-pending">{item.recordedItems} recorded · {item.pendingItems} pending</small>}
        </div>;
      })}
    </div>
    <small className="earned-course-footnote">Earned weight uses the category's recorded scores and grading base. Pending scores are excluded; excused scores do not count. The numbers above sum to the course total.</small>
  </div>;
}
