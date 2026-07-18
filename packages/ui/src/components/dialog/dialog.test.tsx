import { render, screen } from "@testing-library/react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
} from "./dialog";

describe("DialogContent", () => {
  it("labels its default close control through the `common` namespace (M0 §7)", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment terms</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("lets `closeLabel` override the default", () => {
    render(
      <Dialog open>
        <DialogContent closeLabel="ปิด">
          <DialogHeader>
            <DialogTitle>Payment terms</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "ปิด" })).toBeInTheDocument();
  });
});
