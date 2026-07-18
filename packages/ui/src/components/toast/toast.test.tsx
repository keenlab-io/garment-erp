import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "./toast";

function Trigger() {
  const { toast, jobToast } = useToast();
  return (
    <div>
      <button type="button" onClick={() => toast({ title: "Saved", tone: "success" })}>
        toast
      </button>
      <button
        type="button"
        onClick={() => {
          const job = jobToast({ title: "Generating" });
          (window as unknown as { __job: typeof job }).__job = job;
        }}
      >
        job
      </button>
    </div>
  );
}

describe("Toast", () => {
  it("shows a transient toast on demand", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "toast" }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("labels its dismiss control through the `common` namespace default (M0 §7)", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "toast" }));
    await screen.findByText("Saved");
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("resolves a job toast in place", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "job" }));
    expect(await screen.findByText("Generating")).toBeInTheDocument();
    const job = (window as unknown as { __job: { resolve: (o: object) => void } }).__job;
    act(() => job.resolve({ title: "Invoice ready", tone: "success" }));
    expect(await screen.findByText("Invoice ready")).toBeInTheDocument();
  });
});
