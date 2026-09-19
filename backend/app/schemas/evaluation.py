from pydantic import BaseModel


class EvaluationCriterionOut(BaseModel):
    criterion: str
    passed: bool | None
    notes: str


class EvaluationResultOut(BaseModel):
    run_id: str
    criteria: list[EvaluationCriterionOut]
    overall_score: float
