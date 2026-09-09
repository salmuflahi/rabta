import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ImageUtility } from "./image-utility";
import { SvgUtility } from "./svg-utility";
import { DownloadButton } from "./ui";

const exportBlob = vi.hoisted(() => vi.fn());
vi.mock("@/lib/export-file", () => ({ exportBlob }));
class WorkerStub {
  static instances: WorkerStub[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { WorkerStub.instances.push(this); }
  reply(data: unknown) { this.onmessage?.({ data }); }
}
beforeEach(() => {
  WorkerStub.instances = [];
  vi.stubGlobal("Worker", WorkerStub);
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:preview-${Math.random()}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); exportBlob.mockReset(); });

it("retains a valid image when another source fails, and cancels worker jobs", async () => {
  render(<ImageUtility tool="convert" />);
  expect(screen.getByRole("button", { name: "Convert image" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Choose source image"), { target: { files: [new File(["png"], "photo.png", { type: "image/png" })] } });
  await act(async () => WorkerStub.instances[0].reply({ ok: true, width: 30, height: 20, type: "png" }));
  expect(screen.getByText("photo.png")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Choose source image"), { target: { files: [new File(["broken"], "bad.png", { type: "image/png" })] } });
  await act(async () => WorkerStub.instances[1].reply({ ok: false, error: "Choose a valid image." }));
  expect(screen.getByRole("alert")).toHaveTextContent("Choose a valid image.");
  expect(screen.getByText("photo.png")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Convert image" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel processing" }));
  expect(WorkerStub.instances[2].terminate).toHaveBeenCalled();
  await act(async () => WorkerStub.instances[2].reply({ ok: true, blob: new Blob(["late"]), width: 30, height: 20 }));
  expect(screen.getByRole("status")).toHaveTextContent("Cancelled");
  expect(screen.queryByRole("button", { name: "Download image" })).not.toBeInTheDocument();
});

it("clears generated code when SVG settings change and exposes the correction inline", () => {
  render(<SvgUtility />);
  fireEvent.click(screen.getByRole("button", { name: "Generate code" }));
  expect(screen.getByLabelText("Generated React component")).toHaveTextContent("export function RabtaGraphic");
  fireEvent.change(screen.getByLabelText("Component name"), { target: { value: "bad-name" } });
  expect(screen.queryByLabelText("Generated React component")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Generate code" }));
  expect(screen.getByRole("alert")).toHaveTextContent("starting with a capital letter");
});

it("a cancelled save does not report a completed file", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["result"]) }));
  exportBlob.mockResolvedValue({ cancelled: true });
  render(<DownloadButton href="blob:result" download="result.png">Save PNG</DownloadButton>);
  fireEvent.click(screen.getByRole("button", { name: "Save PNG" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Save cancelled."));
  expect(screen.getByRole("button", { name: "Save PNG" })).toBeEnabled();
  expect(screen.queryByText("File saved.")).not.toBeInTheDocument();
});
