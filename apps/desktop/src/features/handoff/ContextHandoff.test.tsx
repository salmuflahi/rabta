import { it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContextHandoff } from "./ContextHandoff";
import type { Task, TaskResource } from "@/store";
const task: Task = {
  id: "t",
  projectId: "p",
  title: "Reconnect",
  status: "open",
  createdAt: "2026-09-07",
  updatedAt: "2026-09-07",
};
const resources: TaskResource[] = [
  {
    id: "r",
    taskId: "t",
    connectorKind: "git",
    resourceType: "git",
    createdAt: "2026-09-07",
    payload: { branch: "feat/reconnect" },
  },
];
it("copies the reviewed selection and gives explicit success feedback", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(<ContextHandoff task={task} resources={resources} />);
  fireEvent.click(screen.getByRole("button", { name: "Use context" }));
  fireEvent.change(screen.getByLabelText("What should happen next?"), {
    target: { value: "Review the reconnect logic" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Git branch" }));
  fireEvent.click(screen.getByRole("button", { name: "Copy brief" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible(),
  );
  expect(writeText.mock.calls[0][0]).toContain("Review the reconnect logic");
  expect(writeText.mock.calls[0][0]).not.toContain("feat/reconnect");
});
it("keeps the brief usable when clipboard access fails", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });
  render(<ContextHandoff task={task} resources={resources} />);
  fireEvent.click(screen.getByRole("button", { name: "Use context" }));
  fireEvent.click(screen.getByRole("button", { name: "Copy brief" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Clipboard unavailable",
    ),
  );
  expect(screen.getByLabelText("Your brief")).toHaveFocus();
  expect(screen.getByRole("button", { name: "Copy brief" })).toBeEnabled();
});
