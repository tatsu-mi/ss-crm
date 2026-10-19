import { Base, Command, Workspace, inactive } from "./model";
import { forms, newRow } from "./forms";

export function projectCopyDefaults(w: Workspace, sourceId: string) {
  const assignment = w.project_engineers.find(
    (a) => a.project_id === sourceId && !inactive(a),
  );
  const period = w.contract_periods
    .filter((p) => p.project_engineer_id === assignment?.id && !inactive(p))
    .sort((a, b) => b.starts_on.localeCompare(a.starts_on))[0];
  return {
    engineerId: w.engineers.some(
      (e) => e.id === assignment?.engineer_id && !inactive(e),
    )
      ? assignment!.engineer_id
      : "",
    period: period
      ? newRow(
          "contract_periods",
          Object.fromEntries(
            forms.contract_periods.fields
              .filter((f) => f.key !== "project_engineer_id")
              .map((f) => [
                f.key,
                f.key === "renewal_status" ? "pending" : period[f.key],
              ]),
          ),
        )
      : null,
  };
}

export function projectCopyCommand(
  row: Base,
  engineerId: string,
  period: Base | null,
): Command {
  if (period && !engineerId)
    throw new Error("契約期間を複製するエンジニアを選択してください。");
  const commands: Command[] = [
    { kind: "save", table: "projects", row, expected_version: 0 },
  ];
  if (engineerId) {
    const assignment = newRow("project_engineers", {
      project_id: row.id,
      engineer_id: engineerId,
    });
    commands.push({
      kind: "save",
      table: "project_engineers",
      row: assignment,
      expected_version: 0,
    });
    if (period)
      commands.push({
        kind: "save",
        table: "contract_periods",
        row: newRow("contract_periods", {
          ...Object.fromEntries(
            forms.contract_periods.fields.map((f) => [f.key, period[f.key]]),
          ),
          project_engineer_id: assignment.id,
        }),
        expected_version: 0,
      });
  }
  return { kind: "batch", commands };
}
