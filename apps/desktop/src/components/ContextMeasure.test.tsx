import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ContextMeasure } from "./ContextMeasure";
import { RestoreReadiness } from "./RestoreReadiness";

describe("Meaningful context measures", () => {
  it("counts references without implying connectivity", () => {
    const { container } = render(<ContextMeasure items={[{id:"files",label:"3 files",count:3},{id:"tabs",label:"5 tabs",count:5}]} />);
    expect(screen.getByRole("img", {name:"8 saved references: 3 files, 5 tabs"})).toBeInTheDocument();
    expect(container.querySelectorAll(".measure-tick")).toHaveLength(8);
    expect(screen.queryByText(/reachable/)).not.toBeInTheDocument();
  });
  it("owns empty and bounded large-count states", () => {
    const { rerender, container } = render(<ContextMeasure items={[]} />);
    expect(screen.getByText("Capture a task to keep its context here.")).toBeInTheDocument();
    rerender(<ContextMeasure items={[{id:"tabs",label:"100 tabs",count:100}]} />);
    expect(container.querySelectorAll(".measure-tick")).toHaveLength(80);
    expect(screen.getByText("Grouped markers · exact totals below")).toBeInTheDocument();
  });
  it("represents actual tool availability separately", () => {
    const { container } = render(<RestoreReadiness tools={[{id:"editor",label:"Editor",ready:true},{id:"chrome",label:"Chrome",ready:false}]} />);
    expect(screen.getByRole("img",{name:/1 of 2 tools reachable now/})).toBeInTheDocument();
    expect(container.querySelectorAll(".is-ready")).toHaveLength(1);
    expect(container.querySelectorAll(".is-offline")).toHaveLength(1);
    expect(screen.getByText(/Restore results appear in your receipt/)).toBeInTheDocument();
  });
});
